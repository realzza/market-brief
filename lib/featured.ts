import { StoredTweet } from './types';

const HOUR_MS = 60 * 60 * 1000;
const SIGNAL_WINDOW_MS = 36 * HOUR_MS;       // "today's signal" tier
const RECENT_WINDOW_MS = 7 * 24 * HOUR_MS;   // commentary fallback tier

/** Why we surfaced this tweet — drives the eyebrow disclosure on the hero. */
export type FeaturedReason = 'signal' | 'recent';

export interface FeaturedSelection {
  tweet: StoredTweet;
  reason: FeaturedReason;
}

/**
 * Two-tier selection:
 *  1. Most recent `is_trade_call` tweet within the last 36h (the "Today's
 *     Brief" promise — an actionable call from today).
 *  2. Otherwise, the most recent analyzed tweet within the last 7 days
 *     (so the hero doesn't disappear on quiet days, just relabels as
 *     "Recent analysis" via the `reason` field).
 *  3. Otherwise null — a week of silence; the hero hides and the caller
 *     can prompt the user to fetch / analyze.
 */
export function getFeaturedTweet(tweets: StoredTweet[]): FeaturedSelection | null {
  const now = Date.now();
  const signalCutoff = now - SIGNAL_WINDOW_MS;
  const recentCutoff = now - RECENT_WINDOW_MS;

  // Sort once by created_at desc; both tiers want the most recent member.
  const sorted = tweets
    .filter((t) => !!t.analysis)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const signal = sorted.find(
    (t) => t.analysis?.is_trade_call && new Date(t.created_at).getTime() >= signalCutoff,
  );
  if (signal) return { tweet: signal, reason: 'signal' };

  const recent = sorted.find((t) => new Date(t.created_at).getTime() >= recentCutoff);
  if (recent) return { tweet: recent, reason: 'recent' };

  return null;
}
