// Shared between the server component (app/page.tsx, which validates the
// ?tab= and ?sentiment= search params against these allowlists) and the
// client component (components/Dashboard.tsx, which uses the types).
//
// IMPORTANT: this file must NOT carry 'use client' — when a server module
// imports a runtime value from a client module, Next.js replaces it with
// a client-reference proxy, and `proxy.includes(...)` throws
// "TypeError: allowed.includes is not a function" at request time.

export type Tab = 'feed' | 'charts' | 'assets' | 'performance';
export type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'signals';

export const TAB_IDS: readonly Tab[] = ['feed', 'charts', 'assets', 'performance'] as const;
export const SENTIMENT_IDS: readonly SentimentFilter[] = [
  'all', 'bullish', 'bearish', 'neutral', 'mixed', 'signals',
] as const;
