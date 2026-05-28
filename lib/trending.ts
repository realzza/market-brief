import { getDb } from './db';

// ─── Trending aggregation ─────────────────────────────────────────────────
// Windowed counts + period-over-period comparison for the Assets tab.
//
// "Most mentioned" used to be a lifetime aggregation, which favoured whichever
// tickers were loud earliest and never let new themes surface. This module
// returns the top-10 over a rolling window (7 / 30 / 90 days), each item
// annotated with:
//   - daily sparkline buckets across the current window
//   - prior-period count + Δ% so the reader sees what changed
//   - prior rank (over all items, not just top-10) so we can render
//     ↑N / ↓N / NEW chips
//
// 'all' degrades gracefully — current counts only, no comparison data.

export type TrendingWindow = 7 | 30 | 90 | 'all';

export interface TrendingItem {
  name: string;
  current: number;
  prior: number | null;         // null when window === 'all'
  deltaPct: number | null;      // null when prior is null or 0 (NEW)
  series: number[] | null;      // daily counts across current window; null when 'all'
  rank: number;                 // 1-based, within returned top-10
  priorRank: number | null;     // global prior rank across all items; null when 'all' or unranked
  isNew: boolean;               // true when prior count was 0 (windowed only)
}

export interface TrendingResult {
  window: TrendingWindow;
  windowDays: number | null;    // null when 'all'
  generatedAt: string;
  tickers: TrendingItem[];
  domains: TrendingItem[];
}

const TICKER_RE = /\$([A-Z]{1,6}(?:[-][A-Z]{1,4})?)\b/g;
const LIMIT = 10;
const DAY_MS = 86_400_000;

function topN<T extends Record<string, number>>(counts: T): Array<[string, number]> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, LIMIT);
}

// Rank *all* items (not just top-10) so a ticker that climbed from #22 to #2
// shows the right ↑20 delta instead of falling off the prior-rank map.
function rankAll(counts: Record<string, number>): Map<string, number> {
  const sorted = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const map = new Map<string, number>();
  sorted.forEach(([name], i) => map.set(name, i + 1));
  return map;
}

function bucketSeries(events: Array<{ name: string; ts: number }>, startMs: number, days: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const { name, ts } of events) {
    const idx = Math.floor((ts - startMs) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    let arr = out[name];
    if (!arr) { arr = new Array(days).fill(0); out[name] = arr; }
    arr[idx]++;
  }
  return out;
}

// ─── Lifetime path ────────────────────────────────────────────────────────
// Mirrors the original getStats() aggregation, kept here so the API surface
// for the Assets tab is one endpoint instead of two.

function getLifetime(): TrendingResult {
  const db = getDb();

  const allTexts = db.prepare('SELECT text FROM tweets').all() as Array<{ text: string }>;
  const tickerCount: Record<string, number> = {};
  for (const row of allTexts) {
    TICKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TICKER_RE.exec(row.text)) !== null) {
      tickerCount[m[1]] = (tickerCount[m[1]] || 0) + 1;
    }
  }
  const tickers: TrendingItem[] = topN(tickerCount).map(([name, current], i) => ({
    name, current, prior: null, deltaPct: null, series: null,
    rank: i + 1, priorRank: null, isNew: false,
  }));

  const domainRows = db.prepare(
    "SELECT domains FROM tweet_analysis WHERE domains != '[]'",
  ).all() as Array<{ domains: string }>;
  const domainCount: Record<string, number> = {};
  for (const row of domainRows) {
    try {
      const ds = JSON.parse(row.domains) as string[];
      for (const d of ds) domainCount[d] = (domainCount[d] || 0) + 1;
    } catch { /* malformed JSON — skip */ }
  }
  const domains: TrendingItem[] = topN(domainCount).map(([name, current], i) => ({
    name, current, prior: null, deltaPct: null, series: null,
    rank: i + 1, priorRank: null, isNew: false,
  }));

  return {
    window: 'all',
    windowDays: null,
    generatedAt: new Date().toISOString(),
    tickers,
    domains,
  };
}

// ─── Windowed path ────────────────────────────────────────────────────────

function getWindowed(windowDays: 7 | 30 | 90): TrendingResult {
  const db = getDb();
  const now = Date.now();
  const windowMs = windowDays * DAY_MS;
  const currentStart = now - windowMs;
  const priorStart = now - 2 * windowMs;
  const priorStartIso = new Date(priorStart).toISOString();

  // ── Tickers ─────────────────────────────────────────────────────────────
  // Pull the 2W slice of tweets and bucket each $TICKER hit into either the
  // current or prior window based on the *tweet's* created_at — not the
  // analyzed_at — so the windowed view reflects when the content was
  // published, not when we got around to analyzing it.
  const tweets = db.prepare(
    'SELECT text, created_at FROM tweets WHERE created_at >= ?',
  ).all(priorStartIso) as Array<{ text: string; created_at: string }>;

  const currentTickerEvents: Array<{ name: string; ts: number }> = [];
  const priorTickerCounts: Record<string, number> = {};

  for (const row of tweets) {
    const ts = new Date(row.created_at).getTime();
    if (ts < priorStart || ts >= now) continue;
    TICKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TICKER_RE.exec(row.text)) !== null) {
      const name = m[1];
      if (ts >= currentStart) {
        currentTickerEvents.push({ name, ts });
      } else {
        priorTickerCounts[name] = (priorTickerCounts[name] || 0) + 1;
      }
    }
  }

  const tickerSeries = bucketSeries(currentTickerEvents, currentStart, windowDays);
  const currentTickerCounts: Record<string, number> = {};
  for (const [name, arr] of Object.entries(tickerSeries)) {
    currentTickerCounts[name] = arr.reduce((a, b) => a + b, 0);
  }
  const priorTickerRanks = rankAll(priorTickerCounts);

  const tickers: TrendingItem[] = topN(currentTickerCounts).map(([name, current], i) => {
    const prior = priorTickerCounts[name] ?? 0;
    return {
      name, current, prior,
      deltaPct: prior > 0 ? ((current - prior) / prior) * 100 : null,
      series: tickerSeries[name] ?? new Array(windowDays).fill(0),
      rank: i + 1,
      priorRank: priorTickerRanks.get(name) ?? null,
      isNew: prior === 0,
    };
  });

  // ── Domains ─────────────────────────────────────────────────────────────
  // Same shape, but the source is tweet_analysis.domains (JSON array) joined
  // back to the tweet for the timestamp.
  const analysisRows = db.prepare(`
    SELECT a.domains, t.created_at FROM tweet_analysis a
    JOIN tweets t ON a.tweet_id = t.id
    WHERE t.created_at >= ? AND a.domains != '[]'
  `).all(priorStartIso) as Array<{ domains: string; created_at: string }>;

  const currentDomainEvents: Array<{ name: string; ts: number }> = [];
  const priorDomainCounts: Record<string, number> = {};

  for (const row of analysisRows) {
    const ts = new Date(row.created_at).getTime();
    if (ts < priorStart || ts >= now) continue;
    let ds: string[];
    try { ds = JSON.parse(row.domains); } catch { continue; }
    for (const d of ds) {
      if (ts >= currentStart) currentDomainEvents.push({ name: d, ts });
      else priorDomainCounts[d] = (priorDomainCounts[d] || 0) + 1;
    }
  }

  const domainSeries = bucketSeries(currentDomainEvents, currentStart, windowDays);
  const currentDomainCounts: Record<string, number> = {};
  for (const [name, arr] of Object.entries(domainSeries)) {
    currentDomainCounts[name] = arr.reduce((a, b) => a + b, 0);
  }
  const priorDomainRanks = rankAll(priorDomainCounts);

  const domains: TrendingItem[] = topN(currentDomainCounts).map(([name, current], i) => {
    const prior = priorDomainCounts[name] ?? 0;
    return {
      name, current, prior,
      deltaPct: prior > 0 ? ((current - prior) / prior) * 100 : null,
      series: domainSeries[name] ?? new Array(windowDays).fill(0),
      rank: i + 1,
      priorRank: priorDomainRanks.get(name) ?? null,
      isNew: prior === 0,
    };
  });

  return {
    window: windowDays,
    windowDays,
    generatedAt: new Date().toISOString(),
    tickers,
    domains,
  };
}

export function getTrending(window: TrendingWindow): TrendingResult {
  return window === 'all' ? getLifetime() : getWindowed(window);
}
