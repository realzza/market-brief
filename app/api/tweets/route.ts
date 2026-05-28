import { NextResponse } from 'next/server';
import { getTweets } from '@/lib/db';
import { runFetch } from '@/lib/scheduler';
import { serializeTweetRow } from '@/lib/serialize';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const tweets = getTweets(limit, offset).map(serializeTweetRow);
  return NextResponse.json({ tweets });
}

export async function POST() {
  // Manual button: forces a fresh fetch now. The in-flight gate inside
  // runFetch() prevents concurrent hits; RSSHub's own 10-min cache absorbs
  // rapid clicks so we don't actually re-hit Twitter every time.
  try {
    const { fetched, inserted, updated } = await runFetch();
    return NextResponse.json({ fetched, inserted, updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 409 conveys "already in progress" more accurately than 500
    const status = msg.includes('already in progress') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
