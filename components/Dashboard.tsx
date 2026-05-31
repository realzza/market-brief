'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { StoredTweet, DashboardStats, PerformanceEntry, Domain, Analyst } from '@/lib/types';
import { authorKey } from '@/lib/analysts';
import { getFeaturedTweet } from '@/lib/featured';
import { useTheme } from '@/hooks/useTheme';
import Masthead from '@/components/Masthead';
import TodaysBrief from '@/components/TodaysBrief';
import StatsBar from '@/components/StatsBar';
import TweetCard from '@/components/TweetCard';
import SentimentChart from '@/components/SentimentChart';
import AssetMentions from '@/components/AssetMentions';
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
  analysts: Analyst[];
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
  const [activeTab,   setActiveTab]   = useState<Tab>(initial.tab);
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>(initial.sentiment);
  const [domainFilter,    setDomainFilter]    = useState<string>(initial.domain);
  const [analystFilter,   setAnalystFilter]   = useState<string>(initial.analyst);
  const [activeTicker,    setActiveTicker]    = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [fetching,   setFetching]   = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const cancelRef = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayCount, setDisplayCount] = useState(20);

  const setStatus = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
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
    setStatus('Fetching tweets from X…');
    try {
      const res  = await fetch('/api/tweets', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setStatus(data.error, 'error');
        return;
      }
      const newCount = data.inserted ?? 0;
      const msg = newCount === 0
        ? 'No new tweets.'
        : newCount === 1
        ? '1 new tweet.'
        : `${newCount} new tweets.`;
      setStatus(msg, 'success');
      await loadData();
    } catch {
      setStatus('Failed to connect to X API.', 'error');
    } finally {
      setFetching(false);
    }
  };

  const handleAnalyze = async () => {
    const pending = tweets.filter((t) => !t.analysis).length;
    if (pending === 0) { setStatus('All tweets are already analyzed.', 'info'); return; }
    if (!window.confirm(`Analyze ${pending} tweets? This will use Claude API credits.`)) return;

    cancelRef.current = false;
    setAnalyzing(true);
    setStatus('Running AI analysis…');
    let total = 0;
    try {
      while (!cancelRef.current) {
        const res  = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 10 }),
        });
        const data = await res.json();
        if (data.error) { setStatus(data.error, 'error'); break; }
        total += data.analyzed || 0;
        setStatus(`Running AI analysis — ${total} analyzed…`);
        if (!data.analyzed || data.analyzed === 0) break;
      }
      setStatus(
        cancelRef.current
          ? `Cancelled — ${total} tweets analyzed.`
          : `Done! ${total} tweets analyzed.`,
        'success'
      );
      await loadData();
    } catch {
      setStatus('Analysis failed.', 'error');
    } finally {
      setAnalyzing(false);
      cancelRef.current = false;
    }
  };

  const handleCancelAnalyze = () => {
    cancelRef.current = true;
    setStatus('Cancelling after current batch…');
  };

  // Domain list for filter dropdown
  const allDomains = Array.from(
    new Set(tweets.flatMap((t) => t.analysis?.domains ?? []))
  ).sort();

  // Analyst lookups. `analystByAuthor` resolves a tweet's stored author key to
  // its display metadata (for the per-card source label); `selectedAuthor` is
  // the author key the analyst filter is pinned to, or null for "All".
  const analysts = initial.analysts;
  const analystByAuthor = new Map(analysts.map((a) => [authorKey(a.handle), a]));
  const selectedAnalyst = analysts.find((a) => a.id === analystFilter);
  const selectedAuthor = selectedAnalyst ? authorKey(selectedAnalyst.handle) : null;

  const filteredTweets = tweets.filter((t) => {
    const sentOk =
      sentimentFilter === 'all'     ? true :
      sentimentFilter === 'signals' ? !!t.analysis?.is_trade_call :
      t.analysis?.sentiment === sentimentFilter;
    const domainOk = !domainFilter || (t.analysis?.domains ?? []).includes(domainFilter as Domain);
    const analystOk = !selectedAuthor || t.author === selectedAuthor;
    return sentOk && domainOk && analystOk;
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
        analyzing={analyzing}
        loading={loading}
        onFetch={handleFetch}
        onAnalyze={handleAnalyze}
        onCancel={handleCancelAnalyze}
        onRefresh={loadData}
        statusMsg={statusMsg}
        statusType={statusType}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Today's Brief hero — falls back to most recent analysis when no
          trade call within 36h. Eyebrow relabels in that case. */}
      {featured && stats && (
        <TodaysBrief
          brief={featured.tweet}
          stats={stats}
          onTicker={setActiveTicker}
          reason={featured.reason}
        />
      )}

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
                  <button
                    className={`chip ${analystFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => { setAnalystFilter('all'); setDisplayCount(20); }}
                  >
                    All sources
                  </button>
                  {analysts.map((an) => (
                    <button
                      key={an.id}
                      className={`chip ${analystFilter === an.id ? 'is-active' : ''}`}
                      onClick={() => { setAnalystFilter(an.id); setDisplayCount(20); }}
                      title={`@${an.handle}`}
                    >
                      {an.name}
                    </button>
                  ))}
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
                <div className="title">No tweets found</div>
                <div className="desc">
                  {tweets.length === 0 ? 'Fetch tweets to get started.' : 'Try adjusting your filters.'}
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
            <AssetMentions />
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
          <div>The Market Brief · {new Date().getFullYear()}</div>
        </footer>
      </div>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}
