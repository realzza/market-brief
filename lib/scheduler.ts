// Background tweet-fetch scheduler.
//
// Runs once per Node server boot (wired up via instrumentation.ts).
// Owns the shared `lastFetchAt` state and the `runFetch()` primitive
// so both the cron tick and the manual POST /api/tweets handler hit
// the same in-flight gate.

import { fetchLatestTweets } from './twitter';
import { fetchTruthSocialPosts, truthSocialEnabled } from './truthsocial';
import { saveTweets } from './db';
import { getAnalysts, authorKey } from './analysts';
import type { RawTweet } from './types';

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

// Daily digest fires once per day at DIGEST_HOUR (server-local, honors the TZ
// env var). Default 08:00. A self-re-arming setTimeout — not setInterval — so
// it can't drift across DST boundaries or a clock that isn't a clean 24h apart.
const DIGEST_HOUR = (() => {
  const h = parseInt(process.env.DIGEST_HOUR ?? '8', 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 8;
})();

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
    const now = new Date().toISOString();
    let fetched = 0;
    let inserted = 0;
    let updated = 0;

    // One author key per analyst; both platforms save under it so they merge
    // into a single source. The `platform` column distinguishes per post.
    const save = (
      raw: RawTweet[],
      author: string,
      platform: 'x' | 'truthsocial',
    ): void => {
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
        author,
        platform,
        link_card: t.card ? JSON.stringify(t.card) : null,
      }));
      const res = saveTweets(toSave);
      fetched += raw.length;
      inserted += res.inserted;
      updated += res.updated;
    };

    // Fetch each tracked analyst sequentially so one slow/failing upstream
    // doesn't sink the others, and so we stay gentle on the upstream APIs.
    for (const analyst of getAnalysts()) {
      const author = authorKey(analyst);

      // X, when the analyst declares an X handle under `platforms`.
      if (analyst.platforms.x) {
        try {
          save(await fetchLatestTweets(analyst.platforms.x, 100), author, 'x');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[scheduler] X fetch failed for @${analyst.platforms.x}: ${msg}`);
        }
      }

      // Truth Social, when the analyst declares an acct under `platforms` and
      // the sidecar is wired up. Failures here never affect the X path above.
      if (analyst.platforms.truthsocial && truthSocialEnabled()) {
        try {
          // Match the X depth (100). The sidecar pages backward to reach this,
          // so the feed shows real history instead of just the last few posts.
          save(await fetchTruthSocialPosts(analyst.platforms.truthsocial, 100), author, 'truthsocial');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[scheduler] Truth Social fetch failed for @${analyst.platforms.truthsocial}: ${msg}`);
        }
      }
    }

    return { fetched, inserted, updated };
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

// Milliseconds from `now` until the next occurrence of DIGEST_HOUR:00 local.
function msUntilNextDigest(now = new Date()): number {
  const next = new Date(now);
  next.setHours(DIGEST_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function digestTick(): Promise<void> {
  // Lazy import keeps the Anthropic SDK out of the cold boot path (mirrors the
  // performance import below) — it only loads on the first digest fire.
  const t0 = Date.now();
  try {
    const { buildDigest, dailyWindow } = await import('./digest');
    const { saveDigest } = await import('./db');
    const built = await buildDigest(dailyWindow());
    if (!built) {
      console.log(`[scheduler] digest · ${new Date(t0).toISOString()} · no posts in window`);
      return;
    }
    saveDigest(built);
    console.log(
      `[scheduler] digest · ${new Date(t0).toISOString()} · posts=${built.post_count} items=${built.items.length} tokens_in=${built.input_tokens} tokens_out=${built.output_tokens} took=${Date.now() - t0}ms`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] digest fail · ${new Date(t0).toISOString()} · ${msg}`);
  }
}

// Self-re-arming daily scheduler. Runs digestTick at the next DIGEST_HOUR, then
// reschedules for the following day from inside the callback.
function scheduleDailyDigest(): void {
  const delay = msUntilNextDigest();
  console.log(
    `[scheduler] next digest at ${new Date(Date.now() + delay).toISOString()} (in ${Math.round(delay / 60000)}m)`,
  );
  setTimeout(async () => {
    await digestTick();
    scheduleDailyDigest();
  }, delay);
}

/**
 * Idempotent — safe to call multiple times. Only the first call wins.
 * Called from instrumentation.ts on Node server boot.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log(
    `[scheduler] started · tweets every ${CRON_INTERVAL_MS / 1000}s, outcomes every ${OUTCOMES_INTERVAL_MS / 1000}s, digest daily at ${String(DIGEST_HOUR).padStart(2, '0')}:00`,
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
  scheduleDailyDigest();
}
