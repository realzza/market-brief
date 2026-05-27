import { NextResponse } from 'next/server';
import { getStats, getSentimentTimeline } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Clamp to a sane window so `?days=99999` can't ask sqlite to walk the
  // whole tweets table. parseInt of an empty/garbage string is NaN.
  const raw = parseInt(searchParams.get('days') ?? '');
  const days = Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 1), 365);

  const stats = getStats();
  const timeline = getSentimentTimeline(days);

  return NextResponse.json({ stats, timeline });
}
