import { NextResponse } from 'next/server';
import { getPerformance, upsertPerformance } from '@/lib/db';
import { validatePerformanceBody } from '@/lib/validate';

export async function GET() {
  const entries = getPerformance();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = validatePerformanceBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    upsertPerformance({
      ...parsed.value,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
