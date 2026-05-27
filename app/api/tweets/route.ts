import { NextResponse } from 'next/server';
import { getTweets } from '@/lib/db';
import { runFetch } from '@/lib/scheduler';

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
  // Manual button: forces a fresh fetch now. The in-flight gate inside
  // runFetch() prevents concurrent hits; RSSHub's own 10-min cache absorbs
  // rapid clicks so we don't actually re-hit Twitter every time.
  try {
    const { fetched, saved } = await runFetch();
    return NextResponse.json({ saved, fetched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 409 conveys "already in progress" more accurately than 500
    const status = msg.includes('already in progress') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
