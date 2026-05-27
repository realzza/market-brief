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

/**
 * Idempotent — safe to call multiple times. Only the first call wins.
 * Called from instrumentation.ts on Node server boot.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log(`[scheduler] started · interval=${CRON_INTERVAL_MS / 1000}s · first tick in ${FIRST_TICK_DELAY_MS}ms`);
  setTimeout(tick, FIRST_TICK_DELAY_MS);
  setInterval(tick, CRON_INTERVAL_MS);
}
