'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { fmtPrice, fmtCompact } from '@/lib/format';

interface ClosePoint { t: string; c: number }
interface QuoteData {
  ticker: string;
  resolvedSymbol?: string;
  name?: string;
  currency?: string;
  exchange?: string;
  price?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  marketCap?: number;
  dayHigh?: number;
  dayLow?: number;
  week52High?: number;
  week52Low?: number;
  open?: number;
  closes: ClosePoint[];
  intraday: ClosePoint[];
  performance: { d1?: number; w1?: number; m1?: number; m3?: number; ytd?: number; y1?: number };
  error?: string;
}

interface Props { ticker: string; onClose: () => void }

// ── Period definitions ────────────────────────────────────────────────────────
const PERIODS = [
  { key: '1D',  label: '1D',  days: 1,    intraday: true  },
  { key: '1W',  label: '1W',  days: 7,    intraday: false },
  { key: '1M',  label: '1M',  days: 30,   intraday: false },
  { key: '3M',  label: '3M',  days: 90,   intraday: false },
  { key: 'YTD', label: 'YTD', days: null, intraday: false },
  { key: '1Y',  label: '1Y',  days: 365,  intraday: false },
];

function filterByPeriod(closes: ClosePoint[], days: number | null): ClosePoint[] {
  if (!closes.length) return closes;
  if (days === null) {
    const jan1 = new Date(new Date().getFullYear() + '-01-01T00:00:00Z').getTime();
    return closes.filter((p) => new Date(p.t).getTime() >= jan1);
  }
  const cutoff = Date.now() - days * 86_400_000;
  return closes.filter((p) => new Date(p.t).getTime() >= cutoff);
}

function fmtAxisDate(iso: string, intraday: boolean): string {
  const d = new Date(iso);
  if (intraday) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Close icon ────────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  );
}

// ── Price chart ───────────────────────────────────────────────────────────────
function PriceChart({ points, intraday }: { points: ClosePoint[]; intraday: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 660, H = 240;
  const padL = 56, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;

  const vals = useMemo(() => points.map((p) => p.c), [points]);

  if (n === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
        Not enough data
      </div>
    );
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const yMin = min - rng * 0.04;
  const yMax = max + rng * 0.04;
  const yRng = yMax - yMin;

  const xAt = (i: number) => padL + (i / Math.max(n - 1, 1)) * innerW;
  const yAt = (v: number) => padT + ((yMax - v) / yRng) * innerH;

  let line = '';
  for (let i = 0; i < n; i++) {
    line += (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(vals[i]).toFixed(1) + ' ';
  }
  const area = `${line} L ${xAt(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const isUp = vals[n - 1] >= vals[0];
  const dirCls = isUp ? 'up' : 'down';

  const yTickVals: number[] = [];
  for (let i = 0; i < 5; i++) yTickVals.push(yMin + (yRng * i) / 4);

  const xCount = Math.min(6, n);
  const xPositions: number[] = [];
  for (let i = 0; i < xCount; i++) xPositions.push(Math.round((i / Math.max(xCount - 1, 1)) * (n - 1)));

  function handleMove(e: React.MouseEvent) {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const frac = Math.max(0, Math.min(1, (mx - padL) / innerW));
    setHoverIdx(Math.round(frac * (n - 1)));
  }

  let tt: { hx: number; hy: number; tx: number; ty: number; W_tt: number; H_tt: number; label: string } | null = null;
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
    const hx = xAt(hoverIdx);
    const hy = yAt(vals[hoverIdx]);
    const W_tt = 64, H_tt = 22;
    let tx = hx - W_tt / 2;
    tx = Math.max(padL + 2, Math.min(W - padR - W_tt - 2, tx));
    const ty = hy > padT + H_tt + 8 ? hy - H_tt - 8 : hy + 8;
    tt = { hx, hy, tx, ty, W_tt, H_tt, label: fmtPrice(vals[hoverIdx]) };
  }

  return (
    <div className="price-chart" ref={wrapRef} onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet">
        <g className="pc-grid">
          {yTickVals.map((v, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} />
          ))}
        </g>
        <g className="pc-axis-y">
          {yTickVals.map((v, i) => (
            <text key={i} x={padL - 8} y={yAt(v) + 3} textAnchor="end">${fmtPrice(v)}</text>
          ))}
        </g>
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--rule)" strokeWidth="1"/>
        <path d={area} className={isUp ? 'pc-area-up' : 'pc-area-down'} />
        <path d={line} className={`pc-line ${dirCls}`} />
        <g className="pc-axis-x">
          {xPositions.map((i, k) => {
            const x = xAt(i);
            const anchor = k === 0 ? 'start' : k === xPositions.length - 1 ? 'end' : 'middle';
            return (
              <text key={k} x={x} y={H - padB + 18} textAnchor={anchor}>
                {fmtAxisDate(points[i].t, intraday)}
              </text>
            );
          })}
        </g>
        {tt && (
          <g className="pc-crosshair">
            <line x1={tt.hx} y1={padT} x2={tt.hx} y2={padT + innerH} />
            <circle cx={tt.hx} cy={tt.hy} r="4" className={dirCls} />
          </g>
        )}
        {tt && (
          <g className="pc-tooltip">
            <rect x={tt.tx} y={tt.ty} width={tt.W_tt} height={tt.H_tt} rx="3" />
            <text x={tt.tx + tt.W_tt / 2} y={tt.ty + tt.H_tt / 2 + 4} textAnchor="middle">
              ${tt.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function TickerModal({ ticker, onClose }: Props) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loadedTicker, setLoadedTicker] = useState('');
  const loading = loadedTicker !== ticker;
  const [activePeriod, setActivePeriod] = useState('3M');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: QuoteData) => { setData(d); setLoadedTicker(ticker); })
      .catch(() => setLoadedTicker(ticker));
  }, [ticker]);

  const periodMeta = PERIODS.find((p) => p.key === activePeriod) ?? PERIODS[2];

  const marketClosed = periodMeta.intraday && (data?.intraday?.length ?? 0) === 0;

  const chartPoints = useMemo(() => {
    if (!data) return [];
    if (periodMeta.intraday) {
      const intra = data.intraday ?? [];
      // Market closed / pre-market: show last 5 trading days by index
      // (date-range filter fails over weekends/holidays when gaps > 2 days)
      if (intra.length === 0) return (data.closes ?? []).slice(-5);
      return intra;
    }
    return filterByPeriod(data.closes ?? [], periodMeta.days);
  }, [data, periodMeta]);

  const perfMap: Record<string, number | undefined> = useMemo(() => {
    if (!data) return {};
    return {
      '1D': data.performance?.d1,
      '1W': data.performance?.w1,
      '1M': data.performance?.m1,
      '3M': data.performance?.m3,
      'YTD': data.performance?.ytd,
      '1Y': data.performance?.y1,
    };
  }, [data]);

  const isPos = (data?.change ?? 0) >= 0;
  const yahooUrl = `https://finance.yahoo.com/quote/${data?.resolvedSymbol ?? ticker}`;

  // Day range from intraday
  const intraPrices = data?.intraday?.map((p) => p.c) ?? [];
  const dayLow  = intraPrices.length ? Math.min(...intraPrices) : data?.dayLow;
  const dayHigh = intraPrices.length ? Math.max(...intraPrices) : data?.dayHigh;

  // 52-week from closes
  const allPrices = data?.closes?.map((p) => p.c) ?? [];
  const w52Low  = allPrices.length ? Math.min(...allPrices) : data?.week52Low;
  const w52High = allPrices.length ? Math.max(...allPrices) : data?.week52High;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="modal-symbol">${ticker}</div>
              {data?.exchange && (
                <span className="eyebrow" style={{ padding: '3px 7px', border: '1px solid var(--rule)', borderRadius: 3 }}>
                  {data.exchange}
                </span>
              )}
            </div>
            {data?.name && <div className="modal-name">{data.name}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {data?.price != null && (
              <div>
                <div className="modal-price">${fmtPrice(data.price)}</div>
                <div className={`modal-change ${isPos ? 'pos' : 'neg'}`}>
                  {isPos ? '+' : '−'}${Math.abs(data.change ?? 0).toFixed(2)}
                  {' '}({isPos ? '+' : '−'}{Math.abs(data.changePct ?? 0).toFixed(2)}%)
                  <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 6, fontSize: 10, color: 'var(--ink-4)' }}>today</span>
                </div>
              </div>
            )}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', height: 32 }}>
                <span className="spinner" />
              </div>
            )}
            <button className="modal-close" onClick={onClose}><CloseIcon /></button>
          </div>
        </div>

        {/* Error */}
        {data?.error && (
          <div style={{ padding: '12px 0', color: 'var(--bear)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {data.error}
          </div>
        )}

        {/* Price chart */}
        {data && !data.error && (
          <div className="price-chart-wrap">
            <div className="period-tabs">
              {PERIODS.map((p) => {
                const pct = perfMap[p.key];
                const cls = pct == null ? 'flat' : pct >= 0 ? 'pos' : 'neg';
                return (
                  <button
                    key={p.key}
                    className={`period-tab ${activePeriod === p.key ? 'is-active' : ''}`}
                    onClick={() => setActivePeriod(p.key)}
                  >
                    <span className="label">{p.label}</span>
                    <span className={`pct ${cls}`}>
                      {pct == null ? '—' : (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%'}
                    </span>
                  </button>
                );
              })}
            </div>
            <PriceChart points={chartPoints} intraday={!!periodMeta.intraday && !marketClosed} />
            <div className="price-chart-foot">
              {periodMeta.label} · {chartPoints.length} {
                marketClosed ? 'daily closes · market closed' :
                periodMeta.intraday ? 'intraday points' : 'trading days'
              } · hover for price
            </div>
          </div>
        )}

        {/* Market data */}
        {data && !data.error && (
          <div className="modal-section">
            <h4>Market data</h4>
            <div className="modal-kv">
              <div className="row"><span className="k">Open</span><span className="v">{data.open ? '$' + fmtPrice(data.open) : '—'}</span></div>
              <div className="row"><span className="k">Day range</span><span className="v">{dayLow && dayHigh ? `$${fmtPrice(dayLow)} – $${fmtPrice(dayHigh)}` : '—'}</span></div>
              <div className="row"><span className="k">52-week</span><span className="v">{w52Low && w52High ? `$${fmtPrice(w52Low)} – $${fmtPrice(w52High)}` : '—'}</span></div>
              <div className="row"><span className="k">Volume</span><span className="v">{data.volume ? fmtCompact(data.volume) : '—'}</span></div>
              <div className="row"><span className="k">Market cap</span><span className="v">{data.marketCap ? '$' + fmtCompact(data.marketCap) : '—'}</span></div>
              <div className="row"><span className="k">Currency</span><span className="v">{data.currency ?? '—'}</span></div>
            </div>
          </div>
        )}

        {/* Footer CTAs */}
        <div style={{ paddingTop: 16, borderTop: '1px solid var(--rule-soft)', display: 'flex', gap: 10, marginTop: 4 }}>
          <a
            href={yahooUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Open on Yahoo Finance
          </a>
        </div>
      </div>
    </div>
  );
}
