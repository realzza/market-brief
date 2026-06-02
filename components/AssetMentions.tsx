'use client';

import { useEffect, useState } from 'react';
import { domainColor } from '@/lib/domainConfig';
import { IS_STATIC } from '@/lib/static';
import TickerModal from './TickerModal';

// ─── Trending mentions ───────────────────────────────────────────────────
// Replaces the old lifetime aggregation with a rolling window (7/30/90 days
// or All). Each row shows what *changed* — daily sparkline across the
// current window, rank-delta vs the prior matching period, and a signed Δ%
// — so the panel answers "what's heating up" instead of just "who's been
// loud the longest."

type WindowKey = '7' | '30' | '90' | 'all';

interface TrendingItem {
  name: string;
  current: number;
  prior: number | null;
  deltaPct: number | null;
  series: number[] | null;
  rank: number;
  priorRank: number | null;
  isNew: boolean;
}

interface TrendingResponse {
  window: number | 'all';
  windowDays: number | null;
  generatedAt: string;
  tickers: TrendingItem[];
  domains: TrendingItem[];
  error?: string;
}

const WINDOW_OPTS: Array<{ key: WindowKey; label: string }> = [
  { key: '7',   label: '7D'  },
  { key: '30',  label: '30D' },
  { key: '90',  label: '90D' },
  { key: 'all', label: 'All' },
];

// In the static export every window's trending is computed at build time and
// passed in here, keyed by window. `getTrending` is pure-sqlite (no external
// calls), so the Assets tab stays fully functional offline.
export type TrendingByWindow = Partial<Record<WindowKey, TrendingResponse>>;

export default function AssetMentions({ initialTrending }: { initialTrending?: TrendingByWindow }) {
  const [windowKey, setWindowKey] = useState<WindowKey>('30');
  // The last fetch tagged with the window it was for, so loading can be derived
  // rather than stored (see below). null until the first fetch resolves.
  const [fetched, setFetched] = useState<{ window: WindowKey; data: TrendingResponse | null } | null>(null);
  const [exchangeMap, setExchangeMap] = useState<Record<string, string>>({});
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  // Static mode reads the baked per-window snapshot directly (no fetch). Server
  // mode uses the last fetch, but only when it's for the window in view — a
  // stale fetch for a previously selected window reads as "still loading".
  const data = IS_STATIC
    ? (initialTrending?.[windowKey] ?? null)
    : (fetched?.window === windowKey ? fetched.data : null);

  // Loading is derived, not stored: in server mode we're loading whenever the
  // last fetch isn't yet for the current window. Keeping it out of state avoids
  // a synchronous setState in the effect body (the fetch just records its
  // result + window when it resolves).
  const loading = !IS_STATIC && fetched?.window !== windowKey;

  // Fetch trending data on mount + every window change. Latest-wins via the
  // `cancelled` guard so a fast window-toggle doesn't render stale results.
  // No-op in static mode — there's no /api/trending to call.
  useEffect(() => {
    if (IS_STATIC) return;
    let cancelled = false;
    fetch(`/api/trending?window=${windowKey}`)
      .then((r) => r.json())
      .then((d: TrendingResponse) => { if (!cancelled) setFetched({ window: windowKey, data: d }); })
      .catch(() => { if (!cancelled) setFetched({ window: windowKey, data: null }); });
    return () => { cancelled = true; };
  }, [windowKey]);

  // Exchange labels — resolved against Yahoo once per ticker set. Keyed by
  // the visible tickers so windows that share symbols reuse cached lookups.
  // Skipped in static mode (Yahoo lookup needs the backend); rows just render
  // without the exchange suffix.
  useEffect(() => {
    if (IS_STATIC) return;
    const tickers = data?.tickers ?? [];
    if (tickers.length === 0) return;
    const query = tickers.map((t) => `${t.name}:unknown`).join(',');
    fetch(`/api/tickers-info?tickers=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then(setExchangeMap)
      .catch(() => {});
  }, [data?.tickers]);

  const showCompare = windowKey !== 'all';
  const period = data?.windowDays
    ? `Last ${data.windowDays} days · compared to prior ${data.windowDays}`
    : 'Lifetime · every mention since tracking began';

  return (
    <>
      <div className="assets-toolbar">
        <span className="assets-period">{period}</span>
        <div className="window-selector" role="tablist" aria-label="Time window">
          {WINDOW_OPTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={windowKey === key}
              className={`window-opt ${windowKey === key ? 'active' : ''}`}
              onClick={() => setWindowKey(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-grid">
        {/* Most-mentioned assets ───────────────────────────────────────── */}
        <section>
          <div className="panel-head">
            <h3 className="panel-title">Most-mentioned assets</h3>
            <span className="panel-sub">$TICKER from raw post text</span>
          </div>
          <TrendingTable
            kind="ticker"
            items={data?.tickers ?? []}
            loading={loading}
            showCompare={showCompare}
            exchangeMap={exchangeMap}
            onPick={setActiveTicker}
          />
        </section>

        {/* Active sectors ─────────────────────────────────────────────── */}
        <section>
          <div className="panel-head">
            <h3 className="panel-title">Active sectors</h3>
            <span className="panel-sub">Domains mentioned in analysis</span>
          </div>
          <TrendingTable
            kind="domain"
            items={data?.domains ?? []}
            loading={loading}
            showCompare={showCompare}
          />
        </section>
      </div>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────

interface TrendingTableProps {
  kind: 'ticker' | 'domain';
  items: TrendingItem[];
  loading: boolean;
  showCompare: boolean;
  exchangeMap?: Record<string, string>;
  onPick?: (name: string) => void;
}

function TrendingTable({ kind, items, loading, showCompare, exchangeMap, onPick }: TrendingTableProps) {
  if (loading && items.length === 0) {
    return <div className="trending-status">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="title">No data in this window</div>
        <div className="desc">Try a wider time range, or fetch more posts.</div>
      </div>
    );
  }

  const isTicker = kind === 'ticker';

  return (
    <table className={`trending-table ${isTicker ? 'is-tickers' : 'is-domains'}`}>
      <thead>
        <tr>
          <th className="col-rank" />
          {showCompare && <th className="col-delta" aria-label="Rank change" />}
          <th className="col-name">{isTicker ? 'Symbol' : 'Sector'}</th>
          {isTicker && <th className="col-meta">Exchange</th>}
          {showCompare && <th className="col-spark">Trend</th>}
          <th className="col-count">Count</th>
          {showCompare && <th className="col-shift">Δ vs prior</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const colorVar = !isTicker ? domainColor(item.name) : undefined;
          return (
            <tr
              key={item.name}
              className={onPick ? 'is-clickable' : ''}
              onClick={onPick ? () => onPick(item.name) : undefined}
            >
              <td className="col-rank num">{String(item.rank).padStart(2, '0')}</td>
              {showCompare && (
                <td className="col-delta"><RankDelta item={item} /></td>
              )}
              <td className="col-name">
                {isTicker ? (
                  <span className="ticker-name">${item.name}</span>
                ) : (
                  <span className="sector-name">
                    <span className="dot" style={{ background: colorVar }} />
                    {item.name}
                  </span>
                )}
              </td>
              {isTicker && (
                <td className="col-meta">
                  {exchangeMap?.[item.name] ?? '—'}
                </td>
              )}
              {showCompare && (
                <td className="col-spark">
                  <Sparkline series={item.series ?? []} color={colorVar} />
                </td>
              )}
              <td className="col-count num">{item.current}</td>
              {showCompare && (
                <td className="col-shift num"><DeltaPct item={item} /></td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Inline rank-delta badge ──────────────────────────────────────────────
// ↑N / ↓N / NEW / — — three characters wide so the column doesn't shift
// when items move around. NEW gets the accent color so new entrants pop.

function RankDelta({ item }: { item: TrendingItem }) {
  if (item.isNew) return <span className="rank-delta new">NEW</span>;
  if (item.priorRank == null) return <span className="rank-delta hold">—</span>;
  const d = item.priorRank - item.rank;
  if (d === 0) return <span className="rank-delta hold">—</span>;
  if (d > 0)   return <span className="rank-delta up">↑{Math.min(d, 99)}</span>;
  return <span className="rank-delta down">↓{Math.min(-d, 99)}</span>;
}

// ─── Inline delta-% ───────────────────────────────────────────────────────
// Signed percentage vs the prior window. Hides sign character via the
// minus glyph U+2212 so the spacing matches the "+" case.

function DeltaPct({ item }: { item: TrendingItem }) {
  if (item.isNew) return <span className="delta-pct new">new</span>;
  if (item.deltaPct == null) return <span className="delta-pct">—</span>;
  if (Math.abs(item.deltaPct) < 0.5) return <span className="delta-pct">—</span>;
  const pos = item.deltaPct >= 0;
  return (
    <span className={`delta-pct ${pos ? 'pos' : 'neg'}`}>
      {pos ? '+' : '−'}{Math.round(Math.abs(item.deltaPct))}%
    </span>
  );
}

// ─── Inline sparkline ─────────────────────────────────────────────────────
// 64×18 SVG of daily counts across the current window. Single stroke, end
// dot at the latest bucket so the present is visually anchored. Honors the
// row's color (sectors carry their own palette).

function Sparkline({ series, color }: { series: number[]; color?: string }) {
  const W = 64, H = 18;
  if (!series.length) {
    return <svg width={W} height={H} className="spark" aria-hidden />;
  }
  const max = Math.max(1, ...series);
  const n = series.length;
  const xAt = (i: number) => 1 + (i / Math.max(n - 1, 1)) * (W - 2);
  const yAt = (v: number) => H - 1 - (v / max) * (H - 2);

  let d = '';
  series.forEach((v, i) => {
    d += (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(v).toFixed(1) + ' ';
  });
  const lx = xAt(n - 1);
  const ly = yAt(series[n - 1]);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="spark" aria-hidden>
      <path d={d} style={color ? { stroke: color } : undefined} />
      <circle cx={lx} cy={ly} r="1.6" style={color ? { fill: color } : undefined} />
    </svg>
  );
}
