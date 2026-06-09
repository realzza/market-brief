import { NextResponse } from 'next/server';
import { getStats, getSentimentTimeline } from '@/lib/db';

function daysParam(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(365, Math.max(1, n));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = daysParam(searchParams.get('days'));

  const stats = getStats();
  const timeline = getSentimentTimeline(days);

  return NextResponse.json({ stats, timeline });
}
