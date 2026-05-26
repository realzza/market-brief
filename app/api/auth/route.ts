import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'st_auth';
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    // No secret configured — reject to avoid accidentally open installs
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  if (password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ONE_YEAR,
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
