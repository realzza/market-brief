import { NextResponse } from 'next/server';
import { getPerformance, upsertPerformance } from '@/lib/db';

export async function GET() {
  const entries = getPerformance();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    upsertPerformance({
      ...body,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
