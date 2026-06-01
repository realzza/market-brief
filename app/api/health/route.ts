import { NextResponse } from 'next/server';
import { getHealth } from '@/lib/health';

// Live health snapshot: scheduler timing, content counts, last digest, and
// reachability of the RSSHub + Truth Social sub-services. Never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getHealth();
  // 200 when every *configured* service is up; 503 otherwise so an uptime
  // monitor can alert on the endpoint directly.
  const allUp = health.services.every((s) => !s.configured || s.ok);
  return NextResponse.json(health, { status: allUp ? 200 : 503 });
}
