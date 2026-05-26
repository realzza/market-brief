import { NextResponse } from 'next/server';
import { getStats, getSentimentTimeline } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');

  const stats = getStats();
  const timeline = getSentimentTimeline(days);

  return NextResponse.json({ stats, timeline });
}
