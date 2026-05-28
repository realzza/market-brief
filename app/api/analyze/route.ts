import { NextResponse } from 'next/server';
import { getUnanalyzedTweets, getTweetForAnalysis, saveAnalysis, upsertPerformance } from '@/lib/db';
import { analyzeBatch } from '@/lib/claude';
import { derivePerformanceEntry } from '@/lib/performance';

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
      // image_insights is its own column now — was previously glued onto the
      // front of `summary` as `[Images: …] `, which bloated the brief lede
      // and required render-time stripping. Storing it separately lets each
      // surface decide whether to show it.
      const insights = (typeof analysis.image_insights === 'string'
        ? analysis.image_insights.trim()
        : '');
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
        summary: analysis.summary,
        image_insights: insights.length > 0 ? insights : null,
        analyzed_at: analysis.analyzed_at,
      });

      // If this analysis flagged the tweet as an actionable trade call,
      // derive a performance row and upsert. ON CONFLICT(tweet_id, asset)
      // DO NOTHING means re-analyzing the same tweet is a safe no-op.
      // Outcome resolution runs on the scheduler's hourly cron.
      const source = toAnalyze.find((t) => t.id === analysis.tweet_id);
      if (source) {
        const perfEntry = derivePerformanceEntry(source.id, source.created_at, analysis);
        if (perfEntry) {
          upsertPerformance({ ...perfEntry, updated_at: new Date().toISOString() });
        }
      }
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
