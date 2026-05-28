import { NextRequest, NextResponse } from 'next/server';
import { getTrending, type TrendingWindow } from '@/lib/trending';

// Recomputed on every request. The query is cheap (one timestamp-filtered
// scan over `tweets` + one JSON-decode loop over the matching analysis
// rows), and the underlying counts shift as new tweets land — caching here
// would mostly trade freshness for headaches. Add a short in-process TTL if
// this ever shows up on a flame graph.
export const dynamic = 'force-dynamic';

function parseWindow(raw: string | null): TrendingWindow {
  switch (raw) {
    case '7':   return 7;
    case '90':  return 90;
    case 'all': return 'all';
    case '30':
    default:    return 30;
  }
}

export async function GET(req: NextRequest) {
  const window = parseWindow(req.nextUrl.searchParams.get('window'));
  try {
    const data = getTrending(window);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
