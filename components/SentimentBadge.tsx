'use client';

import { Sentiment } from '@/lib/types';

const CONFIG: Record<Sentiment, { label: string; dot: string; text: string }> = {
  bullish: { label: 'Bullish', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  bearish: { label: 'Bearish', dot: 'bg-red-400',     text: 'text-red-400'     },
  neutral: { label: 'Neutral', dot: 'bg-slate-500',   text: 'text-slate-400'   },
  mixed:   { label: 'Mixed',   dot: 'bg-amber-400',   text: 'text-amber-400'   },
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
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      {cfg.label}
      {score !== undefined && (
        <span className="font-normal opacity-50 tabular-nums">
          {score >= 0 ? '+' : ''}{score.toFixed(2)}
        </span>
      )}
    </span>
  );
}
