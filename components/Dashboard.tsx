'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StoredTweet, DashboardStats, PerformanceEntry, Domain, Analyst, Platform, Digest } from '@/lib/types';
import { authorKey, trackedPlatforms } from '@/lib/analysts';
import { getFeaturedTweet } from '@/lib/featured';
import { useTheme } from '@/hooks/useTheme';
import Masthead from '@/components/Masthead';
import TodaysBrief from '@/components/TodaysBrief';
import DailyDigest from '@/components/DailyDigest';
import StatsBar from '@/components/StatsBar';
import TweetCard from '@/components/TweetCard';
import SentimentChart from '@/components/SentimentChart';
import AssetMentions, { type TrendingByWindow } from '@/components/AssetMentions';
import PerformanceDashboard from '@/components/PerformanceDashboard';
import TickerModal from '@/components/TickerModal';

// Tab + sentiment ID arrays live in lib/dashboardTabs.ts (no 'use client')
// so the server component can import them as plain values. Importing them
// from THIS file (a 'use client' module) into the server crashed at request
// time — Next.js turns the array into a client-reference proxy and
// `.includes()` is gone.
import type { Tab, SentimentFilter } from '@/lib/dashboardTabs';
export type { Tab, SentimentFilter };

export interface TimelinePoint {
  date: string; avg_score: number; tweet_count: number;
  bullish: number; bearish: number; neutral: number;
}

export interface DashboardInitial {
  tweets: StoredTweet[];
  stats: DashboardStats | null;
  timeline: TimelinePoint[];
  performance: PerformanceEntry[];
  digest: Digest | null;
  analysts: Analyst[];
  // Baked trending per window — populated only in the static export, where
  // AssetMentions can't hit /api/trending. Null/undefined in server mode.
  trending?: TrendingByWindow;
  edition: number;
  dateStr: string;
  tab: Tab;
  sentiment: SentimentFilter;
  domain: string;
  analyst: string; // 'all' or an analyst id
}

const SENTIMENT_FILTERS: Array<{ id: SentimentFilter; label: string; dot: string }> = [
  { id: 'all',     label: 'All',          dot: 'dot-neutral' },
  { id: 'bullish', label: 'Bullish',      dot: 'dot-bull'    },
  { id: 'bearish', label: 'Bearish',      dot: 'dot-bear'    },
  { id: 'neutral', label: 'Neutral',      dot: 'dot-neutral' },
  { id: 'mixed',   label: 'Mixed',        dot: 'dot-mixed'   },
  { id: 'signals', label: 'Signals only', dot: 'dot-signal'  },
];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'feed',        label: 'Feed'        },
  { id: 'charts',      label: 'Sentiment'   },
  { id: 'assets',      label: 'Assets'      },
  { id: 'performance', label: 'Performance' },
];

export default function Dashboard({ initial }: { initial: DashboardInitial }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // State seeded from server-rendered initial values. The page no longer
  // flashes empty: `tweets`, `stats`, `timeline`, `performance`, `edition`,
  // and `dateStr` all arrive populated from the RSC.
  const [tweets,      setTweets]      = useState<StoredTweet[]>(initial.tweets);
  const [stats,       setStats]       = useState<DashboardStats | null>(initial.stats);
  const [timeline,    setTimeline]    = useState<TimelinePoint[]>(initial.timeline);
  const [performance, setPerformance] = useState<PerformanceEntry[]>(initial.performance);
  const [digest,      setDigest]      = useState<Digest | null>(initial.digest);
  const [activeTab,   setActiveTab]   = useState<Tab>(initial.tab);
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>(initial.sentiment);
  const [domainFilter,    setDomainFilter]    = useState<string>(initial.domain);
  const [analystFilter,   setAnalystFilter]   = useState<string>(initial.analyst);
  const [platformFilter,  setPlatformFilter]  = useState<'all' | Platform>('all');
  const [activeTicker,    setActiveTicker]    = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [fetching,   setFetching]   = useState(false);
  const [digesting,  setDigesting]  = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  // Which action raised the current status, so the masthead can anchor the
  // status pill under the button that triggered it (Fetch vs Brief).
  const [statusSource, setStatusSource] = useState<'fetch' | 'digest' | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayCount, setDisplayCount] = useState(20);

  const setStatus = (
    msg: string,
    type: 'info' | 'error' | 'success' = 'info',
    source: 'fetch' | 'digest' | null = null,
  ) => {
    setStatusMsg(msg);
    setStatusType(type);
    setStatusSource(source);
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    if (msg && type !== 'info') {
      const dwell = type === 'error' ? 6000 : 4000;
      statusTimerRef.current = setTimeout(() => setStatusMsg(''), dwell);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tweetsRes, statsRes, perfRes] = await Promise.all([
        fetch('/api/tweets?limit=5000'),
        fetch('/api/refresh'),
        fetch('/api/performance'),
      ]);
      const tweetsData = await tweetsRes.json();
      const statsData  = await statsRes.json();
      const perfData   = await perfRes.json();
      setTweets(tweetsData.tweets || []);
      setStats(statsData.stats || null);
      setTimeline(statsData.timeline || []);
      setPerformance(perfData.entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial mount: data is already seeded from props (server-rendered).
  // No client-side bootstrap fetch needed — `loadData` is still wired up
  // for the Refresh button and the post-fetch/post-analyze hand-offs.

  const handleFetch = async () => {
    setFetching(true);
    setStatus('Fetching posts…', 'info', 'fetch');
    try {
      const res  = await fetch('/api/tweets', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setStatus(data.error, 'error', 'fetch');
        return;
      }
      const newCount = data.inserted ?? 0;
      const msg = newCount === 0
        ? 'No new posts.'
        : newCount === 1
        ? '1 new post.'
        : `${newCount} new posts.`;
      setStatus(msg, 'success', 'fetch');
      await loadData();
    } catch {
      setStatus('Failed to fetch posts.', 'error', 'fetch');
    } finally {
      setFetching(false);
    }
  };

  // Manual digest trigger — one cheap request that summarizes every post tracked
  // since the last brief. The route's in-flight gate (409) guards double-spend.
  // Status is tagged 'digest' so the pill anchors under the Brief button.
  const handleDigest = async () => {
    if (digesting) return;
    setDigesting(true);
    setStatus('Compiling the brief…', 'info', 'digest');
    try {
      const res = await fetch('/api/digest', { method: 'POST' });
      const data = await res.json();
      if (data.error) { setStatus(data.error, 'error', 'digest'); return; }
      if (!data.digest) { setStatus(data.message || 'No new posts to summarize.', 'info', 'digest'); return; }
      setDigest(data.digest);
      setStatus(`Brief compiled — ${data.digest.items?.length ?? 0} highlights.`, 'success', 'digest');
    } catch {
      setStatus('Failed to compile the brief.', 'error', 'digest');
    } finally {
      setDigesting(false);
    }
  };

  // Domain list for filter dropdown
  const allDomains = Array.from(
    new Set(tweets.flatMap((t) => t.analysis?.domains ?? []))
  ).sort();

  // Analyst lookups. `analystByAuthor` resolves a tweet's stored author key to
  // its display metadata (for the per-card source label); `selectedAuthor` is
  // the author key the analyst filter is pinned to, or null for "All".
  const analysts = initial.analysts;
  const analystByAuthor = new Map(analysts.map((a) => [authorKey(a), a]));
  const selectedAnalyst = analysts.find((a) => a.id === analystFilter);
  const selectedAuthor = selectedAnalyst ? authorKey(selectedAnalyst) : null;

  // post_id → author key, so the digest can resolve a byline even for older
  // digests whose items predate the stored `author` field.
  const authorByPost = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tweets) m[t.id] = t.author;
    return m;
  }, [tweets]);

  // Platform filter options. Scoped to the *selected* analyst when one is
  // pinned — e.g. Serenity is X-only, so picking her must not offer "Truth
  // Social". With "All sources" we fall back to the roster-wide union. The
  // filter only shows when that scoped set has more than one platform.
  const platforms: Platform[] = selectedAnalyst
    ? ([
        selectedAnalyst.platforms.x ? 'x' : null,
        selectedAnalyst.platforms.truthsocial ? 'truthsocial' : null,
      ].filter(Boolean) as Platform[])
    : trackedPlatforms();
  const showPlatformFilter = platforms.length > 1;

  const filteredTweets = tweets.filter((t) => {
    const sentOk =
      sentimentFilter === 'all'     ? true :
      sentimentFilter === 'signals' ? !!t.analysis?.is_trade_call :
      t.analysis?.sentiment === sentimentFilter;
    const domainOk = !domainFilter || (t.analysis?.domains ?? []).includes(domainFilter as Domain);
    const analystOk = !selectedAuthor || t.author === selectedAuthor;
    const platformOk = platformFilter === 'all' || t.platform === platformFilter;
    return sentOk && domainOk && analystOk && platformOk;
  });

  const featured = getFeaturedTweet(tweets);

  // Sync tab / sentiment / domain to the URL so reloads + share-links
  // preserve context. State is the source of truth; the effect only fires
  // when local state changes. router.replace + scroll:false avoids history
  // clutter (one entry per filter click) and the scroll-to-top jump.
  // Read window.location at fire-time (not searchParams via dep) to avoid
  // a back-button bounce-loop: if `searchParams` were in the dep array, an
  // external URL change would re-run the effect and snap the URL back to
  // whatever state currently says.
  //
  // Filter scope: sentiment + domain only affect the Feed tab (Assets,
  // Charts, Performance all read corpus-wide aggregates). Mirroring them
  // to the URL while on a tab that doesn't consume them would be
  // misleading — the URL would advertise a filter the visible content
  // doesn't honor. So we only write those params when activeTab === 'feed';
  // React state still holds the values, so switching back to Feed restores
  // the filter without a reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = new URLSearchParams(window.location.search);
    if (activeTab === 'feed') next.delete('tab'); else next.set('tab', activeTab);
    if (activeTab === 'feed' && sentimentFilter !== 'all') {
      next.set('sentiment', sentimentFilter);
    } else {
      next.delete('sentiment');
    }
    if (activeTab === 'feed' && domainFilter) {
      next.set('domain', domainFilter);
    } else {
      next.delete('domain');
    }
    if (activeTab === 'feed' && analystFilter !== 'all') {
      next.set('analyst', analystFilter);
    } else {
      next.delete('analyst');
    }
    const qs = next.toString();
    if (qs !== window.location.search.replace(/^\?/, '')) {
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    }
  }, [activeTab, sentimentFilter, domainFilter, analystFilter, router]);

  return (
    <>
      <Masthead
        analysts={analysts}
        edition={initial.edition}
        dateStr={initial.dateStr}
        fetching={fetching}
        digesting={digesting}
        loading={loading}
        onFetch={handleFetch}
        onDigest={handleDigest}
        onRefresh={loadData}
        statusMsg={statusMsg}
        statusType={statusType}
        statusSource={statusSource}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Hero. The batched daily digest takes the slot; until one exists (first
          boot) we fall back to the single-post Today's Brief so the page is
          never empty. */}
      {digest && stats ? (
        <DailyDigest
          digest={digest}
          stats={stats}
          analysts={analysts}
          authorByPost={authorByPost}
          onTicker={setActiveTicker}
          onRegenerate={handleDigest}
          regenerating={digesting}
        />
      ) : featured && stats ? (
        <TodaysBrief
          brief={featured.tweet}
          stats={stats}
          onTicker={setActiveTicker}
          reason={featured.reason}
        />
      ) : null}

      {/* Stats strip */}
      {stats && (
        <div style={{ padding: '32px 0 0' }}>
          <StatsBar stats={stats} />
        </div>
      )}

      {/* Tabs + content */}
      <div className="container">
        <nav className="tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              className={`tab ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.id === 'feed' && tweets.length > 0 && (
                <span className="count num">{tweets.length}</span>
              )}
              {tab.id === 'performance' && performance.length > 0 && (
                <span className="count num">{performance.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* ── Feed ── */}
        {activeTab === 'feed' && (
          <>
            <div className="filters">
              {analysts.length > 1 && (
                <span className="filter-group">
                  <span className="select select-source">
                    <select
                      value={analystFilter}
                      onChange={(e) => { setAnalystFilter(e.target.value); setPlatformFilter('all'); setDisplayCount(20); e.target.blur(); }}
                      aria-label="Filter by source"
                    >
                      <option value="all">All sources</option>
                      {analysts.map((an) => (
                        <option key={an.id} value={an.id}>{an.name}</option>
                      ))}
                    </select>
                  </span>
                  <span className="filter-divider" aria-hidden />
                </span>
              )}

              {showPlatformFilter && (
                <span className="filter-group">
                  <span className="select select-source">
                    <select
                      value={platformFilter}
                      onChange={(e) => { setPlatformFilter(e.target.value as 'all' | Platform); setDisplayCount(20); e.target.blur(); }}
                      aria-label="Filter by platform"
                    >
                      <option value="all">All platforms</option>
                      {platforms.includes('x') && <option value="x">X</option>}
                      {platforms.includes('truthsocial') && <option value="truthsocial">Truth Social</option>}
                    </select>
                  </span>
                  <span className="filter-divider" aria-hidden />
                </span>
              )}

              {SENTIMENT_FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`chip ${sentimentFilter === f.id ? 'is-active' : ''}`}
                  onClick={() => { setSentimentFilter(f.id); setDisplayCount(20); }}
                >
                  <span className={`dot ${f.dot}`} />{f.label}
                </button>
              ))}

              {allDomains.length > 0 && (
                <span className="select" style={{ marginLeft: 6 }}>
                  <select value={domainFilter} onChange={(e) => { setDomainFilter(e.target.value); setDisplayCount(20); }}>
                    <option value="">All sectors</option>
                    {allDomains.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </span>
              )}

              {domainFilter && (
                <button
                  className="chip has-border"
                  onClick={() => { setDomainFilter(''); setDisplayCount(20); }}
                  style={{ color: 'var(--ink-2)' }}
                >
                  {domainFilter} ×
                </button>
              )}

              <span className="filters-count">
                {Math.min(displayCount, filteredTweets.length)} of {filteredTweets.length}
                {filteredTweets.length !== tweets.length && ` (${tweets.length} total)`}
              </span>
            </div>

            {loading && tweets.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <span className="spinner" />
              </div>
            ) : filteredTweets.length === 0 ? (
              <div className="empty">
                <div className="title">No posts found</div>
                <div className="desc">
                  {tweets.length === 0 ? 'Fetch posts to get started.' : 'Try adjusting your filters.'}
                </div>
              </div>
            ) : (
              <>
                <div className="feed">
                  {filteredTweets.slice(0, displayCount).map((tweet, i) => (
                    <TweetCard
                      key={tweet.id}
                      tweet={tweet}
                      serial={tweets.length - i}
                      source={analystByAuthor.get(tweet.author)}
                      onAnalyzed={loadData}
                    />
                  ))}
                </div>

                {filteredTweets.length > displayCount && (
                  <div className="feed-expand">
                    <button
                      className="btn"
                      onClick={() => setDisplayCount((c) => c + 20)}
                    >
                      Load 20 more
                      <span className="num" style={{ marginLeft: 6, color: 'var(--ink-4)' }}>
                        {filteredTweets.length - displayCount} remaining
                      </span>
                    </button>
                    <button
                      className="btn"
                      onClick={() => setDisplayCount(filteredTweets.length)}
                    >
                      Expand all {filteredTweets.length}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Sentiment ── */}
        {activeTab === 'charts' && (
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Sentiment timeline</h3>
              <span className="panel-sub">Rolling 30 days · avg score per day</span>
            </div>
            <SentimentChart timeline={timeline} />
          </div>
        )}

        {/* ── Assets ── */}
        {activeTab === 'assets' && (
          <div className="panel">
            <AssetMentions initialTrending={initial.trending} />
          </div>
        )}

        {/* ── Performance ── */}
        {activeTab === 'performance' && (
          <div className="panel">
            <PerformanceDashboard entries={performance} onTicker={setActiveTicker} />
          </div>
        )}

        <footer className="footer">
          <div className="colophon">Compiled with care · Set in Newsreader &amp; Geist</div>
          <div>
            <Link href="/status" className="footer-link">System status</Link>
            <span style={{ margin: '0 8px', color: 'var(--ink-4)' }}>·</span>
            The Market Brief · {new Date().getFullYear()}
          </div>
        </footer>
      </div>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}
