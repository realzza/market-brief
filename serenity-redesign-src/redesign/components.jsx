// components.jsx — Primitives shared across the prototype.
// Exposes everything to window at the bottom so other Babel scripts can use them.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
function fmtCompact(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}
function fmtPrice(n) {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtSigned(n, digits = 3) {
  if (n == null) return "—";
  const s = n >= 0 ? "+" : "−";
  return s + Math.abs(n).toFixed(digits);
}
function fmtPct(n, digits = 1) {
  if (n == null) return "—";
  const s = n >= 0 ? "+" : "−";
  return s + Math.abs(n).toFixed(digits) + "%";
}
function timeAgo(iso) {
  const d = new Date(iso);
  const now = new Date("2026-05-26T12:00:00Z");
  const diff = (now - d) / 1000;
  if (diff < 60)        return Math.floor(diff) + "s ago";
  if (diff < 3600)      return Math.floor(diff / 60) + "m ago";
  if (diff < 86400)     return Math.floor(diff / 3600) + "h ago";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain config — restrained dot colors keyed by domain name (no emoji)
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_TONES = {
  "AI / ML":                  { hue: 280, key: "violet"  },
  "Semiconductors":           { hue: 240, key: "blue"    },
  "CPO / Optical Networking": { hue: 200, key: "cyan"    },
  "Cloud Computing":          { hue: 215, key: "sky"     },
  "Energy":                   { hue:  60, key: "amber"   },
  "Electricity / Utilities":  { hue:  85, key: "yellow"  },
  "Electric Vehicles":        { hue: 140, key: "green"   },
  "Defense":                  { hue:  20, key: "red"     },
  "Biotech / Healthcare":     { hue: 340, key: "pink"    },
  "Financials":               { hue: 160, key: "emerald" },
  "Crypto / DeFi":            { hue:  40, key: "orange"  },
  "Macro / Fed":              { hue:  60, key: "slate"   },
  "Options Flow":             { hue: 290, key: "purple"  },
  "Real Estate":              { hue: 120, key: "lime"    },
  "Consumer Tech":            { hue: 260, key: "indigo"  },
  "Industrials":              { hue:  50, key: "stone"   },
  "Commodities":              { hue:  85, key: "ochre"   },
  "Retail / E-Commerce":      { hue:  10, key: "rose"    },
  "Telecom":                  { hue: 180, key: "teal"    },
  "Media / Entertainment":    { hue: 320, key: "fuchsia" },
};
function domainColor(name) {
  const cfg = DOMAIN_TONES[name];
  if (!cfg) return "var(--ink-3)";
  return `oklch(0.55 0.10 ${cfg.hue})`;
}
function domainColorSoft(name) {
  const cfg = DOMAIN_TONES[name];
  if (!cfg) return "var(--neutral-soft)";
  return `oklch(0.94 0.04 ${cfg.hue})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentiment helpers
// ─────────────────────────────────────────────────────────────────────────────
const SENTIMENT_LABEL = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
  mixed:   "Mixed",
};
const SENTIMENT_DOT = {
  bullish: "dot-bull",
  bearish: "dot-bear",
  neutral: "dot-neutral",
  mixed:   "dot-mixed",
};
const SENTIMENT_TEXT = {
  bullish: "text-bull",
  bearish: "text-bear",
  neutral: "text-neutral",
  mixed:   "text-mixed",
};
function sentimentLabel(s) {
  if (s > 0.55) return "Very Bullish";
  if (s > 0.15) return "Bullish";
  if (s < -0.55) return "Very Bearish";
  if (s < -0.15) return "Bearish";
  return "Neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons (svg, minimal stroke, no emoji)
// ─────────────────────────────────────────────────────────────────────────────
function Icon({ name, size = 14 }) {
  const props = { width: size, height: size, viewBox: "0 0 16 16", fill: "none",
                  stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "refresh":  return <svg {...props}><path d="M14 4v4h-4M2 12V8h4M3.5 6.5A5 5 0 0 1 13 7M12.5 9.5A5 5 0 0 1 3 9"/></svg>;
    case "download": return <svg {...props}><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10"/></svg>;
    case "zap":      return <svg {...props}><path d="M9 1L2 9h5l-1 6 7-8h-5l1-6z"/></svg>;
    case "close":    return <svg {...props}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case "sun":      return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.8 2.8l1 1M12.2 12.2l1 1M2.8 13.2l1-1M12.2 3.8l1-1"/></svg>;
    case "moon":     return <svg {...props}><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5 5.5 5.5 0 1 0 13.5 9.5z"/></svg>;
    case "external": return <svg {...props}><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L8 8"/></svg>;
    case "heart":    return <svg {...props}><path d="M8 13s-5-3.2-5-7a2.8 2.8 0 0 1 5-1.8A2.8 2.8 0 0 1 13 6c0 3.8-5 7-5 7z"/></svg>;
    case "repeat":   return <svg {...props}><path d="M3 7V5h8M13 5l-2-2M13 9v2H5M3 11l2 2"/></svg>;
    case "reply":    return <svg {...props}><path d="M14 12c0-3-2-5-5-5H3M3 7l3-3M3 7l3 3"/></svg>;
    case "image":    return <svg {...props}><rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="6" cy="7" r="1"/><path d="M14 11l-3-3-7 5"/></svg>;
    case "chevron":  return <svg {...props}><path d="M4 6l4 4 4-4"/></svg>;
    case "filter":   return <svg {...props}><path d="M2 3h12l-4.5 6V13l-3 1V9z"/></svg>;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Masthead
// ─────────────────────────────────────────────────────────────────────────────
function Masthead({
  edition, dateStr,
  fetching, analyzing, fetchCooldown,
  loading, onFetch, onAnalyze, onCancel, onRefresh,
  statusMsg, statusType,
  theme, onToggleTheme,
}) {
  const fmtCool = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  return (
    <header className="masthead">
      <div className="container">
        <div className="masthead-inner">
          <div className="masthead-meta">
            <span className="eyebrow">Edition №{edition}</span>
            <span><strong>{dateStr}</strong></span>
          </div>

          <div>
            <h1 className="masthead-title">
              The Serenity <em>Brief</em>
            </h1>
            <div className="masthead-rule"></div>
            <div className="masthead-rule-thin"></div>
            <div style={{
              display:"flex", justifyContent:"space-between",
              fontSize:10, color:"var(--ink-3)", marginTop:6, fontFamily:"var(--font-mono)",
              letterSpacing:"0.05em"
            }}>
              <span>@aleabitoreddit · Daily intelligence</span>
              <span>Analyzed by Claude · {dateStr.split(",")[0]}</span>
            </div>
          </div>

          <div className="masthead-actions">
            {statusMsg && (
              <span className={`status-pill ${statusType==="error"?"is-error":statusType==="success"?"is-success":""}`}>
                {statusMsg}
              </span>
            )}
            <button className="btn" onClick={onFetch} disabled={fetching || analyzing || fetchCooldown>0}>
              <Icon name="download" size={13}/>
              {fetching ? "Fetching…" : fetchCooldown>0 ? `Wait ${fmtCool(fetchCooldown)}` : "Fetch"}
            </button>
            {analyzing ? (
              <button className="btn btn-danger" onClick={onCancel}>
                <Icon name="close" size={13}/>Cancel
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onAnalyze} disabled={fetching}>
                <Icon name="zap" size={13}/>Analyze
              </button>
            )}
            <button className="btn btn-icon" onClick={onRefresh} title="Refresh" disabled={loading}>
              <Icon name="refresh" size={13}/>
            </button>
            <button className="btn btn-icon" onClick={onToggleTheme} title="Toggle theme">
              <Icon name={theme==="dark" ? "sun" : "moon"} size={13}/>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tweet text — renders $TICKER tokens as clickable spans
// ─────────────────────────────────────────────────────────────────────────────
const TICKER_RE = /(\$[A-Z]{1,6}(?:[-.][A-Z]{1,4})?)/g;
function TweetText({ text, onTicker }) {
  const parts = text.split(TICKER_RE);
  return (
    <p className="article-text">
      {parts.map((part, i) => {
        if (TICKER_RE.test(part)) {
          TICKER_RE.lastIndex = 0;
          const sym = part.slice(1);
          return <span key={i} className="ticker" onClick={() => onTicker(sym)}>{part}</span>;
        }
        TICKER_RE.lastIndex = 0;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tweet article card — editorial layout
// ─────────────────────────────────────────────────────────────────────────────
function TweetCard({ tweet, serial, onTicker, onAnalyzeOne, isAnalyzed }) {
  // Treat the tweet as analyzed only when the parent says so —
  // even if mock data has the analysis populated.
  const a = isAnalyzed ? tweet.analysis : null;
  const [busy, setBusy] = useState(false);

  const sentimentCls    = a ? (SENTIMENT_TEXT[a.sentiment] || SENTIMENT_TEXT.neutral) : "text-ink-4";
  const sentimentDotCls = a ? (SENTIMENT_DOT[a.sentiment]  || SENTIMENT_DOT.neutral)  : "dot-neutral";

  const handleAnalyze = () => {
    setBusy(true);
    // Simulate the /api/analyze call latency.
    setTimeout(() => {
      setBusy(false);
      onAnalyzeOne?.(tweet.id);
    }, 900);
  };

  return (
    <article className="article">
      {/* Side rail */}
      <div className="article-rail">
        <span className="date">{fmtDate(tweet.created_at)}<br/><span className="ago">{timeAgo(tweet.created_at)}</span></span>
        {a && (
          <span className={`sentiment-tag ${sentimentCls}`}>
            <span className={`dot ${sentimentDotCls}`}></span>
            {SENTIMENT_LABEL[a.sentiment]}
          </span>
        )}
        {a?.is_trade_call && (
          <span className="sentiment-tag text-signal">
            <span className="dot dot-signal"></span>
            Signal
          </span>
        )}
        <span className="serial">№ {String(serial).padStart(3,"0")}</span>
      </div>

      {/* Body */}
      <div className="article-body">
        {a?.domains?.length > 0 && (
          <div className="article-tags">
            {a.domains.map(d => (
              <span key={d} className="article-tag" style={{ color: domainColor(d) }}>
                <span className="dot" style={{ background: domainColor(d) }}></span>
                {d}
              </span>
            ))}
          </div>
        )}

        <TweetText text={tweet.text} onTicker={onTicker}/>

        {tweet.media_urls?.length > 0 && (
          <div className={`article-media ${tweet.media_urls.length > 1 ? "is-multi" : ""}`}>
            {tweet.media_urls.map((url, i) => (
              <div key={i} className="media-slot">chart {i+1}</div>
            ))}
          </div>
        )}

        {a?.summary && (
          <div className="article-summary">{a.summary}</div>
        )}

        {a?.signals?.length > 0 && (
          <div className="signals-block">
            <div className="eyebrow">Signals</div>
            {a.signals.map((s, i) => <SignalRow key={i} signal={s}/>)}
          </div>
        )}

        {a?.tickers?.length > 0 && (
          <div className="tickers-row">
            {a.tickers.map((t, i) => {
              const arrow = t.direction === "long" ? "↑" : t.direction === "short" ? "↓" : "•";
              const arrowCls = t.direction === "long" ? "long" : t.direction === "short" ? "short" : "flat";
              return (
                <span key={i} className="ticker-chip" onClick={() => onTicker(t.ticker)}>
                  <span className={`arrow ${arrowCls}`}>{arrow}</span>
                  <span className="symbol">${t.ticker}</span>
                  <span className="typ">{t.asset_type}</span>
                </span>
              );
            })}
          </div>
        )}

        {a?.key_themes?.length > 0 && (
          <div className="themes-row">
            {a.key_themes.map((th, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">·</span>}
                <span>{th}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {!a && (
          <button className="analyze-cta" onClick={handleAnalyze} disabled={busy}>
            {busy
              ? <><span className="spinner-inline"></span>Analyzing…</>
              : <><Icon name="zap" size={12}/>Analyze this tweet</>
            }
          </button>
        )}

        <div className="article-footer">
          <span className="metric"><Icon name="heart" size={11}/>{fmtCompact(tweet.like_count)}</span>
          <span className="metric"><Icon name="repeat" size={11}/>{fmtCompact(tweet.retweet_count)}</span>
          <span className="metric"><Icon name="reply" size={11}/>{fmtCompact(tweet.reply_count)}</span>
          <span className="metric">{fmtCompact(tweet.impression_count)} views</span>
          {a && (
            <button className="reanalyze" onClick={handleAnalyze} disabled={busy} title="Re-run AI analysis on this tweet">
              {busy
                ? <><span className="spinner-inline"></span>Analyzing…</>
                : <><Icon name="zap" size={11}/>Re-analyze</>
              }
            </button>
          )}
          <a className="external" href="#" onClick={(e)=>e.preventDefault()}>
            View on X<Icon name="external" size={11}/>
          </a>
        </div>
      </div>
    </article>
  );
}

function SignalRow({ signal }) {
  const cls = `signal-row is-${signal.type}`;
  const label = signal.type.replace("_", " ");
  return (
    <div className={cls}>
      <span className="label">{label}</span>
      <span className="data">
        ${signal.asset}
        {signal.price != null && <> @ ${fmtPrice(signal.price)}</>}
        {signal.target != null && <> <span className="arrow">→</span> ${fmtPrice(signal.target)}</>}
        {signal.stop_loss != null && <> · SL ${fmtPrice(signal.stop_loss)}</>}
        {signal.leverage && <> · {signal.leverage}</>}
        {signal.timeframe && <> · {signal.timeframe}</>}
      </span>
      <span className="conf">{signal.confidence}</span>
    </div>
  );
}

// Expose globals
Object.assign(window, {
  fmtCompact, fmtPrice, fmtSigned, fmtPct, timeAgo, fmtDate, fmtTime,
  DOMAIN_TONES, domainColor, domainColorSoft,
  SENTIMENT_LABEL, SENTIMENT_DOT, SENTIMENT_TEXT, sentimentLabel,
  Icon, Masthead, TweetText, TweetCard, SignalRow,
});
