'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtPrice, fmtPct } from '@/lib/format';

interface PerformanceEntry {
  id: number;
  tweet_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  signal_date: string;
  outcome?: 'win' | 'loss' | 'breakeven' | 'pending';
  actual_return_pct?: number;
  notes?: string;
}

interface Props {
  entries: PerformanceEntry[];
  onTicker: (ticker: string) => void;
}

// ─── Position aggregation ────────────────────────────────────────────────
// One position per (asset, direction). Multiple tweets that called the
// same trade collapse into a single row — the dashboard cares about
// "which positions has this account taken," not "how many tweets did it
// take to get there."
//
// Aggregation rules (intentional defaults; can be revisited):
//   - Earliest signal owns the P&L baseline. Its entry price is the
//     position's effective entry; its running return is shown for
//     still-open positions.
//   - Latest non-null target / stop wins — later analyses can revise the
//     thesis, and the dashboard should reflect the current take.
//   - If any signal in the group has resolved (win/loss), the position is
//     resolved at that signal's outcome. Earliest resolution wins on ties.

interface Position {
  key: string;
  asset: string;
  direction: 'long' | 'short';
  signals: PerformanceEntry[];          // sorted oldest → newest
  entry_price?: number;                  // earliest signal's entry
  target_price?: number;                 // latest non-null
  stop_loss_price?: number;              // latest non-null
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  actual_return_pct?: number;            // resolved return, else earliest's running return
  first_signal_date: string;
  latest_signal_date: string;
}

function groupPositions(entries: PerformanceEntry[]): Position[] {
  const groups = new Map<string, PerformanceEntry[]>();
  for (const e of entries) {
    const key = `${e.asset}::${e.direction}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([key, raw]) => {
    const signals = raw.slice().sort(
      (a, b) => new Date(a.signal_date).getTime() - new Date(b.signal_date).getTime(),
    );
    const earliest = signals[0];
    const latest   = signals[signals.length - 1];

    const target_price    = [...signals].reverse().find((s) => s.target_price    != null)?.target_price;
    const stop_loss_price = [...signals].reverse().find((s) => s.stop_loss_price != null)?.stop_loss_price;

    const resolved = signals.find((s) => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
    const representative = resolved ?? earliest;

    return {
      key,
      asset: earliest.asset,
      direction: earliest.direction,
      signals,
      entry_price: earliest.entry_price,
      target_price,
      stop_loss_price,
      outcome: (representative.outcome ?? 'pending') as Position['outcome'],
      actual_return_pct: representative.actual_return_pct,
      first_signal_date: earliest.signal_date,
      latest_signal_date: latest.signal_date,
    };
  })
  // Open positions first, then resolved by recency. Open trades are the
  // ones the reader is actively watching; resolved ones are archive.
  .sort((a, b) => {
    const aOpen = a.outcome === 'pending' ? 1 : 0;
    const bOpen = b.outcome === 'pending' ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return new Date(b.latest_signal_date).getTime() - new Date(a.latest_signal_date).getTime();
  });
}

// ─── Position price chart ────────────────────────────────────────────────
// Inline drawer chart shown when a position row is expanded. Renders the
// asset's daily closes from the first signal date onward, with vertical
// markers at every contributing signal (so the reader sees where each buy
// landed on the curve).

interface QuoteShape {
  closes?: Array<{ t: string; c: number }>;
  intradayAll?: Array<{ t: string; c: number }>;
  error?: string;
}

// Days of intraday history Yahoo gives us via the quote endpoint. Signals
// within this window get the 5-minute granularity series (which includes
// in-progress sessions before today's daily close prints); older signals
// fall back to the 1-year daily series.
const INTRADAY_DAYS = 5;

function PositionChart({ position }: { position: Position }) {
  const [data, setData] = useState<QuoteShape | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quote?ticker=${encodeURIComponent(position.asset)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: QuoteShape) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setErrored(true); });
    return () => { cancelled = true; };
  }, [position.asset]);

  if (errored)   return <div className="perf-chart-status">Couldn’t load price chart.</div>;
  if (!data)     return <div className="perf-chart-status"><span className="spinner-inline" /> Loading chart…</div>;
  if (data.error) return <div className="perf-chart-status">{data.error}</div>;

  // Pick the highest-resolution data source that covers the signal. For
  // recent signals the daily series often has < 2 points after filtering
  // (today's close hasn't printed yet), which is what was producing the
  // "Not enough data" empty state. Intraday handles that case.
  const startTime = new Date(position.first_signal_date).getTime();
  const ageDays = (Date.now() - startTime) / 86_400_000;
  const useIntraday = ageDays <= INTRADAY_DAYS && (data.intradayAll?.length ?? 0) > 0;
  const sourcePoints = useIntraday ? (data.intradayAll ?? []) : (data.closes ?? []);
  const points = sourcePoints.filter((p) => new Date(p.t).getTime() >= startTime);

  if (points.length < 2) {
    return (
      <div className="perf-chart-status">
        {useIntraday
          ? 'Price data should populate within the next 5 minutes — Yahoo intraday has a small lag.'
          : 'Not enough price data since the first signal yet.'}
      </div>
    );
  }

  const W = 920, H = 180;
  const padL = 52, padR = 16, padT = 18, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;

  const vals = points.map((p) => p.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const yMin = min - rng * 0.05;
  const yMax = max + rng * 0.05;
  const yRng = yMax - yMin;

  const xAt = (i: number) => padL + (i / Math.max(n - 1, 1)) * innerW;
  const yAt = (v: number) => padT + ((yMax - v) / yRng) * innerH;

  let line = '';
  points.forEach((p, i) => {
    line += (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(p.c).toFixed(1) + ' ';
  });

  const isLong = position.direction === 'long';
  // Trend color matches the running direction of the position itself, not
  // just the chart's first→last delta. That way a short position making
  // money (price down) reads as bull-green, which is what the dashboard
  // owner intuitively wants.
  const ret = position.actual_return_pct;
  const dirCls = ret == null ? 'flat' : ret >= 0 ? 'up' : 'down';

  // Map each signal's timestamp to the closest point in the chosen series.
  // Intraday data lands within 5 minutes; daily data snaps to the same-day
  // close. Markers stack visually when multiple signals collide on one bar.
  const markers = position.signals.map((s) => {
    const t = new Date(s.signal_date).getTime();
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(new Date(points[i].t).getTime() - t);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return { idx: best, signal: s };
  });

  // Marker label — for intraday data, multiple signals on the same day would
  // all show "May 27" and overlap. Show HH:mm instead when we're in intraday
  // mode so each marker remains distinguishable.
  function markerLabel(iso: string): string {
    if (!useIntraday) return fmtDate(iso);
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // Sparse y-axis: 4 ticks across the visible range.
  const yTicks = [yMin, yMin + yRng * 0.33, yMin + yRng * 0.66, yMax];

  return (
    <div className="perf-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMinYMid meet" className="perf-chart">
        <g className="perf-chart-grid">
          {yTicks.map((v, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} />
          ))}
        </g>
        <g className="perf-chart-axis-y">
          {yTicks.map((v, i) => (
            <text key={i} x={padL - 8} y={yAt(v) + 3} textAnchor="end">${fmtPrice(v)}</text>
          ))}
        </g>
        <path d={line} className={`perf-chart-line ${dirCls}`} />
        {/* Signal markers — vertical guide + dot at the close on that day,
            same dot color as the position's direction. Long → up triangle,
            short → down. */}
        {markers.map((m, i) => {
          const x = xAt(m.idx);
          const y = yAt(points[m.idx].c);
          return (
            <g key={i} className={`perf-chart-marker ${isLong ? 'long' : 'short'}`}>
              <line x1={x} y1={padT} x2={x} y2={padT + innerH} />
              <circle cx={x} cy={y} r="4.5" />
              <text x={x} y={padT - 4} textAnchor="middle">
                {markerLabel(m.signal.signal_date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="perf-chart-foot">
        {n} {useIntraday ? '5-min bars' : 'trading days'} since {fmtDate(position.first_signal_date)} ·
        {' '}{position.signals.length} {position.signals.length === 1 ? 'signal' : 'signals'} ·
        {' '}{ret != null ? fmtPct(ret, 1) + ' from earliest entry' : 'running P&L not yet available'}
      </div>
    </div>
  );
}

// ─── Position row ────────────────────────────────────────────────────────

const OUTCOME_LABEL: Record<string, string> = {
  win: 'win', loss: 'loss', breakeven: 'flat', pending: 'open',
};
function outcomeColor(o: string): string {
  switch (o) {
    case 'win':       return 'var(--bull)';
    case 'loss':      return 'var(--bear)';
    case 'breakeven': return 'var(--ink-3)';
    default:          return 'var(--mixed)'; // pending / open
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={`perf-chevron ${open ? 'open' : ''}`}
      aria-hidden
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function PositionRow({ position, onTicker }: { position: Position; onTicker: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isMulti = position.signals.length > 1;
  const ret = position.actual_return_pct;

  // Date range — if the position has a single signal, show that one date;
  // multi-signal positions show "first → latest" so the span of the thesis
  // is visible at a glance.
  const dateLabel = isMulti
    ? `${fmtDate(position.first_signal_date)} → ${fmtDate(position.latest_signal_date)}`
    : fmtDate(position.first_signal_date);

  return (
    <>
      <tr
        className={`perf-row ${expanded ? 'is-expanded' : ''}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="asset">
          <button
            type="button"
            className="ticker-link"
            onClick={(e) => { e.stopPropagation(); onTicker(position.asset); }}
            title="Open quote"
          >
            ${position.asset}
          </button>
        </td>
        <td>
          <span className={`dir ${position.direction}`}>{position.direction}</span>
        </td>
        <td className="date-cell">
          {dateLabel}
          {isMulti && <span className="signal-count">{position.signals.length} signals</span>}
        </td>
        <td className="num-cell">{position.entry_price ? '$' + fmtPrice(position.entry_price) : '—'}</td>
        <td className="num-cell">{position.target_price ? '$' + fmtPrice(position.target_price) : '—'}</td>
        <td className="num-cell">{position.stop_loss_price ? '$' + fmtPrice(position.stop_loss_price) : '—'}</td>
        <td>
          <span className={`outcome ${position.outcome}`}>
            <span className="dot" style={{ background: outcomeColor(position.outcome) }} />
            {OUTCOME_LABEL[position.outcome] ?? position.outcome}
          </span>
        </td>
        <td className={`num-cell ret ${ret == null ? '' : ret >= 0 ? 'pos' : 'neg'}`}>
          {ret != null ? fmtPct(ret, 1) : '—'}
        </td>
        <td className="perf-expand-cell">
          <ChevronIcon open={expanded} />
        </td>
      </tr>
      {expanded && (
        <tr className="perf-drawer">
          <td colSpan={9}>
            <PositionChart position={position} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

export default function PerformanceDashboard({ entries, onTicker }: Props) {
  const positions = useMemo(() => groupPositions(entries), [entries]);

  const wins      = positions.filter((p) => p.outcome === 'win').length;
  const losses    = positions.filter((p) => p.outcome === 'loss').length;
  const breakeven = positions.filter((p) => p.outcome === 'breakeven').length;
  const open      = positions.filter((p) => p.outcome === 'pending').length;
  const closed    = wins + losses + breakeven;
  const winRate   = closed > 0 ? Math.round((wins / closed) * 100) : 0;
  // Returns aggregate from positions (one per ticker), not per-signal — that
  // way a position called out across 5 tweets doesn't get counted 5 times.
  const returns   = positions.filter((p) => p.actual_return_pct != null).map((p) => p.actual_return_pct!);
  const avgRet    = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  const cells = [
    { label: 'Positions', v: positions.length,    sub: `${open} open · ${closed} closed`,  bar: 100,                                              trend: 'accent'                      },
    { label: 'Win rate',  v: winRate + '%',       sub: `${wins} wins · ${losses} losses`,  bar: winRate,                                          trend: 'bull'                        },
    { label: 'Avg return',v: fmtPct(avgRet, 2),   sub: 'Across all positions',             bar: Math.min(100, Math.abs(avgRet) * 8),               trend: avgRet >= 0 ? 'bull' : 'bear' },
    { label: 'Open',      v: open,                sub: 'Still tracking',                   bar: positions.length ? (open / positions.length) * 100 : 0, trend: 'neutral'                  },
  ];

  return (
    <div>
      <div className="panel-head">
        <h3 className="panel-title">Signal performance</h3>
        <span className="panel-sub">Tracked positions · running P&amp;L</span>
      </div>

      <div className="perf-summary stats">
        {cells.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label"><span className="eyebrow">{c.label}</span></div>
            <div>
              <div className="v num">{c.v}</div>
              <div className="sub">{c.sub}</div>
            </div>
            <div className={`trend ${c.trend}`}>
              <i style={{ width: `${Math.max(c.bar, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {positions.length === 0 ? (
        <div className="empty">
          <div className="title">No positions tracked</div>
          <div className="desc">Trade calls from analyzed tweets will appear here once they’re flagged.</div>
        </div>
      ) : (
        <table className="perf-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Dir</th>
              <th>Signal</th>
              <th className="num-cell">Entry</th>
              <th className="num-cell">Target</th>
              <th className="num-cell">Stop</th>
              <th>Outcome</th>
              <th className="num-cell">Return</th>
              <th className="perf-expand-cell" aria-label="Expand chart" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <PositionRow key={p.key} position={p} onTicker={onTicker} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
