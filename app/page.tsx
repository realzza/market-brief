'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StoredTweet, DashboardStats, PerformanceEntry, Domain } from '@/lib/types';
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

type Tab = 'feed' | 'charts' | 'assets' | 'performance';
type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'signals';

interface TimelinePoint {
  date: string; avg_score: number; tweet_count: number;
  bullish: number; bearish: number; neutral: number;
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

function editionNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function dateString(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [tweets,      setTweets]      = useState<StoredTweet[]>([]);
  const [stats,       setStats]       = useState<DashboardStats | null>(null);
  const [timeline,    setTimeline]    = useState<TimelinePoint[]>([]);
  const [performance, setPerformance] = useState<PerformanceEntry[]>([]);
  const [activeTab,   setActiveTab]   = useState<Tab>('feed');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [domainFilter,    setDomainFilter]    = useState<string>('');
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

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

  const filteredTweets = tweets.filter((t) => {
    const sentOk =
      sentimentFilter === 'all'     ? true :
      sentimentFilter === 'signals' ? !!t.analysis?.is_trade_call :
      t.analysis?.sentiment === sentimentFilter;
    const domainOk = !domainFilter || (t.analysis?.domains ?? []).includes(domainFilter as Domain);
    return sentOk && domainOk;
  });

  const featured = getFeaturedTweet(tweets);
  const edition  = editionNumber();
  const dateStr  = dateString();

  return (
    <>
      <Masthead
        edition={edition}
        dateStr={dateStr}
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

      {/* Today's Brief hero */}
      {featured && stats && (
        <TodaysBrief brief={featured} stats={stats} onTicker={setActiveTicker} />
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
                      onAnalyzed={loadData}
                      onTicker={setActiveTicker}
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
            <AssetMentions
              topTickers={stats?.top_tickers || []}
              topDomains={stats?.top_domains || []}
              onTicker={setActiveTicker}
            />
          </div>
        )}

        {/* ── Performance ── */}
        {activeTab === 'performance' && (
          <div className="panel">
            <PerformanceDashboard entries={performance} />
          </div>
        )}

        <footer className="footer">
          <div className="colophon">Compiled with care · Set in Newsreader &amp; Geist</div>
          <div>The Serenity Brief · {new Date().getFullYear()}</div>
        </footer>
      </div>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}
