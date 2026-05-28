// Background tweet-fetch scheduler.
//
// Runs once per Node server boot (wired up via instrumentation.ts).
// Owns the shared `lastFetchAt` state and the `runFetch()` primitive
// so both the cron tick and the manual POST /api/tweets handler hit
// the same in-flight gate.

import { fetchLatestTweets } from './twitter';
import { saveTweets } from './db';

// How often the background loop hits X (also our effective fetch rate).
const CRON_INTERVAL_MS = 15 * 60 * 1000;        // 15 min
// Delay before the first background tick so we don't block server boot.
const FIRST_TICK_DELAY_MS = 5_000;

// Outcome resolution. 5 min strikes a balance — frequent enough that the
// running P&L on the Performance tab feels live, infrequent enough that
// Yahoo doesn't see a rate-pattern. Each tick fetches one chart + one quote
// per pending entry; ~10 pending entries × 12 ticks/hour = ~240 calls/hour,
// comfortably under any plausible rate limit. First check ~30s after boot
// so the backfill has time to settle.
const OUTCOMES_INTERVAL_MS = 5 * 60 * 1000;     // 5 min
const OUTCOMES_FIRST_DELAY_MS = 30_000;

let lastFetchAt: number | null = null;
let inFlight = false;
let started = false;

export function getLastFetchAt(): number | null {
  return lastFetchAt;
}

/**
 * Fetch latest tweets from syndication and upsert into the DB.
 *
 * Throws if a fetch is already in flight (concurrent calls would
 * just double-hit the upstream API for no benefit).
 */
export async function runFetch(): Promise<{
  fetched: number;
  inserted: number;
  updated: number;
}> {
  if (inFlight) {
    throw new Error('A fetch is already in progress — please wait a moment.');
  }
  inFlight = true;
  // Stamp before the network call so a retry loop can't pile up while
  // the request is still hanging.
  lastFetchAt = Date.now();
  try {
    const username = process.env.TWITTER_USERNAME || 'aleabitoreddit';
    const raw = await fetchLatestTweets(username, 100);
    const now = new Date().toISOString();
    const toSave = raw.map((t) => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      like_count: t.public_metrics?.like_count ?? 0,
      retweet_count: t.public_metrics?.retweet_count ?? 0,
      reply_count: t.public_metrics?.reply_count ?? 0,
      impression_count: t.public_metrics?.impression_count ?? 0,
      fetched_at: now,
      media_urls: JSON.stringify(t.media_urls ?? []),
    }));
    const { inserted, updated } = saveTweets(toSave);
    return { fetched: raw.length, inserted, updated };
  } finally {
    inFlight = false;
  }
}

async function tick() {
  const t0 = Date.now();
  try {
    const { fetched, inserted, updated } = await runFetch();
    console.log(
      `[scheduler] ok · ${new Date(t0).toISOString()} · fetched=${fetched} new=${inserted} updated=${updated} took=${Date.now() - t0}ms`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] fail · ${new Date(t0).toISOString()} · ${msg}`);
  }
}

async function outcomesTick() {
  // Lazy import keeps yahoo-finance2's large dependency tree out of the cold
  // path of `import 'lib/scheduler'` — it only loads on the first outcomes
  // tick, well after boot.
  const t0 = Date.now();
  try {
    const { runOutcomeRefresh } = await import('./performance');
    const { checked, resolved, updated } = await runOutcomeRefresh();
    if (checked > 0) {
      console.log(
        `[scheduler] outcomes · ${new Date(t0).toISOString()} · checked=${checked} resolved=${resolved} running=${updated} took=${Date.now() - t0}ms`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] outcomes fail · ${new Date(t0).toISOString()} · ${msg}`);
  }
}

/**
 * Idempotent — safe to call multiple times. Only the first call wins.
 * Called from instrumentation.ts on Node server boot.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log(
    `[scheduler] started · tweets every ${CRON_INTERVAL_MS / 1000}s, outcomes every ${OUTCOMES_INTERVAL_MS / 1000}s`,
  );

  // One-shot backfill: dribble existing trade-call analyses into the
  // performance table so the dashboard shows historical data on first boot
  // after this lands. Idempotent — the UNIQUE(tweet_id, asset) index makes
  // re-runs a no-op.
  (async () => {
    try {
      const { backfillPerformance } = await import('./performance');
      const { scanned, inserted } = backfillPerformance();
      console.log(`[scheduler] perf backfill · scanned=${scanned} inserted=${inserted}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] perf backfill fail · ${msg}`);
    }
  })();

  setTimeout(tick, FIRST_TICK_DELAY_MS);
  setInterval(tick, CRON_INTERVAL_MS);
  setTimeout(outcomesTick, OUTCOMES_FIRST_DELAY_MS);
  setInterval(outcomesTick, OUTCOMES_INTERVAL_MS);
}
