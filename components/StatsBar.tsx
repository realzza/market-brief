'use client';

import { DashboardStats } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus, Zap, BarChart2, Target } from 'lucide-react';

interface Props { stats: DashboardStats }

export default function StatsBar({ stats }: Props) {
  const analyzed = stats.analyzed_tweets || 0;
  const total = stats.total_tweets || 0;
  const bullishPct = analyzed > 0 ? Math.round((stats.bullish_count / analyzed) * 100) : 0;
  const bearishPct = analyzed > 0 ? Math.round((stats.bearish_count / analyzed) * 100) : 0;
  const neutralPct = analyzed > 0 ? Math.round((stats.neutral_count / analyzed) * 100) : 0;
  const score = stats.avg_sentiment_score ?? 0;
  const coveragePct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Total */}
      <div className="col-span-1 rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4 shadow backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Coverage</span>
          <BarChart2 className="h-4 w-4 text-slate-600" />
        </div>
        <div className="text-2xl font-bold text-slate-100">{total}</div>
        <div className="mt-1 text-xs text-slate-500">tweets · {coveragePct}% analyzed</div>
        {/* Coverage bar */}
        <div className="mt-2.5 h-1 w-full rounded-full bg-slate-800">
          <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      {/* Bullish */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-emerald-600">Bullish</span>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="text-2xl font-bold text-emerald-400">{bullishPct}%</div>
        <div className="mt-1 text-xs text-emerald-700">{stats.bullish_count} tweets</div>
        <div className="mt-2.5 h-1 w-full rounded-full bg-emerald-900/30">
          <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${bullishPct}%` }} />
        </div>
      </div>

      {/* Bearish */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-red-600">Bearish</span>
          <TrendingDown className="h-4 w-4 text-red-500" />
        </div>
        <div className="text-2xl font-bold text-red-400">{bearishPct}%</div>
        <div className="mt-1 text-xs text-red-700">{stats.bearish_count} tweets</div>
        <div className="mt-2.5 h-1 w-full rounded-full bg-red-900/30">
          <div className="h-1 rounded-full bg-red-500" style={{ width: `${bearishPct}%` }} />
        </div>
      </div>

      {/* Neutral */}
      <div className="rounded-2xl border border-slate-600/30 bg-slate-800/40 p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Neutral</span>
          <Minus className="h-4 w-4 text-slate-500" />
        </div>
        <div className="text-2xl font-bold text-slate-300">{neutralPct}%</div>
        <div className="mt-1 text-xs text-slate-600">{stats.neutral_count} tweets</div>
        <div className="mt-2.5 h-1 w-full rounded-full bg-slate-700">
          <div className="h-1 rounded-full bg-slate-400" style={{ width: `${neutralPct}%` }} />
        </div>
      </div>

      {/* Avg Score */}
      <div className={`rounded-2xl border p-4 shadow ${
        score > 0.1  ? 'border-emerald-500/20 bg-emerald-500/5' :
        score < -0.1 ? 'border-red-500/20 bg-red-500/5' :
        'border-slate-700/40 bg-slate-900/60'
      }`}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg Score</span>
          <Zap className="h-4 w-4 text-amber-500" />
        </div>
        <div className={`text-2xl font-bold tabular-nums ${score > 0 ? 'text-emerald-400' : score < 0 ? 'text-red-400' : 'text-slate-300'}`}>
          {score >= 0 ? '+' : ''}{score.toFixed(3)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {score > 0.2 ? 'Broadly bullish' : score < -0.2 ? 'Broadly bearish' : 'Balanced outlook'}
        </div>
        {/* Score meter */}
        <div className="mt-2.5 flex h-1 w-full gap-px overflow-hidden rounded-full">
          <div className="h-1 rounded-l-full bg-red-500" style={{ width: '50%', opacity: score < 0 ? 1 : 0.15 }} />
          <div className="h-1 rounded-r-full bg-emerald-500" style={{ width: '50%', opacity: score > 0 ? 1 : 0.15 }} />
        </div>
      </div>

      {/* Trade Calls */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-indigo-500">Signals</span>
          <Target className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="text-2xl font-bold text-indigo-300">{stats.trade_calls}</div>
        <div className="mt-1 text-xs text-indigo-700">
          {analyzed > 0 ? Math.round((stats.trade_calls / analyzed) * 100) : 0}% of analyzed
        </div>
        <div className="mt-2.5 h-1 w-full rounded-full bg-indigo-900/30">
          <div
            className="h-1 rounded-full bg-indigo-500"
            style={{ width: `${analyzed > 0 ? Math.round((stats.trade_calls / analyzed) * 100) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
