// Server-rendered initial load. Pulls tweets/stats/timeline/performance
// directly from sqlite via lib/db (no HTTP round-trip) so the first paint
// already has content. The interactive dashboard lives in a child client
// component (components/Dashboard.tsx) which seeds its state from these
// props and takes over from there.

import { getTweets, getStats, getSentimentTimeline, getPerformance, getLatestDigest } from '@/lib/db';
import { serializeTweetRow } from '@/lib/serialize';
import { getAnalysts } from '@/lib/analysts';
import Dashboard, { type DashboardInitial } from '@/components/Dashboard';
import { type Tab, type SentimentFilter, TAB_IDS, SENTIMENT_IDS } from '@/lib/dashboardTabs';
import type { DashboardStats, PerformanceEntry } from '@/lib/types';

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function editionNumber(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function dateString(now: Date): string {
  return now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

interface PageProps {
  // Next 16 ships searchParams as a Promise — see
  // node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;

  // 5000 matches the previous client-side limit so behavior is identical
  // for users with bookmarks / shared filter URLs. The actual corpus is
  // tiny (hundreds to low thousands of rows in normal use); this query
  // takes a few ms.
  const tweets = getTweets(5000, 0).map(serializeTweetRow);
  const stats = getStats() as unknown as DashboardStats;
  const timeline = getSentimentTimeline(30) as unknown as DashboardInitial['timeline'];
  const performance = getPerformance() as unknown as PerformanceEntry[];
  const digest = getLatestDigest();

  const now = new Date();
  const tab      = pickEnum<Tab>(sp.tab, TAB_IDS, 'feed');
  const sentiment = pickEnum<SentimentFilter>(sp.sentiment, SENTIMENT_IDS, 'all');
  // domain is free-form (any string from the Domain enum), so just normalize
  // to a string and let the client filter render — bogus values just won't
  // match anything in the dropdown.
  const domain = typeof sp.domain === 'string' ? sp.domain : '';

  const analyst = typeof sp.analyst === 'string' ? sp.analyst : 'all';

  const initial: DashboardInitial = {
    tweets,
    stats,
    timeline,
    performance,
    digest,
    analysts: getAnalysts(),
    edition: editionNumber(now),
    dateStr: dateString(now),
    tab,
    sentiment,
    domain,
    analyst,
  };

  return <Dashboard initial={initial} />;
}
