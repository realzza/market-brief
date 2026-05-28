'use client';

import { fmtDate } from '@/lib/format';

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

  return (
    <div>
      <div className="chart-host">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMinYMid meet"
          style={{ display: 'block' }}
        >
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
          <path d={bullArea} className="chart-area-bull" />
          <path d={bearArea} className="chart-area-bear" />
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
        </svg>

        <div className="chart-legend">
          <span>
            <span
              className="swatch"
              style={{ background: 'color-mix(in oklab, var(--bull) 18%, transparent)' }}
            />
            Bullish days
          </span>
          <span>
            <span
              className="swatch"
              style={{ background: 'color-mix(in oklab, var(--bear) 18%, transparent)' }}
            />
            Bearish days
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>
            {timeline.length} days · scale −1 to +1
          </span>
        </div>
      </div>

      {/* Volume bars */}
      <div style={{ marginTop: 56 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Tweet volume · daily</div>
        <div className="vol-bars">
          {timeline.map((p, i) => {
            const cls = p.avg_score > 0.15 ? 'bull' : p.avg_score < -0.15 ? 'bear' : '';
            const h = Math.max(2, (p.tweet_count / maxCount) * 100);
            return (
              <div
                key={i}
                className={`vbar ${cls}`}
                style={{ height: h + '%' }}
                title={`${p.date} · ${p.tweet_count} tweets`}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
          <span>{fmtDate(timeline[0].date)}</span>
          <span>{fmtDate(timeline[timeline.length - 1].date)}</span>
        </div>
      </div>
    </div>
  );
}
