'use client';

import { DashboardStats } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus, Target, Activity, Hash } from 'lucide-react';

export default function StatsBar({ stats }: { stats: DashboardStats }) {
  const analyzed = stats.analyzed_tweets || 0;
  const total    = stats.total_tweets    || 0;
  const bullPct  = analyzed > 0 ? Math.round((stats.bullish_count  / analyzed) * 100) : 0;
  const bearPct  = analyzed > 0 ? Math.round((stats.bearish_count  / analyzed) * 100) : 0;
  const neutPct  = analyzed > 0 ? Math.round((stats.neutral_count  / analyzed) * 100) : 0;
  const sigPct   = analyzed > 0 ? Math.round((stats.trade_calls    / analyzed) * 100) : 0;
  const score    = stats.avg_sentiment_score ?? 0;
  const covPct   = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  const cells = [
    {
      label: 'Coverage',
      icon: <Hash className="h-3.5 w-3.5" />,
      value: total.toLocaleString(),
      sub: `${analyzed} analyzed · ${covPct}%`,
      bar: covPct, barColor: 'bg-indigo-500',
      accent: 'text-slate-900',
    },
    {
      label: 'Bullish',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      value: `${bullPct}%`,
      sub: `${stats.bullish_count} tweets`,
      bar: bullPct, barColor: 'bg-emerald-500',
      accent: 'text-emerald-700',
    },
    {
      label: 'Bearish',
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      value: `${bearPct}%`,
      sub: `${stats.bearish_count} tweets`,
      bar: bearPct, barColor: 'bg-red-500',
      accent: 'text-red-600',
    },
    {
      label: 'Neutral',
      icon: <Minus className="h-3.5 w-3.5" />,
      value: `${neutPct}%`,
      sub: `${stats.neutral_count} tweets`,
      bar: neutPct, barColor: 'bg-slate-400',
      accent: 'text-slate-600',
    },
    {
      label: 'Avg Score',
      icon: <Activity className="h-3.5 w-3.5" />,
      value: score > 0.5  ? 'Very Bullish'
           : score > 0.15 ? 'Bullish'
           : score < -0.5 ? 'Very Bearish'
           : score < -0.15 ? 'Bearish'
           : 'Neutral',
      sub: `${score >= 0 ? '+' : ''}${score.toFixed(3)}  (scale: −1 to +1)`,
      bar: null, barColor: '',
      accent: score > 0.15 ? 'text-emerald-700' : score < -0.15 ? 'text-red-600' : 'text-slate-600',
      custom: (
        <div className="mt-3 space-y-1">
          {/* Gradient gauge: red → slate → green */}
          <div className="relative h-2 w-full rounded-full overflow-hidden"
            style={{ background: 'linear-gradient(to right, #f87171, #e2e8f0 50%, #34d399)' }}>
            {/* Marker line */}
            <div
              className="absolute top-0 bottom-0 w-[2px] rounded-full bg-slate-700 shadow"
              style={{ left: `${Math.min(98, Math.max(2, ((score + 1) / 2) * 100))}%`, transform: 'translateX(-50%)' }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 tabular-nums">
            <span>−1</span>
            <span>0</span>
            <span>+1</span>
          </div>
        </div>
      ),
    },
    {
      label: 'Signals',
      icon: <Target className="h-3.5 w-3.5" />,
      value: stats.trade_calls.toLocaleString(),
      sub: `${sigPct}% of analyzed`,
      bar: sigPct, barColor: 'bg-violet-500',
      accent: 'text-violet-700',
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6
        [&>*]:border-r [&>*]:border-b [&>*]:border-slate-100
        [&>*:nth-child(2n)]:border-r-0
        sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(3n)]:border-r-0
        lg:[&>*]:border-b-0 lg:[&>*:nth-child(3n)]:border-r lg:[&>*:nth-child(6n)]:border-r-0">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col justify-between p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-semibold uppercase tracking-widest">{c.label}</span>
              <span>{c.icon}</span>
            </div>
            <div className="mt-3">
              <p className={`text-2xl font-bold tabular-nums leading-none ${c.accent}`}>{c.value}</p>
              <p className="mt-1 text-[11px] text-slate-400">{c.sub}</p>
            </div>
            {c.custom ?? (
              <div className="mt-3 h-px w-full rounded-full bg-slate-100">
                <div
                  className={`h-px rounded-full transition-all duration-700 ${c.barColor}`}
                  style={{ width: `${Math.max(c.bar ?? 0, 1)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
