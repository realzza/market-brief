// app.jsx — Top-level App: state, tabs, filters, Tweaks panel.

const { useState: useS, useEffect: useE, useMemo: useM, useCallback: useCb, useRef: useR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "standard",
  "accentHue": 35,
  "sentimentPalette": "muted",
  "serifFamily": "Newsreader",
  "feedColumns": "single",
  "showBrief": true
}/*EDITMODE-END*/;

const SENTIMENT_FILTERS = [
  { id: "all",     label: "All",          dot: "dot-neutral" },
  { id: "bullish", label: "Bullish",      dot: "dot-bull"    },
  { id: "bearish", label: "Bearish",      dot: "dot-bear"    },
  { id: "neutral", label: "Neutral",      dot: "dot-neutral" },
  { id: "mixed",   label: "Mixed",        dot: "dot-mixed"   },
  { id: "signals", label: "Signals only", dot: "dot-signal"  },
];

const TABS = [
  { id: "feed",        label: "Feed"        },
  { id: "charts",      label: "Sentiment"   },
  { id: "assets",      label: "Assets"      },
  { id: "performance", label: "Performance" },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [activeTab,        setActiveTab]        = useS("feed");
  const [sentimentFilter,  setSentimentFilter]  = useS("all");
  const [domainFilter,     setDomainFilter]     = useS("");
  const [activeTicker,     setActiveTicker]     = useS(null);
  const [fetching,         setFetching]         = useS(false);
  const [analyzing,        setAnalyzing]        = useS(false);
  const [fetchCooldown,    setFetchCooldown]    = useS(0);
  const [loading,          setLoading]          = useS(false);
  const [statusMsg,        setStatusMsg]        = useS("");
  const [statusType,       setStatusType]       = useS("info");
  // IDs of tweets whose AI analysis has been computed.
  // Empty by default — every fetched tweet starts unanalyzed; analysis
  // gets computed via the masthead "Analyze" (batch) or per-card button.
  const [analyzedIds,      setAnalyzedIds]      = useS(() => new Set());
  // Cancel ref for the batch run
  const cancelRef = useR(false);

  const tweets      = window.MOCK_TWEETS;
  const stats       = window.MOCK_STATS;
  const timeline    = window.MOCK_TIMELINE;
  const performance = window.MOCK_PERFORMANCE;
  const brief       = tweets.find(x => x.id === window.MOCK_BRIEF_ID) || tweets[0];

  // ── Theme ────────────────────────────────────────────────────────────────
  useE(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
  }, [t.theme]);
  useE(() => {
    document.documentElement.setAttribute("data-density", t.density);
  }, [t.density]);
  // accent hue override
  useE(() => {
    const r = document.documentElement.style;
    r.setProperty("--accent",      `oklch(0.52 0.135 ${t.accentHue})`);
    r.setProperty("--accent-ink",  `oklch(0.38 0.13  ${t.accentHue})`);
    r.setProperty("--accent-soft", `oklch(0.94 0.04  ${t.accentHue})`);
    r.setProperty("--accent-rule", `oklch(0.84 0.07  ${t.accentHue})`);
  }, [t.accentHue]);
  // sentiment palette
  useE(() => {
    const r = document.documentElement.style;
    if (t.sentimentPalette === "muted") {
      r.setProperty("--bull", "oklch(0.50 0.09 150)");
      r.setProperty("--bear", "oklch(0.50 0.135 28)");
      r.setProperty("--mixed","oklch(0.58 0.09 75)");
    } else if (t.sentimentPalette === "classic") {
      r.setProperty("--bull", "oklch(0.62 0.16 145)");
      r.setProperty("--bear", "oklch(0.58 0.20 28)");
      r.setProperty("--mixed","oklch(0.70 0.15 75)");
    } else if (t.sentimentPalette === "ink") {
      r.setProperty("--bull", "oklch(0.32 0.025 60)");
      r.setProperty("--bear", "oklch(0.32 0.025 60)");
      r.setProperty("--mixed","oklch(0.32 0.025 60)");
    }
  }, [t.sentimentPalette]);
  useE(() => {
    document.documentElement.style.setProperty("--font-serif",
      `"${t.serifFamily}", "Source Serif 4", Georgia, "Times New Roman", serif`);
  }, [t.serifFamily]);

  // cooldown ticker
  useE(() => {
    if (fetchCooldown <= 0) return;
    const id = setTimeout(() => setFetchCooldown(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [fetchCooldown]);

  // ── Mock handlers ────────────────────────────────────────────────────────
  const handleFetch = () => {
    setFetching(true);
    setStatusMsg("Fetching tweets from X…");
    setStatusType("info");
    setTimeout(() => {
      setStatusMsg("Fetched 12 tweets — 4 new saved.");
      setStatusType("success");
      setFetching(false);
      setFetchCooldown(900);
      setTimeout(() => setStatusMsg(""), 4000);
    }, 1600);
  };
  const handleAnalyze = () => {
    // Batch analyze: walk every tweet that hasn't been analyzed yet
    // and add it to the set with a small stagger so progress is visible.
    const pending = tweets.filter(t => !analyzedIds.has(t.id)).map(t => t.id);
    if (pending.length === 0) {
      setStatusMsg("All tweets already analyzed.");
      setStatusType("info");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }
    cancelRef.current = false;
    setAnalyzing(true);
    setStatusMsg(`Running AI analysis — 0 of ${pending.length}…`);
    setStatusType("info");
    let i = 0;
    const tick = () => {
      if (cancelRef.current) {
        setStatusMsg(`Cancelled — ${i} of ${pending.length} analyzed.`);
        setStatusType("info");
        setAnalyzing(false);
        setTimeout(() => setStatusMsg(""), 3000);
        return;
      }
      if (i >= pending.length) {
        setStatusMsg(`Done — ${pending.length} tweets analyzed.`);
        setStatusType("success");
        setAnalyzing(false);
        setTimeout(() => setStatusMsg(""), 3500);
        return;
      }
      setAnalyzedIds(prev => { const next = new Set(prev); next.add(pending[i]); return next; });
      i++;
      setStatusMsg(`Running AI analysis — ${i} of ${pending.length}…`);
      setTimeout(tick, 320);
    };
    setTimeout(tick, 200);
  };
  const handleCancel = () => {
    cancelRef.current = true;
  };
  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 700);
  };
  // Per-tweet analyze — used by both the unanalyzed CTA and the "Re-analyze" pill.
  const analyzeOne = useCb((id) => {
    setAnalyzedIds(prev => { const next = new Set(prev); next.add(id); return next; });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const allDomains = useM(() => {
    const out = new Set();
    tweets.forEach(tw => tw.analysis?.domains?.forEach(d => out.add(d)));
    return Array.from(out).sort();
  }, [tweets]);

  const filtered = tweets.filter(tw => {
    const sentOk =
      sentimentFilter === "all"     ? true :
      sentimentFilter === "signals" ? !!tw.analysis?.is_trade_call :
      tw.analysis?.sentiment === sentimentFilter;
    const domOk = !domainFilter || tw.analysis?.domains?.includes(domainFilter);
    return sentOk && domOk;
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Masthead
        edition={47}
        dateStr="Tuesday, May 26, 2026"
        fetching={fetching} analyzing={analyzing} fetchCooldown={fetchCooldown}
        loading={loading}
        onFetch={handleFetch} onAnalyze={handleAnalyze} onCancel={handleCancel} onRefresh={handleRefresh}
        statusMsg={statusMsg} statusType={statusType}
        theme={t.theme}
        onToggleTheme={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")}
      />

      {t.showBrief && <TodaysBrief brief={brief} stats={stats} onTicker={setActiveTicker}/>}

      <div style={{ padding: "32px 0 0" }}>
        <StatsStrip stats={stats}/>
      </div>

      <div className="container">
        <nav className="tabs" role="tablist">
          {TABS.map(tab => (
            <button key={tab.id} role="tab"
              className={`tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}>
              <span>{tab.label}</span>
              {tab.id === "feed"        && <span className="count num">{tweets.length}</span>}
              {tab.id === "performance" && <span className="count num">{performance.length}</span>}
            </button>
          ))}
        </nav>

        {/* ── Feed ── */}
        {activeTab === "feed" && (
          <>
            <div className="filters">
              {SENTIMENT_FILTERS.map(f => (
                <button key={f.id}
                  className={`chip ${sentimentFilter === f.id ? "is-active" : ""}`}
                  onClick={() => setSentimentFilter(f.id)}>
                  <span className={`dot ${f.dot}`}></span>{f.label}
                </button>
              ))}
              {allDomains.length > 0 && (
                <span className="select" style={{ marginLeft: 6 }}>
                  <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}>
                    <option value="">All sectors</option>
                    {allDomains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </span>
              )}
              {domainFilter && (
                <button className="chip has-border" onClick={() => setDomainFilter("")} style={{ color: domainColor(domainFilter) }}>
                  <span className="dot" style={{ background: domainColor(domainFilter) }}></span>
                  {domainFilter}
                  <Icon name="close" size={10}/>
                </button>
              )}
              <span className="filters-count">{filtered.length} of {tweets.length}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <div className="title">No tweets match these filters</div>
                <div className="desc">Try a different sentiment or sector.</div>
              </div>
            ) : (
              <div className={`feed ${t.feedColumns === "double" ? "is-two-col" : ""}`}>
                {filtered.map((tw, i) => (
                  <TweetCard key={tw.id} tweet={tw} serial={tweets.length - i}
                             onTicker={setActiveTicker}
                             isAnalyzed={analyzedIds.has(tw.id)}
                             onAnalyzeOne={analyzeOne}/>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Sentiment ── */}
        {activeTab === "charts" && (
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Sentiment timeline</h3>
              <span className="panel-sub">Rolling 30 days · avg score per day</span>
            </div>
            <SentimentChart timeline={timeline}/>
            <div style={{ marginTop: 56 }}>
              <VolumeChart timeline={timeline}/>
            </div>
          </div>
        )}

        {/* ── Assets ── */}
        {activeTab === "assets" && (
          <div className="panel">
            <AssetsView stats={stats} onTicker={setActiveTicker}/>
          </div>
        )}

        {/* ── Performance ── */}
        {activeTab === "performance" && (
          <div className="panel">
            <PerformanceView entries={performance}/>
          </div>
        )}

        <footer className="footer">
          <div className="colophon">Compiled with care · Set in Newsreader &amp; Geist · Prototyped 2026</div>
          <div>The Serenity Brief · A live redesign · {new Date().getFullYear()}</div>
        </footer>
      </div>

      {activeTicker && <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)}/>}

      {/* ── Tweaks ── */}
      <TweaksPanel>
        <TweakSection label="Theme"/>
        <TweakRadio   label="Mode"
                      value={t.theme}
                      options={["light", "dark"]}
                      onChange={v => setTweak("theme", v)}/>
        <TweakRadio   label="Density"
                      value={t.density}
                      options={["cozy", "standard", "airy"]}
                      onChange={v => setTweak("density", v)}/>
        <TweakRadio   label="Feed layout"
                      value={t.feedColumns}
                      options={["single", "double"]}
                      onChange={v => setTweak("feedColumns", v)}/>
        <TweakToggle  label="Show Today's Brief"
                      value={t.showBrief}
                      onChange={v => setTweak("showBrief", v)}/>

        <TweakSection label="Aesthetic"/>
        <TweakColor   label="Accent"
                      value={`oklch(0.52 0.135 ${t.accentHue})`}
                      options={[
                        "oklch(0.52 0.135 35)",   // terracotta
                        "oklch(0.45 0.13  240)",  // navy
                        "oklch(0.48 0.12  150)",  // forest
                        "oklch(0.40 0.08  300)",  // plum
                      ]}
                      onChange={(v) => {
                        const m = /oklch\([^ ]+ [^ ]+ ([\d.]+)/.exec(v);
                        if (m) setTweak("accentHue", parseFloat(m[1]));
                      }}/>
        <TweakRadio   label="Sentiment palette"
                      value={t.sentimentPalette}
                      options={["muted", "classic", "ink"]}
                      onChange={v => setTweak("sentimentPalette", v)}/>
        <TweakSelect  label="Display serif"
                      value={t.serifFamily}
                      options={["Newsreader", "Source Serif 4", "Cormorant Garamond", "EB Garamond", "Spectral"]}
                      onChange={v => setTweak("serifFamily", v)}/>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
