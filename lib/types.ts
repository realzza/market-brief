// A link-preview ("OpenGraph card") attached to a post — the thumbnail+title+
// blurb box a platform renders under a shared link. Truth Social exposes this
// natively via the Mastodon `card` field; we render it the same way.
export interface LinkCard {
  url: string;
  title: string;
  description: string;
  image: string;       // thumbnail URL ('' when none)
  provider: string;    // e.g. "justthenews.com" ('' when none)
}

export interface RawTweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count: number;
  };
  media_urls?: string[];
  card?: LinkCard | null;
}

export type Sentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed';

export interface TickerMention {
  ticker: string;
  asset_type: 'crypto' | 'stock' | 'forex' | 'commodity' | 'index' | 'unknown';
  context: string;
  direction?: 'long' | 'short' | 'neutral';
}

export interface TradeSignal {
  type: 'entry' | 'exit' | 'target' | 'stop_loss' | 'alert' | 'analysis';
  asset: string;
  price?: number;
  target?: number;
  stop_loss?: number;
  leverage?: string;
  timeframe?: string;
  confidence: 'high' | 'medium' | 'low';
  raw_text: string;
}

export type Domain =
  | 'Semiconductors' | 'CPO / Optical Networking' | 'AI / ML' | 'Cloud Computing'
  | 'Energy' | 'Electricity / Utilities' | 'Electric Vehicles' | 'Defense'
  | 'Biotech / Healthcare' | 'Financials' | 'Crypto / DeFi' | 'Macro / Fed'
  | 'Options Flow' | 'Real Estate' | 'Consumer Tech' | 'Industrials'
  | 'Commodities' | 'Retail / E-Commerce' | 'Telecom' | 'Media / Entertainment';

export interface TweetAnalysis {
  tweet_id: string;
  sentiment: Sentiment;
  sentiment_score: number; // -1 (very bearish) to 1 (very bullish)
  sentiment_reasoning: string;
  tickers: TickerMention[];
  signals: TradeSignal[];
  key_themes: string[];
  domains: Domain[];
  image_insights?: string | null;
  risk_level: 'high' | 'medium' | 'low' | 'none';
  is_trade_call: boolean;
  summary: string;
  analyzed_at: string;
}

// Which platform a stored post came from. Posts from both platforms can share
// one analyst (e.g. Trump on X + Truth Social), so this lives per-row.
export type Platform = 'x' | 'truthsocial';

// A tracked voice. The registry + resolution logic lives in lib/analysts.ts;
// this is just the shape passed around the app.
//
// Platforms are configured EXPLICITLY: each analyst lists, under `platforms`,
// exactly which platforms we track and the account handle on each. Adding a
// handle under `platforms` is the *only* thing that makes that platform get
// fetched — there is no implicit "also check Truth Social". Posts from every
// configured platform merge under the one analyst (distinguished per-post by
// StoredTweet.platform); the per-card platform tag + "View on …" link follow
// from that.
export interface Analyst {
  id: string;            // stable slug (used for filter state / keys / author)
  name: string;          // display name for mastheads / cards
  blurb?: string;        // short descriptor shown in the byline
  platforms: {
    x?: string;           // X / Twitter handle (no @)
    truthsocial?: string; // Truth Social acct (no @)
  };
}

export interface StoredTweet {
  id: string;
  text: string;
  created_at: string;
  // Author key (lowercased handle) of the analyst who posted this tweet.
  // Rows predating multi-analyst support are backfilled to the legacy handle.
  author: string;
  // Source platform. Rows predating Truth Social support default to 'x'.
  platform: Platform;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  impression_count: number;
  fetched_at: string;
  media_urls: string[];
  // Link-preview card, when the post shared a URL the platform unfurled.
  card?: LinkCard | null;
  analysis?: TweetAnalysis;
}

export interface PerformanceEntry {
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
  updated_at: string;
}

export interface DashboardStats {
  total_tweets: number;
  analyzed_tweets: number;
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
  trade_calls: number;
  top_tickers: Array<{ ticker: string; count: number; asset_type: string }>;
  top_domains: Array<{ domain: string; count: number }>;
  avg_sentiment_score: number;
  win_rate?: number;
}
