// Shape a raw row from `getTweets()` into the StoredTweet wire format used by
// both the GET /api/tweets endpoint and the server-rendered initial page
// load. Keeping the mapping in one place stops the two surfaces from drifting
// (e.g. one forgetting to JSON.parse a new column).

import type { StoredTweet, Sentiment } from './types';

export function serializeTweetRow(row: Record<string, unknown>): StoredTweet {
  const hasAnalysis = row.sentiment !== null && row.sentiment !== undefined;
  const parseJson = <T>(v: unknown, fallback: T): T => {
    if (typeof v !== 'string') return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  };

  return {
    id: String(row.id),
    text: String(row.text ?? ''),
    created_at: String(row.created_at),
    like_count: Number(row.like_count ?? 0),
    retweet_count: Number(row.retweet_count ?? 0),
    reply_count: Number(row.reply_count ?? 0),
    impression_count: Number(row.impression_count ?? 0),
    fetched_at: String(row.fetched_at ?? ''),
    media_urls: parseJson<string[]>(row.media_urls, []),
    analysis: hasAnalysis
      ? {
          tweet_id: String(row.id),
          sentiment: row.sentiment as Sentiment,
          sentiment_score: Number(row.sentiment_score ?? 0),
          sentiment_reasoning: String(row.sentiment_reasoning ?? ''),
          tickers: parseJson(row.tickers, []),
          signals: parseJson(row.signals, []),
          key_themes: parseJson(row.key_themes, []),
          domains: parseJson(row.domains, []),
          risk_level: row.risk_level as 'high' | 'medium' | 'low' | 'none',
          is_trade_call: row.is_trade_call === 1,
          summary: String(row.summary ?? ''),
          image_insights: typeof row.image_insights === 'string' ? row.image_insights : null,
          analyzed_at: String(row.analyzed_at ?? ''),
        }
      : undefined,
  };
}
