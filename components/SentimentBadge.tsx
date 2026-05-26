'use client';

import { Sentiment } from '@/lib/types';

const CONFIG: Record<Sentiment, { label: string; dot: string; text: string }> = {
  bullish: { label: 'Bullish', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  bearish: { label: 'Bearish', dot: 'bg-red-500',     text: 'text-red-600'     },
  neutral: { label: 'Neutral', dot: 'bg-slate-400',   text: 'text-slate-500'   },
  mixed:   { label: 'Mixed',   dot: 'bg-amber-500',   text: 'text-amber-700'   },
};

export default function SentimentBadge({
  sentiment,
  score,
}: {
  sentiment: Sentiment;
  score?: number;
  size?: 'sm' | 'md';
}) {
  const cfg = CONFIG[sentiment] ?? CONFIG.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      {cfg.label}
      {score !== undefined && (
        <span className="font-normal opacity-60 tabular-nums">
          {score >= 0 ? '+' : ''}{score.toFixed(2)}
        </span>
      )}
    </span>
  );
}
