import { NextResponse } from 'next/server';
import { getLatestDigest, saveDigest } from '@/lib/db';
import { buildDigest, manualWindow, persistClassifications } from '@/lib/digest';

// GET — the latest digest (what the dashboard hero seeds from on reload).
export async function GET() {
  const digest = getLatestDigest();
  return NextResponse.json({ digest });
}

// POST — manual "refresh newly tracked posts" trigger. Covers everything since
// the last digest (manualWindow), builds it in one request, persists, returns
// the saved row. The build is gated against concurrent runs inside buildDigest;
// 409 surfaces that to the UI. The scheduler calls the lib functions directly
// rather than this route (same split as runFetch / POST /api/tweets).
export async function POST() {
  try {
    const built = await buildDigest(manualWindow());
    if (!built) {
      return NextResponse.json({ digest: null, message: 'No new posts to summarize.' });
    }
    const id = saveDigest(built);
    // Fold the batch's per-post reads into tweet_analysis so the market-mood
    // gauge moves. Gap-fill only — never clobbers a richer per-post analysis.
    const classified = persistClassifications(built);
    return NextResponse.json({ digest: { id, ...built }, classified });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('already being generated') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
