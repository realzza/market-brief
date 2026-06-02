import { NextRequest, NextResponse } from 'next/server';
import { buildQuote } from '@/lib/quote.mjs';

// Live quote endpoint. The actual Yahoo logic lives in lib/quote.mjs so the
// static-export bake (scripts/bake-quotes.mjs) renders identical payloads.
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

  try {
    return NextResponse.json(await buildQuote(ticker));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
