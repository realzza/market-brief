import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'st_auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and its API
  if (pathname === '/login' || pathname === '/api/auth') {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const expected = process.env.AUTH_SECRET;

  if (!expected) {
    // AUTH_SECRET not configured — open access (dev default)
    return NextResponse.next();
  }

  if (token !== expected) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
