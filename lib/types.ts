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

export interface StoredTweet {
  id: string;
  text: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  impression_count: number;
  fetched_at: string;
  media_urls: string[];
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
  top_tickers: Array<{ ticker: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
  avg_sentiment_score: number;
  win_rate?: number;
}
