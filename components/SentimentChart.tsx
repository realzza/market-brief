'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface TimelinePoint {
  date: string;
  avg_score: number;
  tweet_count: number;
  bullish: number;
  bearish: number;
  neutral: number;
}

interface Props {
  timeline: TimelinePoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-medium text-slate-200">
            {typeof p.value === 'number' && p.name === 'Sentiment Score'
              ? p.value.toFixed(3)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function SentimentChart({ timeline }: Props) {
  const data = timeline.map((d) => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
    avg_score: Number(d.avg_score?.toFixed(3) ?? 0),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        No data yet — fetch and analyze tweets to see the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sentiment score over time */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Sentiment Score Over Time</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis domain={[-1, 1]} tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="avg_score"
              name="Sentiment Score"
              stroke="#10b981"
              fill="url(#scoreGrad)"
              strokeWidth={2}
              dot={{ r: 3, fill: '#10b981' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bullish/Bearish/Neutral breakdown */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Daily Sentiment Breakdown</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Bar dataKey="bullish" name="Bullish" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#475569" />
            <Bar dataKey="bearish" name="Bearish" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
