'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ExternalLink, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

interface ClosePoint { t: string; c: number }

interface QuoteData {
  ticker: string;
  resolvedSymbol: string;
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
  closes: ClosePoint[];
  intraday: ClosePoint[];
  performance: { d1: number; w1: number | null; m1: number | null; m3: number | null; ytd: number | null };
}

const PERIODS: { key: keyof QuoteData['performance']; label: string; days: number | null; intraday?: true }[] = [
  { key: 'd1',  label: '1D',  days: 1,   intraday: true },
  { key: 'w1',  label: '1W',  days: 7   },
  { key: 'm1',  label: '1M',  days: 30  },
  { key: 'm3',  label: '3M',  days: 90  },
  { key: 'ytd', label: 'YTD', days: null },
];

function filterByPeriod(closes: ClosePoint[], days: number | null): ClosePoint[] {
  if (!closes.length) return closes;
  if (days === null) {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
    return closes.filter((q) => new Date(q.t).getTime() >= jan1);
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return closes.filter((q) => new Date(q.t).getTime() >= cutoff);
}

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 10)   return n.toFixed(1);
  return n.toFixed(2);
}

// ── Chart component ─────────────────────────────────────────────────────────

const CHART_W = 296;
const CHART_H = 76;
const X_LEFT  = 46; // space for y-axis labels
const Y_PAD   = 8;

interface ChartProps {
  points: ClosePoint[];
  isUp: boolean;
  onHover: (pt: ClosePoint | null) => void;
}

function PeriodChart({ points, isUp, onHover }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const vals = points.map((p) => p.c);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const rng  = max - min || 1;

  const toX = (i: number) =>
    X_LEFT + (i / Math.max(vals.length - 1, 1)) * (CHART_W - X_LEFT);
  const toY = (v: number) =>
    Y_PAD + ((max - v) / rng) * (CHART_H - 2 * Y_PAD);

  const coords = vals.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const polyPts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPts = `${X_LEFT},${CHART_H} ${polyPts} ${CHART_W},${CHART_H}`;

  const color = isUp ? '#10b981' : '#ef4444';
  const fill  = isUp ? '#d1fae5' : '#fee2e2';

  // Y-axis: 3 evenly spaced labels
  const yTicks = [max, (max + min) / 2, min];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !vals.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = CHART_W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const frac = Math.max(0, Math.min(1, (mouseX - X_LEFT) / (CHART_W - X_LEFT)));
    const idx = Math.round(frac * (vals.length - 1));
    setHoverIdx(idx);
    onHover(points[idx] ?? null);
  }

  function handleMouseLeave() {
    setHoverIdx(null);
    onHover(null);
  }

  if (!vals.length) {
    return (
      <div className="flex items-center justify-center text-[11px] text-slate-300" style={{ height: CHART_H }}>
        Not enough data
      </div>
    );
  }

  const hx = hoverIdx != null ? coords[hoverIdx].x : null;
  const hy = hoverIdx != null ? coords[hoverIdx].y : null;

  // Tooltip x: keep it inside the chart
  const ttW = 52, ttH = 16, ttR = 3;
  const ttX = hx != null ? Math.max(X_LEFT + 2, Math.min(CHART_W - ttW - 2, hx - ttW / 2)) : 0;
  const ttY = hy != null ? (hy > Y_PAD + ttH + 6 ? hy - ttH - 6 : hy + 6) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full cursor-crosshair select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Y-axis gridlines + labels */}
      {yTicks.map((v) => {
        const y = toY(v);
        return (
          <g key={v}>
            <line
              x1={X_LEFT} y1={y} x2={CHART_W} y2={y}
              stroke="#f1f5f9" strokeWidth="1"
            />
            <text
              x={X_LEFT - 4} y={y}
              textAnchor="end" fontSize="9" fill="#94a3b8"
              dominantBaseline="middle"
            >
              {fmtPrice(v)}
            </text>
          </g>
        );
      })}

      {/* Vertical axis line */}
      <line x1={X_LEFT} y1={0} x2={X_LEFT} y2={CHART_H} stroke="#e2e8f0" strokeWidth="1" />

      {/* Area fill */}
      <polygon points={areaPts} fill={fill} opacity="0.5" />

      {/* Price line */}
      <polyline
        points={polyPts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Hover crosshair */}
      {hoverIdx != null && hx != null && hy != null && (
        <>
          <line x1={hx} y1={Y_PAD} x2={hx} y2={CHART_H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" />
          <circle cx={hx} cy={hy} r="3.5" fill="white" stroke={color} strokeWidth="2" />
          {/* Price tooltip bubble */}
          <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={ttR} fill="white" stroke="#e2e8f0" strokeWidth="1" />
          <text
            x={ttX + ttW / 2} y={ttY + ttH / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9.5" fill="#1e293b" fontWeight="600"
          >
            {fmtPrice(vals[hoverIdx])}
          </text>
        </>
      )}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PctBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  const up = value >= 0;
  return (
    <span className={`font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtBig(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  return n > 0 ? n.toLocaleString() : '—';
}
function fmtDate(t: string, intraday: boolean) {
  const d = new Date(t);
  if (intraday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return t.slice(0, 10);
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface Props { ticker: string; onClose: () => void }

export default function TickerModal({ ticker, onClose }: Props) {
  const [data,   setData]   = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,  setError]  = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<keyof QuoteData['performance']>('m1');
  const [hovered, setHovered] = useState<ClosePoint | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setData(null); setError(null);
    fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => { if (e.name !== 'AbortError') setError(String(e)); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [ticker]);

  const handleKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const activeMeta = PERIODS.find((p) => p.key === activePeriod)!;

  // 1D uses intraday 5-min data; others use daily closes filtered by period
  const chartPoints: ClosePoint[] = data
    ? activeMeta.intraday
      ? data.intraday
      : filterByPeriod(data.closes, activeMeta.days)
    : [];

  const activePct = data?.performance[activePeriod] ?? null;
  const isUp = activePct != null ? activePct >= 0 : (data ? data.change >= 0 : true);

  const yfUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(data?.resolvedSymbol ?? ticker)}`;

  // Footer bar: when hovering show date + price; otherwise show period %
  const startPt = chartPoints.at(0);
  const endPt   = chartPoints.at(-1);
  const startLabel = startPt ? fmtDate(startPt.t, !!activeMeta.intraday) : '';
  const endLabel   = hovered
    ? fmtDate(hovered.t, !!activeMeta.intraday)
    : endPt ? fmtDate(endPt.t, !!activeMeta.intraday) : '';
  const midContent = hovered
    ? <span className="font-semibold text-slate-700 tabular-nums">{fmtPrice(hovered.c)}</span>
    : <PctBadge value={activePct} />;

  const stats: [string, string][] = data ? [
    ['Open',     `$${fmt(data.open)}`],
    ['Volume',   fmtBig(data.volume)],
    ['Day High', `$${fmt(data.dayHigh)}`],
    ['Day Low',  `$${fmt(data.dayLow)}`],
    ['52W High', `$${fmt(data.week52High)}`],
    ['52W Low',  `$${fmt(data.week52Low)}`],
    ['Mkt Cap',  fmtBig(data.marketCap)],
    ['Currency', data.currency],
  ] : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[380px] rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-900">${ticker}</span>
              {data?.exchange && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                  {data.exchange}
                </span>
              )}
            </div>
            {data?.name && <p className="mt-0.5 text-xs text-slate-500">{data.name}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 pt-3 space-y-3.5">
          {loading && (
            <div className="flex h-52 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          )}
          {error && !loading && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">{error}</p>
          )}

          {data && !loading && (
            <>
              {/* Price hero */}
              <div>
                <p className="text-[28px] font-bold tabular-nums leading-none text-slate-900">
                  {data.currency === 'USD' ? '$' : ''}{fmt(data.price)}
                  {data.currency !== 'USD' && (
                    <span className="ml-1.5 text-sm font-normal text-slate-400">{data.currency}</span>
                  )}
                </p>
                <div className={`mt-1.5 flex items-center gap-1 text-sm font-semibold tabular-nums ${data.change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {data.change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {data.change >= 0 ? '+' : ''}{fmt(data.change)}&ensp;
                  <span className="font-normal opacity-75">({data.change >= 0 ? '+' : ''}{fmt(data.changePct)}%)</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">today</span>
                </div>
              </div>

              {/* Period tabs + chart */}
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {/* Tabs */}
                <div className="flex border-b border-slate-100">
                  {PERIODS.map((p) => {
                    const pct = data.performance[p.key];
                    const active = activePeriod === p.key;
                    const up = pct != null ? pct >= 0 : true;
                    return (
                      <button
                        key={p.key}
                        onClick={() => { setActivePeriod(p.key); setHovered(null); }}
                        className={`flex-1 flex flex-col items-center py-1.5 text-[10px] transition-colors ${active ? 'bg-white border-b-2 border-indigo-500' : 'hover:bg-white/70'}`}
                      >
                        <span className={`font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{p.label}</span>
                        {pct != null
                          ? <span className={`tabular-nums font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '+' : ''}{pct.toFixed(1)}%</span>
                          : <span className="text-slate-300">—</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Chart */}
                <div className="px-2 pt-2 pb-1">
                  <PeriodChart points={chartPoints} isUp={isUp} onHover={setHovered} />

                  {/* Footer bar */}
                  <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 tabular-nums px-1">
                    <span>{startLabel}</span>
                    <span>{midContent}</span>
                    <span>{endLabel}</span>
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-5">
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
