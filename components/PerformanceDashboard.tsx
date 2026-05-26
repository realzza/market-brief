'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';

interface PerformanceEntry {
  id: number;
  tweet_id: string;
  tweet_text: string;
  tweet_date: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  signal_date: string;
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  actual_return_pct?: number;
  notes?: string;
}

interface Props {
  entries: PerformanceEntry[];
}

const OUTCOME_COLORS = { win: '#10b981', loss: '#ef4444', breakeven: '#6b7280', pending: '#f59e0b' };

const OutcomeIcon = ({ outcome }: { outcome: string }) => {
  if (outcome === 'win') return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  if (outcome === 'loss') return <XCircle className="h-4 w-4 text-red-400" />;
  if (outcome === 'pending') return <Clock className="h-4 w-4 text-amber-400" />;
  return <TrendingUp className="h-4 w-4 text-slate-400" />;
};

export default function PerformanceDashboard({ entries }: Props) {
  const settled = entries.filter((e) => e.outcome !== 'pending');
  const wins = settled.filter((e) => e.outcome === 'win').length;
  const losses = settled.filter((e) => e.outcome === 'loss').length;
  const winRate = settled.length > 0 ? ((wins / settled.length) * 100).toFixed(1) : '—';

  const avgReturn = settled.length > 0
    ? (settled.reduce((s, e) => s + (e.actual_return_pct ?? 0), 0) / settled.length).toFixed(2)
    : null;

  const pieCounts = [
    { name: 'Win', value: wins, color: OUTCOME_COLORS.win },
    { name: 'Loss', value: losses, color: OUTCOME_COLORS.loss },
    { name: 'Breakeven', value: settled.filter((e) => e.outcome === 'breakeven').length, color: OUTCOME_COLORS.breakeven },
    { name: 'Pending', value: entries.filter((e) => e.outcome === 'pending').length, color: OUTCOME_COLORS.pending },
  ].filter((d) => d.value > 0);

  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        No trade signals logged yet. Analyze tweets to auto-detect signals, then track their outcomes here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 text-center">
          <div className="text-2xl font-bold text-slate-200">{entries.length}</div>
          <div className="text-xs text-slate-500">Total Signals</div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{winRate}%</div>
          <div className="text-xs text-slate-500">Win Rate</div>
        </div>
        <div className={`rounded-lg border p-3 text-center ${Number(avgReturn) >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
          <div className={`text-2xl font-bold ${Number(avgReturn) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgReturn !== null ? `${Number(avgReturn) >= 0 ? '+' : ''}${avgReturn}%` : '—'}
          </div>
          <div className="text-xs text-slate-500">Avg Return</div>
        </div>
      </div>

      {/* Pie chart */}
      {pieCounts.length > 0 && (
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={pieCounts} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
              {pieCounts.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [v, n]}
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* Signal list */}
      <div className="space-y-2">
        {entries.slice(0, 10).map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
            <OutcomeIcon outcome={entry.outcome} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-slate-200">{entry.asset}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${entry.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {entry.direction.toUpperCase()}
                </span>
                {entry.entry_price && <span className="text-xs text-slate-400">@ ${entry.entry_price.toLocaleString()}</span>}
                {entry.target_price && <span className="text-xs text-emerald-400">TP ${entry.target_price.toLocaleString()}</span>}
                {entry.stop_loss_price && <span className="text-xs text-red-400">SL ${entry.stop_loss_price.toLocaleString()}</span>}
                {entry.actual_return_pct != null && (
                  <span className={`ml-auto text-sm font-semibold ${entry.actual_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {entry.actual_return_pct >= 0 ? '+' : ''}{entry.actual_return_pct.toFixed(2)}%
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{entry.tweet_text}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {formatDistanceToNow(new Date(entry.signal_date), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
