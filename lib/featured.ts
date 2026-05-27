import { StoredTweet } from './types';

const WINDOW_MS = 36 * 60 * 60 * 1000; // 36 hours

/** Returns the most recent is_trade_call tweet within the last 36 hours, or null. */
export function getFeaturedTweet(tweets: StoredTweet[]): StoredTweet | null {
  const cutoff = Date.now() - WINDOW_MS;
  return (
    tweets
      .filter((t) => t.analysis?.is_trade_call && new Date(t.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ??
    null
  );
}
