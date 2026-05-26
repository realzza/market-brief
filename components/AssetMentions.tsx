'use client';

import { useEffect, useState } from 'react';
import TickerModal from './TickerModal';

interface Ticker {
  ticker: string;
  count: number;
  asset_type: string;
}

interface Props {
  topTickers: Ticker[];
}

const COLORS = [
  { bar: '#6366f1', bg: '#eef2ff' },
  { bar: '#0ea5e9', bg: '#f0f9ff' },
  { bar: '#10b981', bg: '#f0fdf4' },
  { bar: '#f59e0b', bg: '#fffbeb' },
  { bar: '#ec4899', bg: '#fdf2f8' },
  { bar: '#8b5cf6', bg: '#f5f3ff' },
  { bar: '#14b8a6', bg: '#f0fdfa' },
  { bar: '#f97316', bg: '#fff7ed' },
  { bar: '#06b6d4', bg: '#ecfeff' },
  { bar: '#84cc16', bg: '#f7fee7' },
];

const EXCHANGE_STYLE: Record<string, string> = {
  NASDAQ:    'text-blue-700    bg-blue-50    border-blue-200',
  NYSE:      'text-indigo-700  bg-indigo-50  border-indigo-200',
  LSE:       'text-violet-700  bg-violet-50  border-violet-200',
  TSX:       'text-red-700     bg-red-50     border-red-200',
  Crypto:    'text-orange-700  bg-orange-50  border-orange-200',
  FX:        'text-purple-700  bg-purple-50  border-purple-200',
  Commodity: 'text-amber-700   bg-amber-50   border-amber-200',
  Euronext:  'text-sky-700     bg-sky-50     border-sky-200',
  Tokyo:     'text-rose-700    bg-rose-50    border-rose-200',
  HKEX:      'text-red-700     bg-red-50     border-red-200',
  ASX:       'text-emerald-700 bg-emerald-50 border-emerald-200',
  OTC:       'text-slate-600   bg-slate-100  border-slate-200',
};

function ExchangeBadge({ label }: { label: string | undefined }) {
  if (!label) return null;
  const cls = EXCHANGE_STYLE[label] ?? 'text-slate-600 bg-slate-100 border-slate-200';
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

export default function AssetMentions({ topTickers }: Props) {
  const [exchangeMap, setExchangeMap] = useState<Record<string, string>>({});
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!topTickers.length) return;
    const query = topTickers.map((t) => `${t.ticker}:${t.asset_type}`).join(',');
    fetch(`/api/tickers-info?tickers=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then(setExchangeMap)
      .catch(() => {});
  }, [topTickers]);

  if (!topTickers || topTickers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-400">
        No asset mentions yet.
      </div>
    );
  }

  const max = topTickers[0]?.count || 1;

  return (
    <>
      <div className="space-y-2">
        {topTickers.map((t, i) => {
          const pct = (t.count / max) * 100;
          const c = COLORS[i % COLORS.length];
          const exchange = exchangeMap[t.ticker];
          return (
            <div key={t.ticker} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-right text-[11px] font-medium text-slate-400 tabular-nums">
                {i + 1}
              </span>

              <button
                onClick={() => setActiveTicker(t.ticker)}
                className="group/row flex w-28 shrink-0 items-center gap-1.5 min-w-0"
              >
                <span className="font-mono text-sm font-semibold text-slate-800 transition-colors group-hover/row:text-indigo-600">
                  ${t.ticker}
                </span>
                <ExchangeBadge label={exchange} />
              </button>

              <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-6">
                <div
                  className="h-6 rounded-full flex items-center px-2 transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, 5)}%`,
                    backgroundColor: c.bg,
                    borderRight: `2px solid ${c.bar}40`,
                  }}
                >
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.bar }} />
                </div>
              </div>

              <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-700 tabular-nums">
                {t.count}
              </span>
            </div>
          );
        })}
      </div>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}
