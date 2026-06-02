'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, fmtPrice, fmtPct } from '@/lib/format';
import { IS_STATIC } from '@/lib/static';

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

// Price charts come from /api/quote (Yahoo) — no backend in the static export.
// Seed state with the error (ticker-independent) so we never fetch there.
const STATIC_CHART: QuoteShape = { error: 'Live price charts are off in the static edition.' };

function PositionChart({ position }: { position: Position }) {
  const [data, setData] = useState<QuoteShape | null>(IS_STATIC ? STATIC_CHART : null);
  const [errored, setErrored] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Snapshot "now" once when the drawer mounts rather than reading the clock
  // during render (which is impure). It only seeds the signal-age decision
  // below — picking intraday vs daily chart resolution — so a single capture
  // is both correct and stable across re-renders.
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    if (IS_STATIC) return; // static export shows STATIC_CHART, never fetches
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
  const ageDays = (mountedAt - startTime) / 86_400_000;
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

  // Chart geometry — bottom padding houses the x-axis; top padding is just
  // breathing room (no marker labels live up there anymore).
  const W = 920, H = 212;
  const padL = 58, padR = 22, padT = 14, padB = 42;
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

  // ── X-axis ────────────────────────────────────────────────────────────
  // Smart format: span ≤ 18h → HH:MM, longer spans switch to MMM d (with a
  // HH:MM suffix at the boundary so multi-day intraday isn't ambiguous).
  // Ticks are evenly spaced *by index* (so off-hours / weekend gaps don't
  // create dead horizontal space), then labeled with the timestamp of the
  // data point that landed there.
  const t0 = new Date(points[0].t).getTime();
  const tN = new Date(points[n - 1].t).getTime();
  const spanMs = tN - t0;
  const HOUR = 3_600_000;

  function formatXTick(iso: string): string {
    const d = new Date(iso);
    if (spanMs <= 18 * HOUR) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (spanMs <= 5 * 24 * HOUR) {
      // Multi-day intraday: month/day, plus time so neighbouring ticks read distinctly.
      const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${md} ${hm}`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const longLabel = spanMs > 18 * HOUR && spanMs <= 5 * 24 * HOUR;
  const tickCount = Math.min(longLabel ? 4 : 6, Math.max(3, n));
  const xTickIdxs = Array.from({ length: tickCount },
    (_, i) => Math.round((i * (n - 1)) / (tickCount - 1)));

  // Markers don't carry their own time label — the x-axis is the single
  // source of truth for time, and tweet timestamps (signal_date) can fall
  // outside Yahoo's 5-min market-hour bars (overnight tweets, off-hours
  // calls). When the dot snaps to the nearest available bar, a separate
  // "signal time" label above would contradict the bar time on the axis
  // below. The hover tooltip surfaces the bar time + price on demand.

  // Sparse y-axis: 4 ticks across the visible range.
  const yTicks = [yMin, yMin + yRng * 0.33, yMin + yRng * 0.66, yMax];

  // ── Hover ─────────────────────────────────────────────────────────────
  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const rel = (local.x - padL) / Math.max(innerW, 1);
    const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setHoverIdx(idx);
  }
  function handleLeave() { setHoverIdx(null); }

  // Tooltip geometry — flips left/below the dot when it would overflow.
  let hoverGroup: React.ReactNode = null;
  if (hoverIdx != null) {
    const p = points[hoverIdx];
    const hx = xAt(hoverIdx);
    const hy = yAt(p.c);
    const entry = position.entry_price;
    const deltaPct = entry != null
      ? ((p.c - entry) / entry) * 100 * (isLong ? 1 : -1)
      : null;
    const tipW = 132, tipH = 46;
    let tipX = hx + 12;
    if (tipX + tipW > W - padR) tipX = hx - 12 - tipW;
    let tipY = hy - tipH - 10;
    if (tipY < padT) tipY = hy + 12;
    const when = new Date(p.t);
    const whenStr = spanMs <= 18 * HOUR
      ? when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : when.toLocaleString('en-US', {
          month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
    hoverGroup = (
      <g className="perf-chart-hover" pointerEvents="none">
        <line
          className="perf-chart-crosshair"
          x1={hx} x2={hx} y1={padT} y2={padT + innerH}
        />
        <circle cx={hx} cy={hy} r="3.75" className={`perf-chart-hover-dot ${dirCls}`} />
        <g transform={`translate(${tipX} ${tipY})`}>
          <rect width={tipW} height={tipH} rx="3" className="perf-chart-tip-bg" />
          <text x="11" y="19" className="perf-chart-tip-price">${fmtPrice(p.c)}</text>
          <text x="11" y="35" className="perf-chart-tip-meta">{whenStr}</text>
          {deltaPct != null && (
            <text
              x={tipW - 11} y="19" textAnchor="end"
              className={`perf-chart-tip-delta ${deltaPct >= 0 ? 'pos' : 'neg'}`}
            >
              {fmtPct(deltaPct, 1)}
            </text>
          )}
        </g>
      </g>
    );
  }

  return (
    <div className="perf-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMinYMid meet"
        className="perf-chart"
      >
        <g className="perf-chart-grid">
          {yTicks.map((v, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} />
          ))}
        </g>
        <g className="perf-chart-axis-y">
          {yTicks.map((v, i) => (
            <text key={i} x={padL - 10} y={yAt(v) + 3} textAnchor="end">${fmtPrice(v)}</text>
          ))}
        </g>

        {/* X-axis baseline + time ticks. */}
        <line
          className="perf-chart-axis-x-baseline"
          x1={padL} x2={W - padR}
          y1={padT + innerH} y2={padT + innerH}
        />
        <g className="perf-chart-axis-x">
          {xTickIdxs.map((i, k) => {
            const x = xAt(i);
            const anchor =
              k === 0 ? 'start' :
              k === xTickIdxs.length - 1 ? 'end' :
              'middle';
            return (
              <g key={k}>
                <line x1={x} x2={x} y1={padT + innerH} y2={padT + innerH + 4} />
                <text x={x} y={padT + innerH + 18} textAnchor={anchor}>
                  {formatXTick(points[i].t)}
                </text>
              </g>
            );
          })}
        </g>

        <path d={line} className={`perf-chart-line ${dirCls}`} />

        {/* Signal entry markers — solid colored dot with a paper-colored
            ring. No vertical guide; the dot sits on the price line which
            is already aligned to its x-coordinate. */}
        {markers.map((m, i) => {
          const x = xAt(m.idx);
          const y = yAt(points[m.idx].c);
          return (
            <g key={i} className={`perf-chart-marker ${isLong ? 'long' : 'short'}`}>
              <circle cx={x} cy={y} r="5" />
            </g>
          );
        })}

        {hoverGroup}

        {/* Transparent hit-test layer sits on top so hover tracks anywhere
            inside the plotting area. Rendered last → topmost in SVG. */}
        <rect
          x={padL} y={padT} width={innerW} height={innerH}
          className="perf-chart-hit"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        />
      </svg>
      <div className="perf-chart-foot">
        {n} {useIntraday ? '5-min bars' : 'trading days'} since {fmtDate(position.first_signal_date)} ·
        {' '}{position.signals.length} {position.signals.length === 1 ? 'signal' : 'signals'} ·
        {' '}{ret != null ? fmtPct(ret, 1) + ' from earliest entry' : 'running P&L not yet available'}
      </div>
    </div>
  );
}

// Realtime per-position result. A resolved position keeps its final outcome; a
// still-open one is graded by the sign of its running P&L, so a position up on
// the day counts as a provisional win and one underwater as a provisional loss.
// Open positions with no computed return yet stay 'pending' and don't count
// toward the win rate (numerator or denominator).
function liveResult(p: Position): 'win' | 'loss' | 'breakeven' | 'pending' {
  if (p.outcome !== 'pending') return p.outcome;
  const r = p.actual_return_pct;
  if (r == null) return 'pending';
  if (r > 0) return 'win';
  if (r < 0) return 'loss';
  return 'breakeven';
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

  // Factual outcome counts — these drive the Positions and Open summary cells.
  const open   = positions.filter((p) => p.outcome === 'pending').length;
  const closed = positions.length - open;

  // Realtime win rate: resolved positions keep their final outcome, still-open
  // ones are scored by the sign of their running P&L (see liveResult). The rate
  // now reflects live standings instead of reading 0% until the first trade
  // closes. Positions with no computed return yet stay undecided (excluded).
  const liveResults = positions.map(liveResult);
  const liveWins   = liveResults.filter((r) => r === 'win').length;
  const liveLosses = liveResults.filter((r) => r === 'loss').length;
  const decided    = liveResults.filter((r) => r !== 'pending').length;
  const winRate    = decided > 0 ? Math.round((liveWins / decided) * 100) : 0;
  // Returns aggregate from positions (one per ticker), not per-signal — that
  // way a position called out across 5 tweets doesn't get counted 5 times.
  const returns   = positions.filter((p) => p.actual_return_pct != null).map((p) => p.actual_return_pct!);
  const avgRet    = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  const cells = [
    { label: 'Positions', v: positions.length,    sub: `${open} open · ${closed} closed`,  bar: 100,                                              trend: 'accent'                      },
    { label: 'Win rate',  v: decided > 0 ? winRate + '%' : '—',  sub: `${liveWins} winning · ${liveLosses} losing`,  bar: winRate,                trend: 'bull'                        },
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
          <div className="desc">Trade calls from analyzed posts will appear here once they’re flagged.</div>
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
