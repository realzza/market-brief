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
  const [fetchCooldown, setFetchCooldown] = useState(0); // seconds remaining
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

  useEffect(() => {
    if (fetchCooldown <= 0) return;
    const t = setTimeout(() => setFetchCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [fetchCooldown]);

  const setStatus = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
  };

  const FETCH_COOLDOWN_SEC = 300; // 5 min — avoid Twitter syndication rate limits

  const handleFetch = async () => {
    setFetching(true);
    setStatus('Fetching tweets from X...');
    try {
      const res = await fetch('/api/tweets', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setStatus(data.error, 'error');
        if (res.status === 429 || data.error.includes('rate-limit')) setFetchCooldown(FETCH_COOLDOWN_SEC);
        return;
      }
      setStatus(`Fetched ${data.fetched} tweets — ${data.saved} new saved.`, 'success');
      setFetchCooldown(FETCH_COOLDOWN_SEC);
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
    <div className="min-h-screen bg-[#060b11] text-slate-100">

      {/* Atmospheric glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-950/50 blur-[120px]" />
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-[#060b11]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-950/60">
                S
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-100 leading-none">Serenity Tracker</h1>
                <p className="mt-0.5 text-[11px] text-slate-600">@aleabitoreddit · AI financial intelligence</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {statusMsg && (
                <span className={`hidden max-w-xs truncate rounded-lg border px-3 py-1.5 text-xs sm:block ${statusBg}`}>
                  {statusMsg}
                </span>
              )}

              <button
                onClick={handleFetch}
                disabled={fetching || analyzing || fetchCooldown > 0}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-30"
              >
                <Download className={`h-3.5 w-3.5 ${fetching ? 'animate-pulse text-indigo-400' : ''}`} />
                {fetching ? 'Fetching…' : fetchCooldown > 0 ? `Wait ${fetchCooldown}s` : 'Fetch Tweets'}
              </button>

              {analyzing ? (
                <button
                  onClick={handleCancelAnalyze}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={fetching}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-md shadow-indigo-950/50 transition-all hover:bg-indigo-500 disabled:opacity-30"
                >
                  <Zap className="h-3.5 w-3.5" /> Analyze All
                </button>
              )}

              <button
                onClick={loadData}
                disabled={loading}
                title="Refresh"
                className="rounded-lg border border-white/[0.07] p-1.5 text-slate-600 transition-all hover:border-white/[0.12] hover:text-slate-300 disabled:opacity-30"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">

        {/* Stats */}
        {stats && <StatsBar stats={stats} />}

        {/* Tabs — underline style */}
        <div className="border-b border-white/[0.05]">
          <div className="flex gap-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-5 pb-3 pt-1 text-sm font-medium transition-colors duration-150 ${
                  activeTab === tab.id
                    ? 'text-slate-100'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                    activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-0 bottom-0 h-px bg-indigo-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Feed ── */}
        {activeTab === 'feed' && (
          <div className="space-y-5">
            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-2">
              {SENTIMENT_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSentimentFilter(f.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    sentimentFilter === f.id
                      ? 'bg-slate-700/80 text-slate-100'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
                  {f.label}
                </button>
              ))}

              {allDomains.length > 0 && (
                <div className="relative ml-1">
                  <select
                    value={domainFilter}
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="cursor-pointer appearance-none rounded-full border border-white/[0.07] bg-white/[0.03] pl-3 pr-7 py-1 text-xs font-medium text-slate-500 transition-all hover:border-white/[0.12] hover:text-slate-300 focus:outline-none"
                  >
                    <option value="">All Sectors</option>
                    {allDomains.map((d) => (
                      <option key={d} value={d}>{getDomainConfig(d).icon} {d}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
                </div>
              )}

              {domainFilter && (
                <button
                  onClick={() => setDomainFilter('')}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getDomainConfig(domainFilter).bg} ${getDomainConfig(domainFilter).color}`}
                >
                  {getDomainConfig(domainFilter).icon} {domainFilter}
                  <X className="h-3 w-3 opacity-50" />
                </button>
              )}

              <span className="ml-auto text-[11px] text-slate-700 tabular-nums">{filteredTweets.length} tweets</span>
            </div>

            {/* Tweet grid */}
            {loading && tweets.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <div className="space-y-3 text-center">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-800 border-t-indigo-500" />
                  <p className="text-xs text-slate-600">Loading…</p>
                </div>
              </div>
            ) : filteredTweets.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.05]">
                <p className="text-sm font-medium text-slate-500">No tweets found</p>
                <p className="text-xs text-slate-700">
                  {tweets.length === 0 ? 'Fetch tweets to get started.' : 'Try adjusting your filters.'}
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
          <div className="rounded-xl border border-white/[0.05] bg-[#080e1a] p-6">
            <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
              Sentiment Timeline · 30 days
            </h2>
            <SentimentChart timeline={timeline} />
          </div>
        )}

        {/* ── Asset Mentions ── */}
        {activeTab === 'assets' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.05] bg-[#080e1a] p-6">
              <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Most Mentioned Assets</h2>
              <AssetMentions topTickers={stats?.top_tickers || []} />
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-[#080e1a] p-6">
              <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Active Sectors</h2>
              <DomainChart domains={stats?.top_domains || []} />
            </div>
          </div>
        )}

        {/* ── Performance ── */}
        {activeTab === 'performance' && (
          <div className="rounded-xl border border-white/[0.05] bg-[#080e1a] p-6">
            <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Signal Performance Tracker</h2>
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
