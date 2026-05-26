'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StoredTweet, DashboardStats } from '@/lib/types';
import { getDomainConfig } from '@/lib/domainConfig';
import TweetCard from '@/components/TweetCard';
import StatsBar from '@/components/StatsBar';
import SentimentChart from '@/components/SentimentChart';
import AssetMentions from '@/components/AssetMentions';
import PerformanceDashboard from '@/components/PerformanceDashboard';
import { RefreshCw, Download, Zap, Filter, X, ChevronDown } from 'lucide-react';

type Tab = 'feed' | 'charts' | 'assets' | 'performance';
type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'signals';

interface TimelinePoint {
  date: string;
  avg_score: number;
  tweet_count: number;
  bullish: number;
  bearish: number;
  neutral: number;
}

export default function Home() {
  const [tweets, setTweets] = useState<StoredTweet[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const cancelRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tweetsRes, statsRes, perfRes] = await Promise.all([
        fetch('/api/tweets?limit=100'),
        fetch('/api/refresh'),
        fetch('/api/performance'),
      ]);
      const tweetsData = await tweetsRes.json();
      const statsData = await statsRes.json();
      const perfData = await perfRes.json();
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

  useEffect(() => { loadData(); }, [loadData]);

  const setStatus = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
  };

  const handleFetch = async () => {
    setFetching(true);
    setStatus('Fetching tweets from X...');
    try {
      const res = await fetch('/api/tweets', { method: 'POST' });
      const data = await res.json();
      if (data.error) { setStatus(`${data.error}`, 'error'); return; }
      setStatus(`Fetched ${data.fetched} tweets — ${data.saved} new saved.`, 'success');
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
    setStatus('Running AI analysis...');
    let total = 0;
    try {
      while (!cancelRef.current) {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 10 }),
        });
        const data = await res.json();
        if (data.error) { setStatus(data.error, 'error'); break; }
        total += data.analyzed || 0;
        setStatus(`Analyzed ${total} tweets...`);
        if (!data.analyzed || data.analyzed === 0) break;
      }
      setStatus(
        cancelRef.current ? `Cancelled — ${total} tweets analyzed.` : `Done! ${total} tweets analyzed.`,
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
    setStatus('Cancelling after current batch...');
  };

  // Collect all unique domains from analyzed tweets
  const allDomains = Array.from(
    new Set(tweets.flatMap((t) => t.analysis?.domains ?? []))
  ).sort();

  const filteredTweets = tweets.filter((t) => {
    const sentOk =
      sentimentFilter === 'all' ? true :
      sentimentFilter === 'signals' ? !!t.analysis?.is_trade_call :
      t.analysis?.sentiment === sentimentFilter;
    const domainOk = !domainFilter || (t.analysis?.domains ?? []).includes(domainFilter as any);
    return sentOk && domainOk;
  });

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'feed',        label: 'Feed',       count: tweets.length },
    { id: 'charts',      label: 'Sentiment'  },
    { id: 'assets',      label: 'Assets'     },
    { id: 'performance', label: 'Performance', count: performance.length },
  ];

  const SENTIMENT_FILTERS: Array<{ id: SentimentFilter; label: string; dot: string }> = [
    { id: 'all',     label: 'All',         dot: 'bg-slate-400' },
    { id: 'bullish', label: '▲ Bullish',   dot: 'bg-emerald-400' },
    { id: 'bearish', label: '▼ Bearish',   dot: 'bg-red-400' },
    { id: 'neutral', label: '— Neutral',   dot: 'bg-slate-500' },
    { id: 'mixed',   label: '⇅ Mixed',     dot: 'bg-amber-400' },
    { id: 'signals', label: '🎯 Signals',  dot: 'bg-indigo-400' },
  ];

  const statusBg =
    statusType === 'error'   ? 'border-red-500/25 bg-red-500/5 text-red-300' :
    statusType === 'success' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300' :
    'border-indigo-500/20 bg-indigo-500/5 text-indigo-300';

  return (
    <div className="min-h-screen bg-[#080d14] text-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#080d14]/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 text-sm font-bold text-white shadow-lg shadow-indigo-900/30">
                S
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight text-slate-100">Serenity Tracker</h1>
                <p className="text-[11px] text-slate-500">@aleabitoreddit · AI financial intelligence</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {statusMsg && (
                <span className={`hidden max-w-xs truncate rounded-lg border px-3 py-1 text-xs sm:block ${statusBg}`}>
                  {statusMsg}
                </span>
              )}
              <button
                onClick={handleFetch}
                disabled={fetching || analyzing}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-40"
              >
                <Download className={`h-3.5 w-3.5 ${fetching ? 'animate-pulse text-indigo-400' : ''}`} />
                {fetching ? 'Fetching…' : 'Fetch Tweets'}
              </button>

              {analyzing ? (
                <button
                  onClick={handleCancelAnalyze}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600/80 px-3.5 py-1.5 text-xs font-medium text-white shadow transition-all hover:bg-red-600"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={fetching}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-1.5 text-xs font-medium text-white shadow shadow-indigo-900/40 transition-all hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40"
                >
                  <Zap className="h-3.5 w-3.5" /> Analyze All
                </button>
              )}

              <button
                onClick={loadData}
                disabled={loading}
                title="Refresh"
                className="rounded-xl border border-slate-700/60 p-1.5 text-slate-500 transition-all hover:border-slate-600 hover:text-slate-200 disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-7 space-y-6">
        {/* Stats */}
        {stats && <StatsBar stats={stats} />}

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-1.5 backdrop-blur">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeTab === tab.id ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Feed ── */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 shrink-0 text-slate-600" />

              {/* Sentiment filter */}
              <div className="flex gap-1">
                {SENTIMENT_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSentimentFilter(f.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      sentimentFilter === f.id
                        ? 'bg-slate-700 text-slate-100 shadow'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Domain filter */}
              {allDomains.length > 0 && (
                <div className="relative ml-1">
                  <select
                    value={domainFilter}
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="cursor-pointer appearance-none rounded-full border border-slate-700/60 bg-slate-800/60 pl-3 pr-7 py-1 text-xs font-medium text-slate-300 transition-all hover:border-slate-600 focus:outline-none"
                  >
                    <option value="">All Domains</option>
                    {allDomains.map((d) => (
                      <option key={d} value={d}>{getDomainConfig(d).icon} {d}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                </div>
              )}

              {/* Active domain badge */}
              {domainFilter && (
                <button
                  onClick={() => setDomainFilter('')}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${getDomainConfig(domainFilter).bg} ${getDomainConfig(domainFilter).color}`}
                >
                  {getDomainConfig(domainFilter).icon} {domainFilter}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              )}

              <span className="ml-auto text-xs text-slate-600">{filteredTweets.length} tweets</span>
            </div>

            {/* Tweet grid */}
            {loading && tweets.length === 0 ? (
              <div className="flex h-48 items-center justify-center">
                <div className="space-y-2 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
                  <p className="text-sm text-slate-500">Loading...</p>
                </div>
              </div>
            ) : filteredTweets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
                <p className="text-base font-medium text-slate-400">No tweets found</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  {tweets.length === 0
                    ? 'Click "Fetch Tweets" to pull the latest posts from @aleabitoreddit.'
                    : 'Try adjusting your filters.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredTweets.map((tweet) => (
                  <TweetCard key={tweet.id} tweet={tweet} onAnalyzed={loadData} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Sentiment Charts ── */}
        {activeTab === 'charts' && (
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-6 shadow backdrop-blur">
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Sentiment Timeline · 30 days
            </h2>
            <SentimentChart timeline={timeline} />
          </div>
        )}

        {/* ── Asset Mentions ── */}
        {activeTab === 'assets' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-6 shadow backdrop-blur">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Most Mentioned Assets</h2>
              <AssetMentions topTickers={stats?.top_tickers || []} />
            </div>
            <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-6 shadow backdrop-blur">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Active Domains</h2>
              <DomainChart domains={stats?.top_domains || []} />
            </div>
          </div>
        )}

        {/* ── Performance ── */}
        {activeTab === 'performance' && (
          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-6 shadow backdrop-blur">
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Signal Performance Tracker</h2>
            <PerformanceDashboard entries={performance} />
          </div>
        )}
      </main>
    </div>
  );
}

// Inline domain frequency chart (no extra file needed)
function DomainChart({ domains }: { domains: Array<{ domain: string; count: number }> }) {
  if (domains.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        No domain data yet.
      </div>
    );
  }
  const max = domains[0]?.count || 1;
  return (
    <div className="space-y-2.5">
      {domains.map((d, i) => {
        const cfg = getDomainConfig(d.domain);
        const pct = (d.count / max) * 100;
        return (
          <div key={d.domain} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-right text-xs text-slate-600">{i + 1}</span>
            <span className="text-sm">{cfg.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs font-medium ${cfg.color}`}>{d.domain}</span>
                <span className="text-xs text-slate-500">{d.count}</span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-800">
                <div
                  className="h-1 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, 3)}%`,
                    background: cfg.color.replace('text-', '').replace('-300', ''),
                    backgroundColor: 'currentColor',
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
