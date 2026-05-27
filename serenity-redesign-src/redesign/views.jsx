// views.jsx — Page-level sections (Brief hero, Stats, Charts, Assets, Performance, Modal)

// ─────────────────────────────────────────────────────────────────────────────
// Today's Brief — hero
// ─────────────────────────────────────────────────────────────────────────────
function TodaysBrief({ brief, stats, onTicker }) {
  if (!brief || !brief.analysis) return null;
  const a = brief.analysis;
  const score = stats.avg_sentiment_score ?? 0;
  const lbl = sentimentLabel(score);
  const markerPct = Math.min(98, Math.max(2, ((score + 1) / 2) * 100));
  const primarySignal = a.signals?.[0];
  const primaryTicker = a.tickers?.[0];

  return (
    <section className="brief">
      <div className="container">
        <div className="brief-grid">
          <div className="brief-feature">
            <div className="brief-eyebrow">
              <span className="eyebrow">Today's Brief</span>
              <span className="eyebrow text-ink-4">·</span>
              <span className="eyebrow text-ink-4">{fmtDate(brief.created_at)} · {fmtTime(brief.created_at)}</span>
            </div>

            <h2 className="brief-headline">
              {headlineFromTweet(brief)}
            </h2>

            <p className="brief-dek">{a.summary}</p>

            <div className="brief-signal-row">
              {primaryTicker && (
                <div className="field">
                  <span className="eyebrow">Primary call</span>
                  <span className="v">
                    {primaryTicker.direction === "long" ? "Long " :
                     primaryTicker.direction === "short" ? "Short " : ""}
                    ${primaryTicker.ticker}
                  </span>
                </div>
              )}
              {primarySignal && (
                <>
                  {primarySignal.target != null && (
                    <div className="field">
                      <span className="eyebrow">Target</span>
                      <span className="v">${fmtPrice(primarySignal.target)}</span>
                    </div>
                  )}
                  {primarySignal.price != null && (
                    <div className="field">
                      <span className="eyebrow">Entry</span>
                      <span className="v">${fmtPrice(primarySignal.price)}</span>
                    </div>
                  )}
                  {primarySignal.timeframe && (
                    <div className="field">
                      <span className="eyebrow">Timeframe</span>
                      <span className="v">{primarySignal.timeframe}</span>
                    </div>
                  )}
                  <div className="field">
                    <span className="eyebrow">Confidence</span>
                    <span className="v" style={{ textTransform: "capitalize" }}>{primarySignal.confidence}</span>
                  </div>
                </>
              )}
              <div className="field">
                <span className="eyebrow">Sentiment</span>
                <span className="v">
                  <span className={SENTIMENT_TEXT[a.sentiment]} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className={`dot ${SENTIMENT_DOT[a.sentiment]}`}></span>
                    {SENTIMENT_LABEL[a.sentiment]}
                  </span>
                  <span className="text-ink-4" style={{ marginLeft: 8, fontFamily: "var(--font-mono)" }}>
                    {fmtSigned(a.sentiment_score, 2)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Mood readout */}
          <div className="mood">
            <div className="mood-block">
              <div className="eyebrow label">Market mood · 30-day avg</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="mood-score">{fmtSigned(score, 2)}<sup>/1.00</sup></span>
              </div>
              <div className="text-ink-3" style={{ fontSize: 13, fontFamily: "var(--font-serif)", fontStyle: "italic", marginTop: 8 }}>
                {lbl} · {stats.analyzed_tweets} of {stats.total_tweets} tweets analyzed
              </div>
              <div className="mood-gauge">
                <span className="marker" style={{ left: `${markerPct}%` }}></span>
                <span className="scale"><span>−1.0</span><span>0</span><span>+1.0</span></span>
              </div>
            </div>

            <div className="mood-mini-grid">
              <div className="mood-mini">
                <div className="v text-bull">{Math.round((stats.bullish_count / stats.analyzed_tweets) * 100)}<span style={{ fontSize: 16, color: "var(--ink-3)", marginLeft: 2 }}>%</span></div>
                <div className="sub">Bullish · {stats.bullish_count}</div>
              </div>
              <div className="mood-mini">
                <div className="v text-bear">{Math.round((stats.bearish_count / stats.analyzed_tweets) * 100)}<span style={{ fontSize: 16, color: "var(--ink-3)", marginLeft: 2 }}>%</span></div>
                <div className="sub">Bearish · {stats.bearish_count}</div>
              </div>
              <div className="mood-mini">
                <div className="v text-signal">{stats.trade_calls}</div>
                <div className="sub">Active signals</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Generate an editorial headline from the tweet's analysis
function headlineFromTweet(t) {
  const a = t.analysis;
  if (!a) return "Untitled note";
  // Use the first theme to title-case
  const theme = a.key_themes?.[0];
  const ticker = a.tickers?.[0]?.ticker;
  if (a.sentiment === "bullish" && ticker) return `${capitalize(theme || "Bullish setup")} — $${ticker} lifts the thesis`;
  if (a.sentiment === "bearish" && ticker) return `${capitalize(theme || "Risk")} — exiting $${ticker} as case breaks`;
  if (theme) return capitalize(theme);
  return a.summary.split(".")[0];
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─────────────────────────────────────────────────────────────────────────────
// Stats strip
// ─────────────────────────────────────────────────────────────────────────────
function StatsStrip({ stats }) {
  const analyzed = stats.analyzed_tweets || 0;
  const total = stats.total_tweets || 0;
  const bullPct = analyzed > 0 ? Math.round((stats.bullish_count / analyzed) * 100) : 0;
  const bearPct = analyzed > 0 ? Math.round((stats.bearish_count / analyzed) * 100) : 0;
  const neutPct = analyzed > 0 ? Math.round((stats.neutral_count / analyzed) * 100) : 0;
  const sigPct  = analyzed > 0 ? Math.round((stats.trade_calls / analyzed) * 100) : 0;
  const covPct  = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  const winPct  = stats.win_rate != null ? Math.round(stats.win_rate * 100) : null;

  const cells = [
    { label: "Coverage",      v: fmtCompact(total),  sub: `${analyzed} analyzed · ${covPct}%`, bar: covPct,  trend: "accent" },
    { label: "Bullish",       v: bullPct + "%",      sub: `${stats.bullish_count} tweets`,     bar: bullPct, trend: "bull"   },
    { label: "Bearish",       v: bearPct + "%",      sub: `${stats.bearish_count} tweets`,     bar: bearPct, trend: "bear"   },
    { label: "Neutral",       v: neutPct + "%",      sub: `${stats.neutral_count} tweets`,     bar: neutPct, trend: "neutral"},
    { label: "Signals",       v: stats.trade_calls,  sub: `${sigPct}% are calls`,              bar: sigPct,  trend: "signal" },
    { label: "Win rate",      v: winPct != null ? winPct + "%" : "—", sub: "Tracked outcomes", bar: winPct || 0, trend: "bull" },
  ];

  return (
    <div className="container">
      <div className="stats">
        {cells.map(c => (
          <div className="stat" key={c.label}>
            <div className="label">
              <span className="eyebrow">{c.label}</span>
            </div>
            <div>
              <div className="v num">{c.v}</div>
              <div className="sub">{c.sub}</div>
            </div>
            <div className={`trend ${c.trend}`}>
              <i style={{ width: `${Math.max(c.bar, 2)}%` }}></i>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentiment Timeline — custom SVG chart
// ─────────────────────────────────────────────────────────────────────────────
function SentimentChart({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return <div className="empty"><div className="title">No timeline data</div></div>;
  }
  const W = 920, H = 280;
  const padL = 44, padR = 16, padT = 24, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = timeline.length;
  const xStep = innerW / Math.max(1, n - 1);
  const yFor = (v) => padT + innerH * (1 - (v + 1) / 2);
  const xFor = (i) => padL + i * xStep;

  // Line path
  let line = "";
  timeline.forEach((p, i) => { line += (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(p.avg_score); });

  // Bull / bear area paths (from zero line)
  const zeroY = yFor(0);
  let bullArea = `M ${xFor(0)} ${zeroY} `;
  let bearArea = `M ${xFor(0)} ${zeroY} `;
  timeline.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(p.avg_score);
    if (p.avg_score >= 0) bullArea += `L ${x} ${y} `;
    else                  bullArea += `L ${x} ${zeroY} `;
    if (p.avg_score < 0)  bearArea += `L ${x} ${y} `;
    else                  bearArea += `L ${x} ${zeroY} `;
  });
  bullArea += `L ${xFor(n-1)} ${zeroY} Z`;
  bearArea += `L ${xFor(n-1)} ${zeroY} Z`;

  // X-axis labels — every ~6 days
  const labels = [];
  for (let i = 0; i < n; i += Math.ceil(n / 5)) labels.push(i);
  if (labels[labels.length-1] !== n-1) labels.push(n-1);

  // Y-axis ticks
  const yTicks = [-1, -0.5, 0, 0.5, 1];

  return (
    <div className="chart-host">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMinYMid meet" style={{ display: "block" }}>
        {/* gridlines */}
        <g className="chart-grid">
          {yTicks.map(t => <line key={t} x1={padL} x2={W-padR} y1={yFor(t)} y2={yFor(t)} />)}
        </g>
        {/* zero line */}
        <g className="chart-zero">
          <line x1={padL} x2={W-padR} y1={zeroY} y2={zeroY} />
        </g>
        {/* Y-axis labels */}
        <g className="chart-axis-l">
          {yTicks.map(t => (
            <text key={t} x={padL-8} y={yFor(t)+3} textAnchor="end">{t > 0 ? "+" + t.toFixed(1) : t.toFixed(1)}</text>
          ))}
        </g>
        {/* Areas */}
        <path d={bullArea} className="chart-area-bull"/>
        <path d={bearArea} className="chart-area-bear"/>
        {/* Line */}
        <path d={line} className="chart-line"/>
        {/* Dots on extremes */}
        {timeline.map((p, i) => (i % 5 === 0 || i === n-1) && (
          <circle key={i} cx={xFor(i)} cy={yFor(p.avg_score)} r="2" className="chart-dot"/>
        ))}
        {/* X-axis labels */}
        <g className="chart-axis-x">
          {labels.map(i => (
            <text key={i} x={xFor(i)} y={H-padB+18} textAnchor="middle">
              {fmtDate(timeline[i].date)}
            </text>
          ))}
        </g>
      </svg>
      <div className="chart-legend">
        <span><span className="swatch chart-area-bull"></span>Bullish days</span>
        <span><span className="swatch chart-area-bear"></span>Bearish days</span>
        <span style={{ marginLeft: "auto", color: "var(--ink-4)" }}>
          {timeline.length} days · scale −1 to +1
        </span>
      </div>
    </div>
  );
}

// Volume bars (tweet count per day)
function VolumeChart({ timeline }) {
  if (!timeline || timeline.length === 0) return null;
  const max = Math.max(...timeline.map(p => p.tweet_count));
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Tweet volume · daily</div>
      <div className="vol-bars">
        {timeline.map((p, i) => {
          const cls = p.avg_score > 0.15 ? "bull" : p.avg_score < -0.15 ? "bear" : "";
          const h = Math.max(2, (p.tweet_count / max) * 100);
          return <div key={i} className={`vbar ${cls}`} style={{ height: h + "%" }} title={`${p.date} · ${p.tweet_count} tweets`}></div>;
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10, color:"var(--ink-4)", fontFamily:"var(--font-mono)" }}>
        <span>{fmtDate(timeline[0].date)}</span>
        <span>{fmtDate(timeline[timeline.length-1].date)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Assets view — ticker league table + domain bars
// ─────────────────────────────────────────────────────────────────────────────
function AssetsView({ stats, onTicker }) {
  const tickers = stats.top_tickers || [];
  const domains = stats.top_domains || [];
  const maxT = tickers[0]?.count || 1;
  const maxD = domains[0]?.count || 1;

  return (
    <div className="panel-grid">
      <section>
        <div className="panel-head">
          <h3 className="panel-title">Most-mentioned assets</h3>
          <span className="panel-sub">Last 30 days</span>
        </div>
        <table className="assets-table">
          <thead>
            <tr><th></th><th>Symbol</th><th>Type</th><th className="bar-cell">Mentions</th><th style={{textAlign:"right"}}>Count</th></tr>
          </thead>
          <tbody>
            {tickers.map((t, i) => (
              <tr key={t.ticker} onClick={() => onTicker(t.ticker)} style={{ cursor: "pointer" }}>
                <td className="rank num">{String(i+1).padStart(2,"0")}</td>
                <td className="symbol">${t.ticker}</td>
                <td className="typ">{t.asset_type}</td>
                <td className="bar-cell">
                  <div className="bar"><i style={{ width: `${(t.count/maxT)*100}%` }}></i></div>
                </td>
                <td className="count num">{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="panel-head">
          <h3 className="panel-title">Active sectors</h3>
          <span className="panel-sub">Domains mentioned in analysis</span>
        </div>
        <div className="domain-list">
          {domains.map((d, i) => (
            <div key={d.domain} className="domain-row" style={{ color: domainColor(d.domain) }}>
              <span className="rank num">{String(i+1).padStart(2,"0")}</span>
              <span className="name">
                <span className="dot" style={{ background: domainColor(d.domain) }}></span>
                <span style={{ color: "var(--ink)" }}>{d.domain}</span>
              </span>
              <span className="bar"><i style={{ width: `${(d.count/maxD)*100}%` }}></i></span>
              <span className="count num">{d.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance view
// ─────────────────────────────────────────────────────────────────────────────
function PerformanceView({ entries }) {
  const wins      = entries.filter(e => e.outcome === "win").length;
  const losses    = entries.filter(e => e.outcome === "loss").length;
  const breakeven = entries.filter(e => e.outcome === "breakeven").length;
  const pending   = entries.filter(e => e.outcome === "pending").length;
  const closed    = wins + losses + breakeven;
  const winRate   = closed > 0 ? Math.round((wins / closed) * 100) : 0;
  const returns   = entries.filter(e => e.actual_return_pct != null).map(e => e.actual_return_pct);
  const avgRet    = returns.length > 0 ? returns.reduce((a,b)=>a+b,0) / returns.length : 0;

  const cells = [
    { label: "Total signals", v: entries.length,           sub: `${pending} open · ${closed} closed`, bar: 100, trend: "accent" },
    { label: "Win rate",      v: winRate + "%",            sub: `${wins} wins · ${losses} losses`,    bar: winRate, trend: "bull" },
    { label: "Avg return",    v: fmtPct(avgRet, 2),        sub: "Across closed trades",               bar: Math.min(100, Math.abs(avgRet)*8), trend: avgRet >= 0 ? "bull" : "bear" },
    { label: "Open",          v: pending,                  sub: "Pending outcome",                    bar: pending ? (pending/entries.length)*100 : 0, trend: "neutral" },
  ];

  return (
    <div>
      <div className="panel-head">
        <h3 className="panel-title">Signal performance</h3>
        <span className="panel-sub">Tracked trade calls · realised P&amp;L</span>
      </div>
      <div className="perf-summary stats">
        {cells.map(c => (
          <div className="stat" key={c.label}>
            <div className="label"><span className="eyebrow">{c.label}</span></div>
            <div>
              <div className="v num">{c.v}</div>
              <div className="sub">{c.sub}</div>
            </div>
            <div className={`trend ${c.trend}`}><i style={{ width: `${Math.max(c.bar, 2)}%` }}></i></div>
          </div>
        ))}
      </div>

      <table className="perf-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Dir</th>
            <th>Date</th>
            <th className="num-cell">Entry</th>
            <th className="num-cell">Target</th>
            <th className="num-cell">Stop</th>
            <th>Outcome</th>
            <th className="num-cell">Return</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id}>
              <td className="asset">${e.asset}</td>
              <td><span className={`dir ${e.direction}`}>{e.direction}</span></td>
              <td className="date-cell">{fmtDate(e.signal_date)}</td>
              <td className="num-cell">${fmtPrice(e.entry_price)}</td>
              <td className="num-cell">{e.target_price ? "$" + fmtPrice(e.target_price) : "—"}</td>
              <td className="num-cell">{e.stop_loss_price ? "$" + fmtPrice(e.stop_loss_price) : "—"}</td>
              <td>
                <span className={`outcome ${e.outcome}`}>
                  <span className="dot" style={{
                    background:
                      e.outcome === "win"       ? "var(--bull)" :
                      e.outcome === "loss"      ? "var(--bear)" :
                      e.outcome === "breakeven" ? "var(--ink-3)" :
                                                  "var(--mixed)"
                  }}></span>
                  {e.outcome}
                </span>
              </td>
              <td className={`num-cell ret ${e.actual_return_pct == null ? "" : e.actual_return_pct >= 0 ? "pos" : "neg"}`}>
                {e.actual_return_pct != null ? fmtPct(e.actual_return_pct, 1) : "—"}
              </td>
              <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{e.notes || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker modal — with period chart (1D/1W/1M/3M/YTD/1Y)
// ─────────────────────────────────────────────────────────────────────────────
const PERIODS = [
  { key: "1D",  label: "1D",  days: 1,    intraday: true },
  { key: "1W",  label: "1W",  days: 7    },
  { key: "1M",  label: "1M",  days: 30   },
  { key: "3M",  label: "3M",  days: 90   },
  { key: "YTD", label: "YTD", days: null },
  { key: "1Y",  label: "1Y",  days: 365  },
];

// Deterministic PRNG so each ticker always renders the same series.
function _seedFor(t) {
  let s = 7;
  for (let i = 0; i < t.length; i++) s = ((s * 31) + t.charCodeAt(i)) >>> 0;
  return s || 1;
}
function _rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Generate a year of daily closes — drift roughly toward `basePrice` ending today.
function buildDailySeries(ticker, basePrice) {
  const r = _rng(_seedFor(ticker));
  const days = 365;
  const pts = [];
  // start ~ 0.7–1.15× of base a year ago
  let p = basePrice * (0.70 + r() * 0.45);
  const end = new Date("2026-05-26T20:00:00Z");
  const drift = (basePrice - p) / days;
  for (let i = days; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const shock = (r() - 0.5) * 0.028;  // ~2.8% daily vol
    p = Math.max(basePrice * 0.4, p + drift + p * shock);
    pts.push({ t: d.toISOString(), c: +p.toFixed(2) });
  }
  return pts;
}
// Generate intraday 5-minute series for "today"
function buildIntradaySeries(ticker, lastClose) {
  const r = _rng(_seedFor(ticker) ^ 0xC0FFEE);
  const pts = [];
  let p = lastClose;
  const start = new Date("2026-05-26T13:30:00Z"); // 9:30 ET
  for (let i = 0; i < 78; i++) {
    const t = new Date(start);
    t.setUTCMinutes(start.getUTCMinutes() + i * 5);
    p = Math.max(0.01, p + p * (r() - 0.5) * 0.005);
    pts.push({ t: t.toISOString(), c: +p.toFixed(2) });
  }
  return pts;
}

function filterByPeriod(closes, period) {
  if (!closes.length) return closes;
  if (period.days === null) {
    const jan1 = new Date("2026-01-01T00:00:00Z").getTime();
    return closes.filter(p => new Date(p.t).getTime() >= jan1);
  }
  const cutoff = new Date("2026-05-26T20:00:00Z").getTime() - period.days * 86400000;
  return closes.filter(p => new Date(p.t).getTime() >= cutoff);
}

function fmtAxisDate(iso, intraday) {
  const d = new Date(iso);
  if (intraday) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PriceChart({ points, intraday }) {
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // dimensions
  const W = 660, H = 240;
  const padL = 56, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = points.length;
  if (n === 0) return <div className="text-ink-4" style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>Not enough data</div>;

  const vals = points.map(p => p.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  // Add 4% headroom each side
  const yMin = min - rng * 0.04;
  const yMax = max + rng * 0.04;
  const yRng = yMax - yMin;

  const xAt = (i) => padL + (i / Math.max(n - 1, 1)) * innerW;
  const yAt = (v) => padT + ((yMax - v) / yRng) * innerH;

  // Path
  let line = "";
  for (let i = 0; i < n; i++) line += (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + " " + yAt(vals[i]).toFixed(1) + " ";
  const area = `${line} L ${xAt(n-1).toFixed(1)} ${padT + innerH} L ${xAt(0).toFixed(1)} ${padT + innerH} Z`;

  // Period direction (first vs last)
  const isUp = vals[n-1] >= vals[0];
  const dirCls = isUp ? "up" : "down";

  // Y-axis ticks (5 evenly spaced)
  const yTicks = 5;
  const yTickVals = [];
  for (let i = 0; i < yTicks; i++) yTickVals.push(yMin + (yRng * i) / (yTicks - 1));

  // X-axis labels — 5 positions
  const xCount = Math.min(6, n);
  const xPositions = [];
  for (let i = 0; i < xCount; i++) xPositions.push(Math.round((i / (xCount - 1)) * (n - 1)));

  function handleMove(e) {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const frac = Math.max(0, Math.min(1, (mx - padL) / innerW));
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(idx);
  }
  function handleLeave() { setHoverIdx(null); }

  // Tooltip
  let tt = null;
  if (hoverIdx != null) {
    const hx = xAt(hoverIdx);
    const hy = yAt(vals[hoverIdx]);
    const label = fmtPrice(vals[hoverIdx]);
    const W_tt = 64, H_tt = 22;
    let tx = hx - W_tt / 2;
    tx = Math.max(padL + 2, Math.min(W - padR - W_tt - 2, tx));
    const ty = hy > padT + H_tt + 8 ? hy - H_tt - 8 : hy + 8;
    tt = { hx, hy, tx, ty, W_tt, H_tt, label };
  }

  return (
    <div className="price-chart" ref={wrapRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet">
        {/* gridlines */}
        <g className="pc-grid">
          {yTickVals.map((v, i) => <line key={i} x1={padL} x2={W-padR} y1={yAt(v)} y2={yAt(v)}/>)}
        </g>
        {/* Y-axis labels */}
        <g className="pc-axis-y">
          {yTickVals.map((v, i) => (
            <text key={i} x={padL-8} y={yAt(v)+3} textAnchor="end">${fmtPrice(v)}</text>
          ))}
        </g>
        {/* Vertical axis line */}
        <line x1={padL} y1={padT} x2={padL} y2={padT+innerH} stroke="var(--rule)" strokeWidth="1"/>
        {/* Area under */}
        <path d={area} className={isUp ? "pc-area-up" : "pc-area-down"}/>
        {/* Line */}
        <path d={line} className={`pc-line ${dirCls}`}/>
        {/* X-axis labels */}
        <g className="pc-axis-x">
          {xPositions.map((i, k) => {
            const x = xAt(i);
            const anchor = k === 0 ? "start" : k === xPositions.length-1 ? "end" : "middle";
            return <text key={k} x={x} y={H-padB+18} textAnchor={anchor}>{fmtAxisDate(points[i].t, intraday)}</text>;
          })}
        </g>
        {/* Hover crosshair */}
        {tt && (
          <g className="pc-crosshair">
            <line x1={tt.hx} y1={padT} x2={tt.hx} y2={padT+innerH}/>
            <circle cx={tt.hx} cy={tt.hy} r="4" className={dirCls}/>
          </g>
        )}
        {/* Tooltip */}
        {tt && (
          <g className="pc-tooltip">
            <rect x={tt.tx} y={tt.ty} width={tt.W_tt} height={tt.H_tt} rx="3"/>
            <text x={tt.tx + tt.W_tt/2} y={tt.ty + tt.H_tt/2 + 4} textAnchor="middle">${tt.label}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

function TickerModal({ ticker, onClose }) {
  const [activePeriod, setActivePeriod] = useState("3M");
  const [hoverPt, setHoverPt] = useState(null);

  // Stable derived data per ticker
  const profile = useMemo(() => {
    const seed = _seedFor(ticker);
    const r = _rng(seed);
    const basePrice = +(40 + r() * 1600).toFixed(2);
    const daily = buildDailySeries(ticker, basePrice);
    // Take the price + change directly from the generated series — no overrides.
    const price  = daily[daily.length-1].c;
    const prev   = daily[daily.length-2]?.c ?? price;
    const change = +(price - prev).toFixed(2);
    const intraday = buildIntradaySeries(ticker, prev);
    intraday[intraday.length-1].c = price;
    return {
      ticker,
      name: `${ticker} — sample profile`,
      exchange: ticker.length <= 3 ? "NYSE" : ticker.length === 4 ? "NASDAQ" : "—",
      currency: "USD",
      price,
      change,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      volume: +(1.2 + (seed % 80) / 10).toFixed(1) + "M",
      market_cap: ((seed * 37) % 999) + 100,
      pe: 12 + (seed % 30),
      week52: [
        Math.min(...daily.map(d => d.c)),
        Math.max(...daily.map(d => d.c)),
      ],
      dayRange: [
        Math.min(...intraday.map(d => d.c)),
        Math.max(...intraday.map(d => d.c)),
      ],
      open: intraday[0].c,
      avgSentiment: ((seed % 100) - 40) / 70,
      mentions: 4 + (seed % 30),
      daily, intraday,
    };
  }, [ticker]);

  // Compute period performance from the daily series
  const performance = useMemo(() => {
    const out = {};
    PERIODS.forEach(p => {
      if (p.intraday) {
        const pts = profile.intraday;
        if (pts.length < 2) { out[p.key] = null; return; }
        const a = pts[0].c, b = pts[pts.length-1].c;
        out[p.key] = ((b - a) / a) * 100;
      } else {
        const pts = filterByPeriod(profile.daily, p);
        if (pts.length < 2) { out[p.key] = null; return; }
        const a = pts[0].c, b = pts[pts.length-1].c;
        out[p.key] = ((b - a) / a) * 100;
      }
    });
    return out;
  }, [profile]);

  const periodMeta = PERIODS.find(p => p.key === activePeriod);
  const chartPoints = periodMeta.intraday ? profile.intraday : filterByPeriod(profile.daily, periodMeta);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPos = profile.change >= 0;
  const startPt = chartPoints[0];
  const endPt   = chartPoints[chartPoints.length-1];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="modal-symbol">${ticker}</div>
              <span className="eyebrow" style={{ padding: "3px 7px", border: "1px solid var(--rule)", borderRadius: 3 }}>
                {profile.exchange}
              </span>
            </div>
            <div className="modal-name">{profile.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="modal-price">${fmtPrice(profile.price)}</div>
              <div className={`modal-change ${isPos ? "pos" : "neg"}`}>
                {isPos ? "+" : "−"}${Math.abs(profile.change).toFixed(2)} ({fmtSigned(profile.changePct, 2)}%)
                <span className="text-ink-4" style={{ fontFamily: "var(--font-mono)", marginLeft: 6, fontSize: 10 }}>today</span>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}><Icon name="close" size={12}/></button>
          </div>
        </div>

        {/* Period chart */}
        <div className="price-chart-wrap">
          <div className="period-tabs">
            {PERIODS.map(p => {
              const pct = performance[p.key];
              const cls = pct == null ? "flat" : pct >= 0 ? "pos" : "neg";
              return (
                <button key={p.key}
                  className={`period-tab ${activePeriod === p.key ? "is-active" : ""}`}
                  onClick={() => setActivePeriod(p.key)}>
                  <span className="label">{p.label}</span>
                  <span className={`pct ${cls}`}>
                    {pct == null ? "—" : (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(1) + "%"}
                  </span>
                </button>
              );
            })}
          </div>
          <PriceChart points={chartPoints} intraday={!!periodMeta.intraday}/>
          <div className="price-chart-foot">
            <span>&nbsp;</span>
            <span>
              {periodMeta.label} · {chartPoints.length} {periodMeta.intraday ? "intraday points" : "trading days"} · hover for price
            </span>
            <span>&nbsp;</span>
          </div>
        </div>

        <div className="modal-section">
          <h4>Market data</h4>
          <div className="modal-kv">
            <div className="row"><span className="k">Open</span><span className="v">${fmtPrice(profile.open)}</span></div>
            <div className="row"><span className="k">Day range</span><span className="v">${fmtPrice(profile.dayRange[0])} – ${fmtPrice(profile.dayRange[1])}</span></div>
            <div className="row"><span className="k">52-week</span><span className="v">${fmtPrice(profile.week52[0])} – ${fmtPrice(profile.week52[1])}</span></div>
            <div className="row"><span className="k">Volume</span><span className="v">{profile.volume}</span></div>
            <div className="row"><span className="k">Market cap</span><span className="v">${profile.market_cap.toFixed(1)}B</span></div>
            <div className="row"><span className="k">P/E</span><span className="v">{profile.pe.toFixed(1)}</span></div>
          </div>
        </div>

        <div className="modal-section">
          <h4>Mentions on this feed</h4>
          <div className="modal-kv">
            <div className="row"><span className="k">Total mentions</span><span className="v num">{profile.mentions}</span></div>
            <div className="row">
              <span className="k">Avg sentiment</span>
              <span className="v">
                <span className={profile.avgSentiment > 0.15 ? "text-bull" : profile.avgSentiment < -0.15 ? "text-bear" : "text-neutral"}>
                  {fmtSigned(profile.avgSentiment, 2)}
                </span>
              </span>
            </div>
            <div className="row"><span className="k">Direction</span><span className="v">{profile.avgSentiment > 0 ? "Long bias" : profile.avgSentiment < 0 ? "Short bias" : "Mixed"}</span></div>
            <div className="row"><span className="k">First seen</span><span className="v">Apr 14, 2026</span></div>
          </div>
        </div>

        <div style={{ paddingTop: 16, borderTop: "1px solid var(--rule-soft)", display: "flex", gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>View all mentions →</button>
          <button className="btn" style={{ flex: 1, justifyContent: "center" }}>Open on Yahoo Finance</button>
        </div>

        <div className="text-ink-4" style={{ marginTop: 16, fontSize: 10, textAlign: "center", fontFamily: "var(--font-mono)" }}>
          Mock data · live build pulls from /api/quote &amp; /api/tickers-info
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  TodaysBrief, StatsStrip, SentimentChart, VolumeChart, AssetsView, PerformanceView, TickerModal,
  headlineFromTweet,
});
