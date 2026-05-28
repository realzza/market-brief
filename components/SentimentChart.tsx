'use client';

import { useRef, useState } from 'react';
import { fmtDate, fmtSigned } from '@/lib/format';

interface TimelinePoint {
  date: string;
  avg_score: number;
  tweet_count: number;
  bullish: number;
  bearish: number;
  neutral: number;
}

interface Props { timeline: TimelinePoint[] }

export default function SentimentChart({ timeline }: Props) {
  // Hover state lives at this level so the line chart's crosshair and the
  // matching volume bar below can highlight in sync — the two visuals
  // represent the same day, so mousing over either should light up both.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="empty">
        <div className="title">No timeline data</div>
        <div className="desc">Analyze some tweets to see the sentiment trend.</div>
      </div>
    );
  }

  const W = 920, H = 280;
  const padL = 44, padR = 16, padT = 24, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = timeline.length;
  const xStep = innerW / Math.max(1, n - 1);
  const yFor = (v: number) => padT + innerH * (1 - (v + 1) / 2);
  const xFor = (i: number) => padL + i * xStep;

  // Line path
  let line = '';
  timeline.forEach((p, i) => {
    line += (i === 0 ? 'M' : 'L') + xFor(i).toFixed(1) + ' ' + yFor(p.avg_score).toFixed(1);
  });

  // Bull / bear area paths from zero line
  const zeroY = yFor(0);
  let bullArea = `M ${xFor(0).toFixed(1)} ${zeroY.toFixed(1)} `;
  let bearArea = `M ${xFor(0).toFixed(1)} ${zeroY.toFixed(1)} `;
  timeline.forEach((p, i) => {
    const x = xFor(i).toFixed(1);
    const y = yFor(p.avg_score).toFixed(1);
    if (p.avg_score >= 0) bullArea += `L ${x} ${y} `;
    else bullArea += `L ${x} ${zeroY.toFixed(1)} `;
    if (p.avg_score < 0) bearArea += `L ${x} ${y} `;
    else bearArea += `L ${x} ${zeroY.toFixed(1)} `;
  });
  bullArea += `L ${xFor(n - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`;
  bearArea += `L ${xFor(n - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // X-axis labels
  const labels: number[] = [];
  for (let i = 0; i < n; i += Math.ceil(n / 5)) labels.push(i);
  if (labels[labels.length - 1] !== n - 1) labels.push(n - 1);

  const yTicks = [-1, -0.5, 0, 0.5, 1];

  // Volume bars
  const maxCount = Math.max(...timeline.map((p) => p.tweet_count), 1);

  // Map mouse X to the nearest day. Multiplying by W / r.width converts from
  // CSS pixels back into the SVG's viewBox coordinate system, so the
  // calculation works correctly at any chart width (responsive SVG).
  function handleMove(e: React.MouseEvent) {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const frac = Math.max(0, Math.min(1, (mx - padL) / innerW));
    setHoverIdx(Math.round(frac * (n - 1)));
  }

  // Tooltip geometry — two-line "editorial card" treatment. Width sized for
  // the longest expected payload; tx clamped so the card can't escape the
  // chart on left/right edges. ty places it above the data point when there's
  // room, otherwise below, with a small visual gap.
  const TT_W = 132;
  const TT_H = 44;
  const TT_PAD_X = 10;
  let tt: {
    hx: number; hy: number; tx: number; ty: number;
    dateLabel: string; scoreLabel: string; countLabel: string;
    above: boolean; bullish: boolean;
  } | null = null;
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
    const p = timeline[hoverIdx];
    const hx = xFor(hoverIdx);
    const hy = yFor(p.avg_score);
    let tx = hx - TT_W / 2;
    tx = Math.max(padL + 2, Math.min(W - padR - TT_W - 2, tx));
    const above = hy > padT + TT_H + 10;
    const ty = above ? hy - TT_H - 10 : hy + 10;
    tt = {
      hx, hy, tx, ty,
      dateLabel: fmtDate(p.date),
      scoreLabel: fmtSigned(p.avg_score, 2),
      countLabel: `${p.tweet_count} ${p.tweet_count === 1 ? 'tweet' : 'tweets'}`,
      above,
      bullish: p.avg_score >= 0,
    };
  }

  return (
    <div className="sentiment-chart">
      <div className="chart-host" ref={wrapRef} onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMinYMid meet"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Tooltip card shadow — soft, only on the card so it reads as a
                floating annotation rather than another flat shape on the page. */}
            <filter id="chart-tt-shadow" x="-30%" y="-30%" width="160%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.10" />
            </filter>
            {/* Subtle gradient fills replace the flat color blocks. The area
                near the zero line stays at full soft-color, fading toward
                transparent as it approaches +1 / -1, so the chart reads as
                a sentiment "swell" instead of a printer ink slab. */}
            <linearGradient id="chart-bull-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--bull)" stopOpacity="0.02" />
              <stop offset="100%" stopColor="var(--bull)" stopOpacity="0.18" />
            </linearGradient>
            <linearGradient id="chart-bear-grad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%"   stopColor="var(--bear)" stopOpacity="0.02" />
              <stop offset="100%" stopColor="var(--bear)" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          <g className="chart-grid">
            {yTicks.map((t) => (
              <line key={t} x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} />
            ))}
          </g>
          <g className="chart-zero">
            <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} />
          </g>
          <g className="chart-axis-l">
            {yTicks.map((t) => (
              <text key={t} x={padL - 8} y={yFor(t) + 3} textAnchor="end">
                {t > 0 ? '+' + t.toFixed(1) : t.toFixed(1)}
              </text>
            ))}
          </g>
          <path d={bullArea} className="chart-area-bull" fill="url(#chart-bull-grad)" />
          <path d={bearArea} className="chart-area-bear" fill="url(#chart-bear-grad)" />
          <path d={line} className="chart-line" />
          {timeline.map((p, i) =>
            (i % 5 === 0 || i === n - 1) ? (
              <circle
                key={i}
                cx={xFor(i)}
                cy={yFor(p.avg_score)}
                r="2"
                className="chart-dot"
              />
            ) : null
          )}
          <g className="chart-axis-x">
            {labels.map((i) => (
              <text key={i} x={xFor(i)} y={H - padB + 18} textAnchor="middle">
                {fmtDate(timeline[i].date)}
              </text>
            ))}
          </g>

          {/* Crosshair + tooltip card — drawn last so they paint on top.
              The card has a serif date eyebrow, a colored score figure, and
              a muted tweet count. Reads like a small annotation, not a
              debug overlay. */}
          {tt && (
            <g className="chart-crosshair">
              <line x1={tt.hx} y1={padT} x2={tt.hx} y2={padT + innerH} />
              <circle
                cx={tt.hx}
                cy={tt.hy}
                r="5"
                className={tt.bullish ? 'up' : 'down'}
              />
            </g>
          )}
          {tt && (
            <g className="chart-tooltip" filter="url(#chart-tt-shadow)">
              <rect x={tt.tx} y={tt.ty} width={TT_W} height={TT_H} rx="6" />
              <text
                x={tt.tx + TT_PAD_X}
                y={tt.ty + 16}
                className="chart-tooltip-date"
              >
                {tt.dateLabel}
              </text>
              <text
                x={tt.tx + TT_PAD_X}
                y={tt.ty + 34}
                className={`chart-tooltip-value ${tt.bullish ? 'up' : 'down'}`}
              >
                {tt.scoreLabel}
              </text>
              <text
                x={tt.tx + TT_W - TT_PAD_X}
                y={tt.ty + 34}
                textAnchor="end"
                className="chart-tooltip-count"
              >
                {tt.countLabel}
              </text>
            </g>
          )}
        </svg>

        <div className="chart-legend">
          <span>
            <span className="swatch chart-legend-bull" />
            Bullish days
          </span>
          <span>
            <span className="swatch chart-legend-bear" />
            Bearish days
          </span>
          <span className="chart-legend-meta">
            {timeline.length} days · scale −1 to +1
          </span>
        </div>
      </div>

      {/* Volume bars — also hoverable. Mousing over a bar highlights it AND
          drives the same hoverIdx so the crosshair lights up above. The
          row is padded to line up with the chart's plot area so the columns
          read as the same days. */}
      <div className="vol-section">
        <div className="vol-head">
          <span className="eyebrow">Tweet volume · daily</span>
          <span className="vol-head-meta">
            max {maxCount} · {timeline.reduce((a, b) => a + b.tweet_count, 0)} total
          </span>
        </div>
        <div className="vol-bars" onMouseLeave={() => setHoverIdx(null)}>
          {timeline.map((p, i) => {
            const cls = p.avg_score > 0.15 ? 'bull' : p.avg_score < -0.15 ? 'bear' : '';
            const h = Math.max(2, (p.tweet_count / maxCount) * 100);
            return (
              <div
                key={i}
                className={`vbar ${cls} ${hoverIdx === i ? 'is-hover' : ''}`}
                style={{ height: h + '%' }}
                title={`${fmtDate(p.date)} · ${p.tweet_count} ${p.tweet_count === 1 ? 'tweet' : 'tweets'}`}
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}
        </div>
        <div className="vol-axis">
          <span>{fmtDate(timeline[0].date)}</span>
          <span>{fmtDate(timeline[timeline.length - 1].date)}</span>
        </div>
      </div>
    </div>
  );
}
