import { NextResponse } from 'next/server';
import { getTweets } from '@/lib/db';
import { runFetch, manualCooldownRemaining } from '@/lib/scheduler';

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
  // Manual button is a "force a fresh fetch now" override on top of the
  // background scheduler. Short cooldown just prevents button-mashing.
  const remaining = manualCooldownRemaining();
  if (remaining > 0) {
    return NextResponse.json(
      {
        error: `Cooldown — ${Math.ceil(remaining / 60)}m ${remaining % 60}s until next manual fetch. (Auto-fetch runs every 15 min in the background.)`,
        retryAfter: remaining,
      },
      { status: 429 },
    );
  }

  try {
    const { fetched, saved } = await runFetch();
    return NextResponse.json({ saved, fetched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
