import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'serenity.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
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
      media_urls TEXT NOT NULL DEFAULT '[]'
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

    CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analysis_sentiment ON tweet_analysis(sentiment);
    CREATE INDEX IF NOT EXISTS idx_performance_outcome ON performance(outcome);
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
}

// ─── Stats cache ──────────────────────────────────────────────────────────────
// getStats() and getSentimentTimeline() each do half a dozen aggregate queries
// plus a full-text scan over tweets.text for ticker counts. Dashboard polling +
// multiple tabs make this hot; cache the result and invalidate when tweets or
// analyses change. TTL is a fallback for processes outside the write paths.

const STATS_TTL_MS = 60_000;
type CacheEntry<T> = { value: T; ts: number };
const statsCache: Map<string, CacheEntry<unknown>> = new Map();

function cached<T>(key: string, ttlMs: number, compute: () => T): T {
  const hit = statsCache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.ts < ttlMs) return hit.value;
  const value = compute();
  statsCache.set(key, { value, ts: Date.now() });
  return value;
}

function invalidateStatsCache() {
  statsCache.clear();
}

export function saveTweets(tweets: Array<{
  id: string; text: string; created_at: string;
  like_count: number; retweet_count: number; reply_count: number;
  impression_count: number; fetched_at: string; media_urls: string;
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
    INSERT OR REPLACE INTO tweets (id, text, created_at, like_count, retweet_count, reply_count, impression_count, fetched_at, media_urls)
    VALUES (@id, @text, @created_at, @like_count, @retweet_count, @reply_count, @impression_count, @fetched_at, @media_urls)
  `);
  const insertMany = db.transaction((rows: typeof tweets) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(tweets);

  invalidateStatsCache();
  return { inserted, updated };
}

export function saveAnalysis(analysis: {
  tweet_id: string; sentiment: string; sentiment_score: number;
  sentiment_reasoning: string; tickers: string; signals: string;
  key_themes: string; domains: string; risk_level: string;
  is_trade_call: number; summary: string; analyzed_at: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO tweet_analysis
    (tweet_id, sentiment, sentiment_score, sentiment_reasoning, tickers, signals, key_themes, domains, risk_level, is_trade_call, summary, analyzed_at)
    VALUES (@tweet_id, @sentiment, @sentiment_score, @sentiment_reasoning, @tickers, @signals, @key_themes, @domains, @risk_level, @is_trade_call, @summary, @analyzed_at)
  `).run(analysis);
  invalidateStatsCache();
}

export function getTweets(limit = 50, offset = 0): Array<Record<string, unknown>> {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, a.sentiment, a.sentiment_score, a.sentiment_reasoning,
           a.tickers, a.signals, a.key_themes, a.domains, a.risk_level,
           a.is_trade_call, a.summary, a.analyzed_at
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

// Ticker mentions are counted from raw tweet text so that mentions in
// unanalyzed tweets still appear in the leaderboard. The analysis table is
// then used to enrich each top ticker with its asset_type (crypto / stock /
// etc) — previously this was always 'unknown'.
const TICKER_RE = /\$([A-Z]{1,6}(?:[-][A-Z]{1,4})?)\b/g;

function computeStats(): Record<string, unknown> {
  const db = getDb();

  // Roll up the per-tweet counts and the per-analysis aggregates in two
  // queries instead of five. Sentiment counts come from a single GROUP BY.
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tweets) AS total,
      (SELECT COUNT(*) FROM tweet_analysis) AS analyzed,
      (SELECT COUNT(*) FROM tweet_analysis WHERE is_trade_call = 1) AS trade_calls,
      (SELECT AVG(sentiment_score) FROM tweet_analysis) AS avg_score
  `).get() as { total: number; analyzed: number; trade_calls: number; avg_score: number | null };

  const sentiments = db.prepare(
    `SELECT sentiment, COUNT(*) as count FROM tweet_analysis GROUP BY sentiment`
  ).all() as Array<{ sentiment: string; count: number }>;
  const sentimentMap: Record<string, number> = {};
  for (const s of sentiments) sentimentMap[s.sentiment] = s.count;

  // Ticker counts from raw text — kept because it includes unanalyzed tweets.
  // This is the expensive bit at scale, hence the surrounding cache.
  const allTexts = db.prepare('SELECT text FROM tweets').all() as Array<{ text: string }>;
  const tickerCount: Record<string, number> = {};
  for (const row of allTexts) {
    TICKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TICKER_RE.exec(row.text)) !== null) {
      tickerCount[m[1]] = (tickerCount[m[1]] || 0) + 1;
    }
  }

  // One pass over analysis JSON gives us both the domain counts AND a
  // ticker→asset_type lookup that we use to enrich the top tickers below.
  const analysisRows = db.prepare(
    `SELECT tickers, domains FROM tweet_analysis`
  ).all() as Array<{ tickers: string; domains: string }>;

  const domainCount: Record<string, number> = {};
  const assetTypeForTicker: Record<string, string> = {};
  for (const row of analysisRows) {
    try {
      const domains = JSON.parse(row.domains) as string[];
      for (const d of domains) domainCount[d] = (domainCount[d] || 0) + 1;
    } catch {}
    try {
      const tickers = JSON.parse(row.tickers) as Array<{ ticker?: string; asset_type?: string }>;
      for (const t of tickers) {
        if (t.ticker && t.asset_type && !assetTypeForTicker[t.ticker]) {
          assetTypeForTicker[t.ticker] = t.asset_type;
        }
      }
    } catch {}
  }

  const topTickers = Object.entries(tickerCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([ticker, count]) => ({
      ticker,
      count,
      asset_type: assetTypeForTicker[ticker] ?? 'unknown',
    }));

  const topDomains = Object.entries(domainCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  return {
    total_tweets: counts.total,
    analyzed_tweets: counts.analyzed,
    bullish_count: sentimentMap['bullish'] || 0,
    bearish_count: sentimentMap['bearish'] || 0,
    neutral_count: sentimentMap['neutral'] || 0,
    mixed_count: sentimentMap['mixed'] || 0,
    trade_calls: counts.trade_calls,
    top_tickers: topTickers,
    top_domains: topDomains,
    avg_sentiment_score: counts.avg_score ?? 0,
  };
}

export function getStats(): Record<string, unknown> {
  return cached('stats', STATS_TTL_MS, computeStats);
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
  db.prepare(`
    INSERT INTO performance (tweet_id, asset, direction, entry_price, target_price, stop_loss_price, signal_date, outcome, actual_return_pct, notes, updated_at)
    VALUES (@tweet_id, @asset, @direction, @entry_price, @target_price, @stop_loss_price, @signal_date, @outcome, @actual_return_pct, @notes, @updated_at)
    ON CONFLICT DO NOTHING
  `).run({ outcome: 'pending', ...entry });
}

// `days` is bound as a SQLite modifier ("-30 days") rather than interpolated
// into the SQL string, so the route doesn't have to trust parseInt downstream.
export function getSentimentTimeline(days = 30): Array<Record<string, unknown>> {
  return cached(`timeline:${days}`, STATS_TTL_MS, () => {
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
      WHERE t.created_at >= datetime('now', ?)
      GROUP BY DATE(t.created_at)
      ORDER BY date ASC
    `).all(`-${days} days`) as Array<Record<string, unknown>>;
  });
}
