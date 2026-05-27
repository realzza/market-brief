import { NextResponse } from 'next/server';
import { getUnanalyzedTweets, getTweetForAnalysis, saveAnalysis } from '@/lib/db';
import { analyzeBatch } from '@/lib/claude';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit ?? 10;
    const tweetId: string | undefined = body.tweet_id;
    // Free-form user question. Only honored on single-tweet analyze (batch
    // mode would apply the same question to every tweet — almost never what
    // you want), so we silently ignore it when `tweetId` isn't set.
    const userQuestion: string | undefined =
      typeof body.user_question === 'string' && body.user_question.trim().length > 0
        ? body.user_question.trim()
        : undefined;

    let unanalyzed: Array<{ id: string; text: string; created_at: string; media_urls: string }>;

    if (tweetId) {
      const row = getTweetForAnalysis(tweetId) as { id: string; text: string; created_at: string; media_urls: string } | null;
      if (!row) return NextResponse.json({ error: 'Tweet not found' }, { status: 404 });
      unanalyzed = [row];
    } else {
      unanalyzed = getUnanalyzedTweets(limit) as typeof unanalyzed;
    }

    if (unanalyzed.length === 0) {
      return NextResponse.json({ message: 'All tweets already analyzed', analyzed: 0 });
    }

    // Parse media_urls JSON string before passing to analyzer
    const toAnalyze = unanalyzed.map((t) => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      media_urls: t.media_urls ? JSON.parse(t.media_urls) : [],
    }));

    const results = await analyzeBatch(toAnalyze, tweetId ? { userQuestion } : undefined);

    for (const analysis of results) {
      saveAnalysis({
        tweet_id: analysis.tweet_id,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        sentiment_reasoning: analysis.sentiment_reasoning,
        tickers: JSON.stringify(analysis.tickers),
        signals: JSON.stringify(analysis.signals),
        key_themes: JSON.stringify(analysis.key_themes),
        domains: JSON.stringify(analysis.domains ?? []),
        risk_level: analysis.risk_level,
        is_trade_call: analysis.is_trade_call ? 1 : 0,
        summary: analysis.image_insights
          ? `[Images: ${analysis.image_insights}] ${analysis.summary}`
          : analysis.summary,
        analyzed_at: analysis.analyzed_at,
      });
    }

    return NextResponse.json({ analyzed: results.length, pending: unanalyzed.length - results.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const unanalyzed = getUnanalyzedTweets(1);
  return NextResponse.json({ pending: unanalyzed.length > 0 });
}
