'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ExternalLink, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

interface QuoteData {
  ticker: string;
  name: string;
  currency: string;
  exchange: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  open: number;
  closes: number[];
}

function Sparkline({ closes, isUp }: { closes: number[]; isUp: boolean }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 260, H = 56;
  const pts = closes
    .map((v, i) => {
      const x = (i / (closes.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = isUp ? '#10b981' : '#ef4444';
  const fill = isUp ? '#d1fae5' : '#fee2e2';

  // Close the path for area fill
  const areaPath = `M0,${H} L${pts.replace(/(\d+\.\d+),(\d+\.\d+)/g, '$1,$2')} L${W},${H} Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      <path d={`M ${pts.split(' ').join(' L ')}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={`M 0,${H} L ${pts.split(' ').join(' L ')} L ${W},${H} Z`} fill={fill} opacity="0.35" />
    </svg>
  );
}

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtBig(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n > 0) return n.toLocaleString();
  return '—';
}

interface Props {
  ticker: string;
  onClose: () => void;
}

export default function TickerModal({ ticker, onClose }: Props) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(String(e));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [ticker]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const isUp = data ? data.change >= 0 : true;
  const yfUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;

  const stats: [string, string][] = data
    ? [
        ['Open',     `$${fmt(data.open)}`],
        ['Volume',   fmtBig(data.volume)],
        ['Day High', `$${fmt(data.dayHigh)}`],
        ['Day Low',  `$${fmt(data.dayLow)}`],
        ['52W High', `$${fmt(data.week52High)}`],
        ['52W Low',  `$${fmt(data.week52Low)}`],
        ['Mkt Cap',  fmtBig(data.marketCap)],
        ['Currency', data.currency],
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[340px] rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-900">${ticker}</span>
              {data?.exchange && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                  {data.exchange}
                </span>
              )}
            </div>
            {data?.name && (
              <p className="mt-0.5 text-xs text-slate-500 leading-snug">{data.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4">
          {loading && (
            <div className="flex h-36 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          )}

          {error && !loading && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">
              {error}
            </p>
          )}

          {data && !loading && (
            <>
              {/* Price hero */}
              <div>
                <p className="text-[28px] font-bold tabular-nums leading-none text-slate-900">
                  {data.currency !== 'USD' ? '' : '$'}{fmt(data.price)}
                  {data.currency !== 'USD' && (
                    <span className="ml-1.5 text-sm font-normal text-slate-400">{data.currency}</span>
                  )}
                </p>
                <div
                  className={`mt-1.5 flex items-center gap-1 text-sm font-semibold tabular-nums ${
                    isUp ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {isUp ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {isUp ? '+' : ''}{fmt(data.change)}&ensp;
                  <span className="font-normal opacity-75">
                    ({isUp ? '+' : ''}{fmt(data.changePct)}%)
                  </span>
                </div>
              </div>

              {/* Sparkline */}
              {data.closes.length >= 2 && (
                <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 px-3 pt-2 pb-1">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                    30-day
                  </p>
                  <Sparkline closes={data.closes} isUp={isUp} />
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-0">
                {stats.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-medium text-slate-700 tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Yahoo Finance link */}
          <a
            href={yfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Yahoo Finance
          </a>
        </div>
      </div>
    </div>
  );
}
