// Mock data shaped to match lib/types.ts from the real codebase.
// All numbers are plausible but invented — for prototype display only.

window.MOCK_STATS = {
  total_tweets: 1247,
  analyzed_tweets: 1189,
  bullish_count: 542,
  bearish_count: 287,
  neutral_count: 246,
  trade_calls: 114,
  avg_sentiment_score: 0.184,
  win_rate: 0.62,
  top_tickers: [
    { ticker: "NVDA",   count: 87, asset_type: "stock"  },
    { ticker: "BTC",    count: 64, asset_type: "crypto" },
    { ticker: "TSLA",   count: 51, asset_type: "stock"  },
    { ticker: "ETH",    count: 48, asset_type: "crypto" },
    { ticker: "AAPL",   count: 39, asset_type: "stock"  },
    { ticker: "SPY",    count: 34, asset_type: "index"  },
    { ticker: "MSFT",   count: 31, asset_type: "stock"  },
    { ticker: "GLD",    count: 22, asset_type: "commodity" },
    { ticker: "META",   count: 21, asset_type: "stock"  },
    { ticker: "AMZN",   count: 19, asset_type: "stock"  },
    { ticker: "GOOGL",  count: 18, asset_type: "stock"  },
    { ticker: "QQQ",    count: 17, asset_type: "index"  },
  ],
  top_domains: [
    { domain: "AI / ML",                    count: 184 },
    { domain: "Semiconductors",             count: 142 },
    { domain: "Crypto / DeFi",              count: 118 },
    { domain: "Macro / Fed",                count:  97 },
    { domain: "CPO / Optical Networking",   count:  76 },
    { domain: "Cloud Computing",            count:  64 },
    { domain: "Energy",                     count:  52 },
    { domain: "Defense",                    count:  41 },
    { domain: "Electric Vehicles",          count:  38 },
    { domain: "Options Flow",               count:  29 },
    { domain: "Biotech / Healthcare",       count:  23 },
    { domain: "Financials",                 count:  21 },
  ],
};

// 30 days of timeline points
window.MOCK_TIMELINE = (() => {
  const out = [];
  const start = new Date("2026-04-26");
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    // a believable rolling wave
    const wave = Math.sin(i / 4.2) * 0.35 + Math.cos(i / 7) * 0.15;
    const noise = (Math.sin(i * 13.37) * 0.08);
    const score = +(wave + noise).toFixed(3);
    const count = 30 + Math.round(Math.cos(i / 3) * 8 + Math.sin(i) * 4) + 8;
    const bull = Math.max(0, Math.round(count * (0.42 + score * 0.4)));
    const bear = Math.max(0, Math.round(count * (0.30 - score * 0.35)));
    const neu  = Math.max(0, count - bull - bear);
    out.push({
      date: d.toISOString().slice(0, 10),
      avg_score: score,
      tweet_count: count,
      bullish: bull,
      bearish: bear,
      neutral: neu,
    });
  }
  return out;
})();

window.MOCK_PERFORMANCE = [
  { id: 1, tweet_id: "t201", asset: "NVDA", direction: "long",  entry_price: 942.10, target_price: 1080,  stop_loss_price: 880,  signal_date: "2026-04-18", outcome: "win",       actual_return_pct:  14.6, notes: "Hit target in 9 days" },
  { id: 2, tweet_id: "t187", asset: "BTC",  direction: "long",  entry_price: 64200,  target_price: 72000, stop_loss_price: 61500,signal_date: "2026-04-22", outcome: "win",       actual_return_pct:  12.1, notes: "Target reached" },
  { id: 3, tweet_id: "t164", asset: "TSLA", direction: "short", entry_price: 261.50, target_price: 235,   stop_loss_price: 278,  signal_date: "2026-04-28", outcome: "loss",      actual_return_pct:  -6.3, notes: "Stop triggered on earnings beat" },
  { id: 4, tweet_id: "t142", asset: "AVGO", direction: "long",  entry_price: 1612,   target_price: 1820,  stop_loss_price: 1540, signal_date: "2026-05-02", outcome: "win",       actual_return_pct:   9.8, notes: "" },
  { id: 5, tweet_id: "t128", asset: "AMD",  direction: "long",  entry_price: 178.40, target_price: 210,   stop_loss_price: 166,  signal_date: "2026-05-05", outcome: "breakeven", actual_return_pct:   0.4, notes: "Closed flat after 12 days" },
  { id: 6, tweet_id: "t119", asset: "ETH",  direction: "long",  entry_price: 3120,   target_price: 3600,  stop_loss_price: 2950, signal_date: "2026-05-09", outcome: "pending",   actual_return_pct: null,  notes: "Open, +3.4% MTD" },
  { id: 7, tweet_id: "t101", asset: "COIN", direction: "long",  entry_price: 218.00, target_price: 260,   stop_loss_price: 200,  signal_date: "2026-05-12", outcome: "win",       actual_return_pct:  11.2, notes: "" },
  { id: 8, tweet_id: "t088", asset: "XLE",  direction: "short", entry_price:  94.20, target_price:  86,   stop_loss_price:  98,  signal_date: "2026-05-15", outcome: "loss",      actual_return_pct:  -4.0, notes: "" },
  { id: 9, tweet_id: "t072", asset: "MSTR", direction: "long",  entry_price: 1422,   target_price: 1650,  stop_loss_price: 1340, signal_date: "2026-05-18", outcome: "pending",   actual_return_pct: null,  notes: "Open, tracking BTC" },
  { id:10, tweet_id: "t054", asset: "PLTR", direction: "long",  entry_price:  24.80, target_price:  30,   stop_loss_price:  22,  signal_date: "2026-05-20", outcome: "win",       actual_return_pct:   8.9, notes: "" },
];

// Tweet feed — varied sentiment / domains / signals / media
window.MOCK_TWEETS = [
  {
    id: "t300",
    text: "The CPO transition is real. $NVDA Blackwell + co-packaged optics changes the unit economics of every hyperscaler datacenter. Watching $AVGO and $MRVL closely — these are the picks-and-shovels names. Target $AVGO 1820 by Q3.",
    created_at: "2026-05-25T14:22:00Z",
    like_count: 1247, retweet_count: 318, reply_count: 84, impression_count: 84200,
    fetched_at: "2026-05-25T15:00:00Z",
    media_urls: ["#chart-1"],
    analysis: {
      tweet_id: "t300",
      sentiment: "bullish", sentiment_score: 0.78,
      sentiment_reasoning: "Strong bullish call on infrastructure secondary plays",
      tickers: [
        { ticker: "NVDA", asset_type: "stock", context: "Blackwell mention", direction: "long" },
        { ticker: "AVGO", asset_type: "stock", context: "Pick-and-shovel CPO play", direction: "long" },
        { ticker: "MRVL", asset_type: "stock", context: "Optical networking",      direction: "long" },
      ],
      signals: [
        { type: "target", asset: "AVGO", target: 1820, timeframe: "Q3", confidence: "high",  raw_text: "Target AVGO 1820 by Q3" },
      ],
      key_themes: ["co-packaged optics", "hyperscaler capex", "datacenter buildout"],
      domains: ["Semiconductors", "CPO / Optical Networking", "AI / ML"],
      risk_level: "medium",
      is_trade_call: true,
      summary: "Bullish thesis on CPO transition naming AVGO and MRVL as infrastructure beneficiaries beyond NVDA. Sets explicit Q3 target on AVGO at 1820.",
      analyzed_at: "2026-05-25T15:01:00Z",
    },
  },
  {
    id: "t299",
    text: "Fed minutes more dovish than expected. Real yields rolling over. This is the setup gold has been waiting for — $GLD breakout above 245 confirms. Adding to position.",
    created_at: "2026-05-25T11:08:00Z",
    like_count: 892, retweet_count: 201, reply_count: 56, impression_count: 51200,
    fetched_at: "2026-05-25T12:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t299",
      sentiment: "bullish", sentiment_score: 0.65,
      sentiment_reasoning: "Bullish macro setup for precious metals",
      tickers: [
        { ticker: "GLD", asset_type: "commodity", context: "Gold ETF breakout", direction: "long" },
      ],
      signals: [
        { type: "entry", asset: "GLD", price: 245, confidence: "high", raw_text: "Breakout above 245 confirms" },
      ],
      key_themes: ["dovish Fed", "real yields", "gold breakout"],
      domains: ["Macro / Fed", "Commodities"],
      risk_level: "low",
      is_trade_call: true,
      summary: "Dovish Fed minutes and falling real yields trigger a gold position add at the 245 breakout level.",
      analyzed_at: "2026-05-25T12:01:00Z",
    },
  },
  {
    id: "t298",
    text: "$TSLA delivery numbers underwhelming. China share loss is structural now, not cyclical. I'm wrong on the long-term bull case here — closing remaining position. Sometimes the market just tells you.",
    created_at: "2026-05-25T09:14:00Z",
    like_count: 2104, retweet_count: 487, reply_count: 312, impression_count: 142000,
    fetched_at: "2026-05-25T10:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t298",
      sentiment: "bearish", sentiment_score: -0.58,
      sentiment_reasoning: "Capitulation on long thesis citing structural China issues",
      tickers: [
        { ticker: "TSLA", asset_type: "stock", context: "Closing long position", direction: "neutral" },
      ],
      signals: [
        { type: "exit", asset: "TSLA", confidence: "high", raw_text: "Closing remaining position" },
      ],
      key_themes: ["China share loss", "delivery miss", "thesis capitulation"],
      domains: ["Electric Vehicles", "Consumer Tech"],
      risk_level: "medium",
      is_trade_call: true,
      summary: "Acknowledges structural rather than cyclical headwinds in China and exits remaining TSLA long.",
      analyzed_at: "2026-05-25T10:01:00Z",
    },
  },
  {
    id: "t297",
    text: "Bitcoin holding 64k after the ETF outflows is the bullish tell. Smart money accumulated everything weak hands sold in May. $BTC into 72k next leg, $COIN beneficiary.",
    created_at: "2026-05-24T20:42:00Z",
    like_count: 1556, retweet_count: 402, reply_count: 91, impression_count: 98300,
    fetched_at: "2026-05-25T00:00:00Z",
    media_urls: ["#chart-2", "#chart-3"],
    analysis: {
      tweet_id: "t297",
      sentiment: "bullish", sentiment_score: 0.71,
      sentiment_reasoning: "Bullish accumulation thesis",
      tickers: [
        { ticker: "BTC",  asset_type: "crypto", context: "Holding 64k support",    direction: "long" },
        { ticker: "COIN", asset_type: "stock",  context: "Crypto exchange beta",   direction: "long" },
      ],
      signals: [
        { type: "target", asset: "BTC", target: 72000, confidence: "medium", raw_text: "Into 72k next leg" },
      ],
      key_themes: ["ETF flows", "accumulation", "crypto exchange beta"],
      domains: ["Crypto / DeFi"],
      risk_level: "medium",
      is_trade_call: true,
      summary: "Reads BTC's 64k hold through ETF outflows as institutional accumulation; targets 72k with COIN as beta play.",
      analyzed_at: "2026-05-25T00:01:00Z",
    },
  },
  {
    id: "t296",
    text: "Reading through $LMT and $RTX earnings transcripts. Backlog growth is real but margin compression on fixed-price contracts is a watch item. Mixed on defense primes — better risk/reward in pure-play missile names like $LDOS.",
    created_at: "2026-05-24T16:30:00Z",
    like_count: 487, retweet_count: 92, reply_count: 28, impression_count: 32400,
    fetched_at: "2026-05-24T17:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t296",
      sentiment: "mixed", sentiment_score: 0.08,
      sentiment_reasoning: "Mixed view on defense sector",
      tickers: [
        { ticker: "LMT",  asset_type: "stock", context: "Defense prime",    direction: "neutral" },
        { ticker: "RTX",  asset_type: "stock", context: "Defense prime",    direction: "neutral" },
        { ticker: "LDOS", asset_type: "stock", context: "Preferred picks-and-shovels", direction: "long" },
      ],
      signals: [],
      key_themes: ["margin compression", "fixed-price contracts", "missile pure-plays"],
      domains: ["Defense"],
      risk_level: "low",
      is_trade_call: false,
      summary: "Constructive on backlogs but cautious on prime contractor margins; prefers focused missile names like LDOS.",
      analyzed_at: "2026-05-24T17:01:00Z",
    },
  },
  {
    id: "t295",
    text: "Quick reminder: when everyone is talking about the same trade, it's already late. Patience.",
    created_at: "2026-05-24T13:11:00Z",
    like_count: 3201, retweet_count: 612, reply_count: 142, impression_count: 184000,
    fetched_at: "2026-05-24T14:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t295",
      sentiment: "neutral", sentiment_score: 0.02,
      sentiment_reasoning: "Market psychology observation",
      tickers: [],
      signals: [],
      key_themes: ["contrarian", "discipline", "patience"],
      domains: [],
      risk_level: "none",
      is_trade_call: false,
      summary: "Reminder on crowded-trade risk and the discipline of patience.",
      analyzed_at: "2026-05-24T14:01:00Z",
    },
  },
  {
    id: "t294",
    text: "$PLTR is the cleanest expression of the AI-on-government-budgets trade. Booking growth in the commercial segment finally inflecting. Long term holder, adding on weakness sub 25.",
    created_at: "2026-05-24T10:02:00Z",
    like_count: 942, retweet_count: 188, reply_count: 64, impression_count: 58000,
    fetched_at: "2026-05-24T11:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t294",
      sentiment: "bullish", sentiment_score: 0.66,
      sentiment_reasoning: "Long-term bullish on government + commercial inflection",
      tickers: [
        { ticker: "PLTR", asset_type: "stock", context: "AI + gov budgets", direction: "long" },
      ],
      signals: [
        { type: "entry", asset: "PLTR", price: 25, confidence: "medium", raw_text: "Adding on weakness sub 25" },
      ],
      key_themes: ["government AI", "commercial inflection", "long-term hold"],
      domains: ["AI / ML", "Defense", "Cloud Computing"],
      risk_level: "low",
      is_trade_call: true,
      summary: "Frames PLTR as the cleanest pure-play on AI deployed against government budgets; adds on weakness under 25.",
      analyzed_at: "2026-05-24T11:01:00Z",
    },
  },
  {
    id: "t293",
    text: "Watching $MSFT cloud spend commentary closely on the next print. If Azure growth re-accelerates from Q4 levels, the entire infrastructure trade gets re-rated higher.",
    created_at: "2026-05-23T19:48:00Z",
    like_count: 612, retweet_count: 124, reply_count: 31, impression_count: 41200,
    fetched_at: "2026-05-23T20:00:00Z",
    media_urls: [],
    analysis: {
      tweet_id: "t293",
      sentiment: "neutral", sentiment_score: 0.18,
      sentiment_reasoning: "Watching for confirmation signal",
      tickers: [
        { ticker: "MSFT", asset_type: "stock", context: "Azure growth watch", direction: "neutral" },
      ],
      signals: [],
      key_themes: ["Azure growth", "infrastructure re-rating"],
      domains: ["Cloud Computing", "AI / ML"],
      risk_level: "none",
      is_trade_call: false,
      summary: "Flags upcoming MSFT print as the key tell for whether the infrastructure trade gets re-rated higher.",
      analyzed_at: "2026-05-23T20:01:00Z",
    },
  },
];

// Featured "Brief of the day" — drawn from MOCK_TWEETS by id
window.MOCK_BRIEF_ID = "t300";
