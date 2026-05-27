import { NextResponse } from 'next/server';
import { fetchLatestTweets } from '@/lib/twitter';
import { saveTweets, getTweets } from '@/lib/db';
import { RawTweet } from '@/lib/types';

// Server-side gate: prevents hammering Twitter regardless of client state.
const RATE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
let lastFetchAt: number | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const rows = getTweets(limit, offset);
  const tweets = rows.map((row) => {
    const hasAnalysis = row.sentiment !== null && row.sentiment !== undefined;
    return {
      id: row.id,
      text: row.text,
      created_at: row.created_at,
      like_count: row.like_count,
      retweet_count: row.retweet_count,
      reply_count: row.reply_count,
      impression_count: row.impression_count,
      fetched_at: row.fetched_at,
      media_urls: row.media_urls ? JSON.parse(row.media_urls as string) : [],
      analysis: hasAnalysis ? {
        tweet_id: row.id,
        sentiment: row.sentiment,
        sentiment_score: row.sentiment_score,
        sentiment_reasoning: row.sentiment_reasoning,
        tickers: row.tickers ? JSON.parse(row.tickers as string) : [],
        signals: row.signals ? JSON.parse(row.signals as string) : [],
        key_themes: row.key_themes ? JSON.parse(row.key_themes as string) : [],
        domains: row.domains ? JSON.parse(row.domains as string) : [],
        risk_level: row.risk_level,
        is_trade_call: row.is_trade_call === 1,
        summary: row.summary,
        analyzed_at: row.analyzed_at,
      } : undefined,
    };
  });

  return NextResponse.json({ tweets });
}

export async function POST() {
  // Enforce server-side cooldown before touching Twitter
  if (lastFetchAt !== null) {
    const elapsed = Date.now() - lastFetchAt;
    if (elapsed < RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: `X syndication API allows one fetch per 15 minutes. Try again in ${Math.ceil(retryAfter / 60)} min.`, retryAfter },
        { status: 429 },
      );
    }
  }

  try {
    lastFetchAt = Date.now(); // stamp before the request so retries don't pile up
    const username = process.env.TWITTER_USERNAME || 'aleabitoreddit';
    const raw = await fetchLatestTweets(username, 100);

    const now = new Date().toISOString();
    const toSave = raw.map((t: RawTweet) => ({
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

    saveTweets(toSave);
    return NextResponse.json({ saved: toSave.length, fetched: raw.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
