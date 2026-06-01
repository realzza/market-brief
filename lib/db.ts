import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { LEGACY_HANDLE } from './analysts';
import type { Digest, DigestItem } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'serenity.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  migrate(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      like_count INTEGER DEFAULT 0,
      retweet_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      impression_count INTEGER DEFAULT 0,
      fetched_at TEXT NOT NULL,
      media_urls TEXT NOT NULL DEFAULT '[]',
      author TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT 'x',
      link_card TEXT
    );

    CREATE TABLE IF NOT EXISTS tweet_analysis (
      tweet_id TEXT PRIMARY KEY REFERENCES tweets(id),
      sentiment TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      sentiment_reasoning TEXT,
      tickers TEXT NOT NULL DEFAULT '[]',
      signals TEXT NOT NULL DEFAULT '[]',
      key_themes TEXT NOT NULL DEFAULT '[]',
      domains TEXT NOT NULL DEFAULT '[]',
      risk_level TEXT NOT NULL DEFAULT 'none',
      is_trade_call INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      image_insights TEXT,
      analyzed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT NOT NULL REFERENCES tweets(id),
      asset TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL,
      target_price REAL,
      stop_loss_price REAL,
      signal_date TEXT NOT NULL,
      outcome TEXT DEFAULT 'pending',
      actual_return_pct REAL,
      notes TEXT,
      updated_at TEXT NOT NULL
    );

    -- Daily digest: one row per generated morning brief. Brand-new table, so
    -- it lives entirely in initSchema (no migrate backfill needed). The items
    -- column holds the ranked DigestItem list as JSON; input/output token
    -- counts are stored so the cost saving vs. per-post analysis is observable.
    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end   TEXT NOT NULL,
      post_count   INTEGER NOT NULL,
      headline TEXT NOT NULL,
      summary  TEXT NOT NULL,
      items    TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      input_tokens  INTEGER,
      output_tokens INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_digests_generated ON digests(generated_at DESC);
    -- NOTE: the idx_tweets_author index is intentionally NOT created here.
    -- initSchema runs before migrate(), and on a pre-existing database the
    -- CREATE TABLE above is a no-op so it will not add the author column to an
    -- existing table. Indexing tweets(author) here would throw no such
    -- column author and abort getDb() before migrate() can add it. The
    -- index is created in migrate() instead, after the column is guaranteed
    -- to exist.
    CREATE INDEX IF NOT EXISTS idx_analysis_sentiment ON tweet_analysis(sentiment);
    CREATE INDEX IF NOT EXISTS idx_performance_outcome ON performance(outcome);
    -- Required for upsertPerformance's "ON CONFLICT DO NOTHING" to actually
    -- fire — without a UNIQUE constraint SQLite has nothing to conflict on,
    -- and re-running the backfill / re-analyzing a tweet would create
    -- duplicate rows. (tweet_id, asset) is the natural key because one tweet
    -- can legitimately hold multiple trade calls on different symbols.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_tweet_asset ON performance(tweet_id, asset);
  `);
}

function migrate(db: Database.Database) {
  // Add domains column to existing databases that don't have it
  const analysisCols = (db.prepare("PRAGMA table_info(tweet_analysis)").all() as Array<{ name: string }>).map(c => c.name);
  if (!analysisCols.includes('domains')) {
    db.exec("ALTER TABLE tweet_analysis ADD COLUMN domains TEXT NOT NULL DEFAULT '[]'");
  }
  const tweetCols = (db.prepare("PRAGMA table_info(tweets)").all() as Array<{ name: string }>).map(c => c.name);
  if (!tweetCols.includes('media_urls')) {
    db.exec("ALTER TABLE tweets ADD COLUMN media_urls TEXT NOT NULL DEFAULT '[]'");
  }
  // Author column for multi-analyst support. Databases that predate it hold
  // tweets from the single original analyst, so backfill empty/null authors to
  // the legacy handle rather than leaving them unattributed.
  if (!tweetCols.includes('author')) {
    db.exec("ALTER TABLE tweets ADD COLUMN author TEXT NOT NULL DEFAULT ''");
  }
  db.prepare("UPDATE tweets SET author = ? WHERE author IS NULL OR author = ''").run(LEGACY_HANDLE);
  db.exec('CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author)');
  // Platform column for Truth Social support. Every pre-existing row is an X
  // post, so the 'x' default backfills them correctly with no extra UPDATE.
  if (!tweetCols.includes('platform')) {
    db.exec("ALTER TABLE tweets ADD COLUMN platform TEXT NOT NULL DEFAULT 'x'");
  }
  // Link-preview card (JSON, nullable). Older rows simply have no card; the
  // column is left NULL and serializeTweetRow treats absence as "no preview".
  if (!tweetCols.includes('link_card')) {
    db.exec("ALTER TABLE tweets ADD COLUMN link_card TEXT");
  }
  // Image-insights column. Older rows had the image description glued onto
  // the front of the `summary` string as `[Images: …] `; lift those into the
  // new column and clean the summary so the brief / card render cleanly.
  // Idempotent — once a row's image_insights is populated it's skipped.
  if (!analysisCols.includes('image_insights')) {
    db.exec("ALTER TABLE tweet_analysis ADD COLUMN image_insights TEXT");
    const rows = db.prepare(
      "SELECT tweet_id, summary FROM tweet_analysis WHERE summary LIKE '[Image%'"
    ).all() as Array<{ tweet_id: string; summary: string | null }>;
    const update = db.prepare(
      "UPDATE tweet_analysis SET image_insights = @insights, summary = @summary WHERE tweet_id = @tweet_id"
    );
    const re = /^\s*\[Images?:\s*([\s\S]*?)\]\s*/i;
    const apply = db.transaction((items: typeof rows) => {
      for (const row of items) {
        if (!row.summary) continue;
        const m = row.summary.match(re);
        if (!m) continue;
        update.run({
          tweet_id: row.tweet_id,
          insights: m[1].trim() || null,
          summary: row.summary.slice(m[0].length).trim(),
        });
      }
    });
    apply(rows);
  }

  // Performance UNIQUE index — added retroactively for databases that pre-
  // date the auto-pipeline. Without it, the upsert's ON CONFLICT clause was
  // a no-op and re-running the analyze pipeline would duplicate rows.
  // CREATE UNIQUE INDEX IF NOT EXISTS is also in initSchema; this is the
  // path for databases that already had `performance` but not the index.
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_tweet_asset ON performance(tweet_id, asset)'
  );
}

export function saveTweets(tweets: Array<{
  id: string; text: string; created_at: string;
  like_count: number; retweet_count: number; reply_count: number;
  impression_count: number; fetched_at: string; media_urls: string;
  author: string; platform: string; link_card: string | null;
}>): { inserted: number; updated: number } {
  const db = getDb();
  if (tweets.length === 0) return { inserted: 0, updated: 0 };

  // Count how many of the incoming IDs already exist so we can report
  // accurate "new" vs "updated" counts. INSERT OR REPLACE alone can't tell
  // these apart because it always returns changes=1 per row.
  const ids = tweets.map((t) => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const existing = (
    db.prepare(`SELECT COUNT(*) AS n FROM tweets WHERE id IN (${placeholders})`).get(...ids) as { n: number }
  ).n;
  const inserted = tweets.length - existing;
  const updated = existing;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO tweets (id, text, created_at, like_count, retweet_count, reply_count, impression_count, fetched_at, media_urls, author, platform, link_card)
    VALUES (@id, @text, @created_at, @like_count, @retweet_count, @reply_count, @impression_count, @fetched_at, @media_urls, @author, @platform, @link_card)
  `);
  const insertMany = db.transaction((rows: typeof tweets) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(tweets);

  return { inserted, updated };
}

export function saveAnalysis(analysis: {
  tweet_id: string; sentiment: string; sentiment_score: number;
  sentiment_reasoning: string; tickers: string; signals: string;
  key_themes: string; domains: string; risk_level: string;
  is_trade_call: number; summary: string;
  image_insights: string | null;
  analyzed_at: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO tweet_analysis
    (tweet_id, sentiment, sentiment_score, sentiment_reasoning, tickers, signals, key_themes, domains, risk_level, is_trade_call, summary, image_insights, analyzed_at)
    VALUES (@tweet_id, @sentiment, @sentiment_score, @sentiment_reasoning, @tickers, @signals, @key_themes, @domains, @risk_level, @is_trade_call, @summary, @image_insights, @analyzed_at)
  `).run(analysis);
}

export function getTweets(limit = 50, offset = 0): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, a.sentiment, a.sentiment_score, a.sentiment_reasoning,
           a.tickers, a.signals, a.key_themes, a.domains, a.risk_level,
           a.is_trade_call, a.summary, a.image_insights, a.analyzed_at
    FROM tweets t
    LEFT JOIN tweet_analysis a ON t.id = a.tweet_id
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<Record<string, unknown>>;
}

export function getTweetForAnalysis(id: string): Record<string, unknown> | null {
  const db = getDb();
  return (db.prepare(
    'SELECT id, text, created_at, media_urls FROM tweets WHERE id = ?'
  ).get(id) as Record<string, unknown>) ?? null;
}

export function getUnanalyzedTweets(limit = 20): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(`
    SELECT t.id, t.text, t.created_at, t.media_urls FROM tweets t
    LEFT JOIN tweet_analysis a ON t.id = a.tweet_id
    WHERE a.tweet_id IS NULL
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
}

export function getStats(): Record<string, unknown> {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM tweets').get() as { count: number }).count;
  const analyzed = (db.prepare('SELECT COUNT(*) as count FROM tweet_analysis').get() as { count: number }).count;
  const sentiments = db.prepare(`
    SELECT sentiment, COUNT(*) as count FROM tweet_analysis GROUP BY sentiment
  `).all() as Array<{ sentiment: string; count: number }>;
  const tradeCalls = (db.prepare('SELECT COUNT(*) as count FROM tweet_analysis WHERE is_trade_call = 1').get() as { count: number }).count;
  const avgScore = (db.prepare('SELECT AVG(sentiment_score) as avg FROM tweet_analysis').get() as { avg: number | null }).avg;

  // Count tickers purely from raw tweet text — no join with analysis results
  const TICKER_RE = /\$([A-Z]{1,6}(?:[-][A-Z]{1,4})?)\b/g;
  const allTexts = db.prepare('SELECT text FROM tweets').all() as Array<{ text: string }>;
  const tickerCount: Record<string, number> = {};
  for (const row of allTexts) {
    TICKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TICKER_RE.exec(row.text)) !== null) {
      tickerCount[m[1]] = (tickerCount[m[1]] || 0) + 1;
    }
  }
  const topTickers = Object.entries(tickerCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([ticker, count]) => ({ ticker, count, asset_type: 'unknown' }));

  const allDomains = db.prepare("SELECT domains FROM tweet_analysis WHERE domains != '[]'").all() as Array<{ domains: string }>;
  const domainCount: Record<string, number> = {};
  for (const row of allDomains) {
    try {
      const domains = JSON.parse(row.domains) as string[];
      for (const d of domains) domainCount[d] = (domainCount[d] || 0) + 1;
    } catch {}
  }
  const topDomains = Object.entries(domainCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const sentimentMap: Record<string, number> = {};
  for (const s of sentiments) sentimentMap[s.sentiment] = s.count;

  return {
    total_tweets: total,
    analyzed_tweets: analyzed,
    bullish_count: sentimentMap['bullish'] || 0,
    bearish_count: sentimentMap['bearish'] || 0,
    neutral_count: sentimentMap['neutral'] || 0,
    mixed_count: sentimentMap['mixed'] || 0,
    trade_calls: tradeCalls,
    top_tickers: topTickers,
    top_domains: topDomains,
    avg_sentiment_score: avgScore ?? 0,
    win_rate: getWinRate(),
  };
}

// Win rate over CLOSED entries in the performance table. Excludes 'pending'
// because the dashboard already exposes "open" separately. Returns null when
// no trades have closed yet — the consumer renders "—" in that case.
function getWinRate(): number | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT
       SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins,
       SUM(CASE WHEN outcome IN ('win', 'loss', 'breakeven') THEN 1 ELSE 0 END) AS closed
     FROM performance`,
  ).get() as { wins: number | null; closed: number | null };
  if (!row.closed || row.closed === 0) return null;
  return (row.wins ?? 0) / row.closed;
}

export function getPerformance(): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, t.text as tweet_text, t.created_at as tweet_date
    FROM performance p
    JOIN tweets t ON p.tweet_id = t.id
    ORDER BY p.signal_date DESC
  `).all() as Array<Record<string, unknown>>;
}

export function upsertPerformance(entry: {
  tweet_id: string; asset: string; direction: string;
  entry_price?: number; target_price?: number; stop_loss_price?: number;
  signal_date: string; outcome?: string; actual_return_pct?: number;
  notes?: string; updated_at: string;
}) {
  const db = getDb();
  // Nullify undefined numerics — better-sqlite3 won't bind `undefined`, and
  // re-running this with optional prices missing should still insert a row.
  db.prepare(`
    INSERT INTO performance (tweet_id, asset, direction, entry_price, target_price, stop_loss_price, signal_date, outcome, actual_return_pct, notes, updated_at)
    VALUES (@tweet_id, @asset, @direction, @entry_price, @target_price, @stop_loss_price, @signal_date, @outcome, @actual_return_pct, @notes, @updated_at)
    ON CONFLICT(tweet_id, asset) DO NOTHING
  `).run({
    outcome: 'pending',
    entry_price: null,
    target_price: null,
    stop_loss_price: null,
    actual_return_pct: null,
    notes: null,
    ...entry,
  });
}

/** All trade-call analyses, shaped for the performance backfill. */
export function getAnalyzedTradeCalls(): Array<Record<string, unknown>> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.id AS tweet_id, t.created_at,
           a.sentiment, a.sentiment_score, a.sentiment_reasoning,
           a.tickers, a.signals, a.key_themes, a.domains, a.risk_level,
           a.is_trade_call, a.summary, a.image_insights, a.analyzed_at
    FROM tweets t
    JOIN tweet_analysis a ON t.id = a.tweet_id
    WHERE a.is_trade_call = 1
  `).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    tweet_id: r.tweet_id,
    created_at: r.created_at,
    analysis: {
      tweet_id: r.tweet_id,
      sentiment: r.sentiment,
      sentiment_score: r.sentiment_score,
      sentiment_reasoning: r.sentiment_reasoning,
      tickers: r.tickers ? JSON.parse(r.tickers as string) : [],
      signals: r.signals ? JSON.parse(r.signals as string) : [],
      key_themes: r.key_themes ? JSON.parse(r.key_themes as string) : [],
      domains: r.domains ? JSON.parse(r.domains as string) : [],
      risk_level: r.risk_level,
      is_trade_call: r.is_trade_call === 1,
      summary: r.summary,
      image_insights: r.image_insights ?? null,
      analyzed_at: r.analyzed_at,
    },
  }));
}

/** Performance entries that haven't resolved yet — the outcome refresh loop's input. */
export function getPendingPerformanceEntries(): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM performance WHERE outcome = 'pending' OR outcome IS NULL`,
  ).all() as Array<Record<string, unknown>>;
}

/**
 * Mark one performance entry as resolved. Caller computes the return %. The
 * optional `entry_price` is written via COALESCE so a Claude-extracted entry
 * (when present) stays authoritative — the synthetic value only fills in the
 * gap when the DB column is currently null.
 */
export function updatePerformanceOutcome(
  id: number,
  outcome: 'win' | 'loss' | 'breakeven',
  actual_return_pct: number,
  entry_price?: number | null,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE performance
       SET outcome = @outcome,
           actual_return_pct = @actual_return_pct,
           entry_price = COALESCE(entry_price, @entry_price),
           updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id,
    outcome,
    actual_return_pct,
    entry_price: entry_price ?? null,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Update running P&L on a still-pending entry. Doesn't touch `outcome`
 * (stays pending). Optionally back-fills entry_price via COALESCE so the
 * synthetic-from-tweet-time entry is persisted once on the first cron tick
 * and never overwrites a Claude-extracted level.
 *
 * `WHERE outcome = 'pending' OR outcome IS NULL` guards against a straggling
 * tick overwriting a row that resolved between read and update.
 */
export function updatePerformanceRunning(
  id: number,
  actual_return_pct: number,
  entry_price?: number | null,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE performance
       SET actual_return_pct = @actual_return_pct,
           entry_price = COALESCE(entry_price, @entry_price),
           updated_at = @updated_at
     WHERE id = @id
       AND (outcome = 'pending' OR outcome IS NULL)`,
  ).run({
    id,
    actual_return_pct,
    entry_price: entry_price ?? null,
    updated_at: new Date().toISOString(),
  });
}

// ─── Digest ────────────────────────────────────────────────────────────────

/** Raw posts whose created_at falls in [startIso, endIso), newest first. Feeds
 *  the digest builder — text only, no analysis join (the digest reads raw
 *  text). */
export function getPostsInWindow(
  startIso: string,
  endIso: string,
): Array<{ id: string; text: string; created_at: string; author: string; platform: string }> {
  const db = getDb();
  return db.prepare(`
    SELECT id, text, created_at, author, platform
    FROM tweets
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at DESC
  `).all(startIso, endIso) as Array<{
    id: string; text: string; created_at: string; author: string; platform: string;
  }>;
}

/** Single tweet + its analysis, shaped exactly like a getTweets() row so the
 *  caller can run it straight through serializeTweetRow. Null when not found. */
export function getTweetWithAnalysis(id: string): Record<string, unknown> | null {
  const db = getDb();
  return (db.prepare(`
    SELECT t.*, a.sentiment, a.sentiment_score, a.sentiment_reasoning,
           a.tickers, a.signals, a.key_themes, a.domains, a.risk_level,
           a.is_trade_call, a.summary, a.image_insights, a.analyzed_at
    FROM tweets t
    LEFT JOIN tweet_analysis a ON t.id = a.tweet_id
    WHERE t.id = ?
  `).get(id) as Record<string, unknown>) ?? null;
}

/** Persist a freshly built digest. Returns the new row id. */
export function saveDigest(digest: {
  generated_at: string;
  window_start: string;
  window_end: string;
  post_count: number;
  headline: string;
  summary: string;
  items: DigestItem[];
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}): number {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO digests
      (generated_at, window_start, window_end, post_count, headline, summary, items, model, input_tokens, output_tokens, created_at)
    VALUES
      (@generated_at, @window_start, @window_end, @post_count, @headline, @summary, @items, @model, @input_tokens, @output_tokens, @created_at)
  `).run({
    ...digest,
    items: JSON.stringify(digest.items),
    created_at: new Date().toISOString(),
  });
  return Number(info.lastInsertRowid);
}

/**
 * When the most recent post-fetch wrote to the DB (max fetched_at). Durable and
 * process-independent — unlike the scheduler's in-memory lastFetchAt, which in
 * Next dev lives in a different module instance than the route reading it. Null
 * before any post has been fetched.
 */
export function getLastFetchTime(): string | null {
  const db = getDb();
  const row = db.prepare('SELECT MAX(fetched_at) AS t FROM tweets').get() as { t: string | null };
  return row.t ?? null;
}

/** The most recent digest, items parsed. Null when none have been generated. */
export function getLatestDigest(): Digest | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM digests ORDER BY generated_at DESC LIMIT 1',
  ).get() as Record<string, unknown> | undefined;
  if (!row) return null;
  let items: DigestItem[] = [];
  try { items = JSON.parse(String(row.items ?? '[]')) as DigestItem[]; } catch {}
  return {
    id: Number(row.id),
    generated_at: String(row.generated_at),
    window_start: String(row.window_start),
    window_end: String(row.window_end),
    post_count: Number(row.post_count ?? 0),
    headline: String(row.headline ?? ''),
    summary: String(row.summary ?? ''),
    items,
    model: row.model == null ? null : String(row.model),
    input_tokens: row.input_tokens == null ? null : Number(row.input_tokens),
    output_tokens: row.output_tokens == null ? null : Number(row.output_tokens),
    created_at: String(row.created_at),
  };
}

export function getSentimentTimeline(days = 30): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(`
    SELECT DATE(t.created_at) as date,
           AVG(a.sentiment_score) as avg_score,
           COUNT(*) as tweet_count,
           SUM(CASE WHEN a.sentiment = 'bullish' THEN 1 ELSE 0 END) as bullish,
           SUM(CASE WHEN a.sentiment = 'bearish' THEN 1 ELSE 0 END) as bearish,
           SUM(CASE WHEN a.sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral
    FROM tweets t
    JOIN tweet_analysis a ON t.id = a.tweet_id
    WHERE t.created_at >= datetime('now', '-${days} days')
    GROUP BY DATE(t.created_at)
    ORDER BY date ASC
  `).all() as Array<Record<string, unknown>>;
}
