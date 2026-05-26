'use client';

import { Sentiment } from '@/lib/types';

interface Props {
  sentiment: Sentiment;
  score?: number;
  size?: 'sm' | 'md';
}

const CONFIG: Record<Sentiment, { label: string; classes: string; icon: string }> = {
  bullish: { label: 'Bullish', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: '▲' },
  bearish: { label: 'Bearish', classes: 'bg-red-500/15 text-red-400 border-red-500/30', icon: '▼' },
  neutral: { label: 'Neutral', classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: '—' },
  mixed: { label: 'Mixed', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: '⇅' },
};

export default function SentimentBadge({ sentiment, score, size = 'md' }: Props) {
  const cfg = CONFIG[sentiment] ?? CONFIG.neutral;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${cfg.classes} ${sizeClass}`}>
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
      {score !== undefined && (
        <span className="opacity-70">({score > 0 ? '+' : ''}{score.toFixed(2)})</span>
      )}
    </span>
  );
}
