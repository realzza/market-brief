import Anthropic from '@anthropic-ai/sdk';
import { TweetAnalysis } from './types';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert financial and trading analyst specializing in equities, crypto, options, and macro markets.
Your job is to analyze social media posts from traders/analysts and extract structured financial intelligence.

You may receive images alongside tweets — these can include stock charts, screenshots of positions, portfolio screenshots, price quotes, news headlines, or other financial data. Analyze all visual content carefully and incorporate it into your analysis.

For each tweet (and any attached images), identify:
1. Overall market sentiment (bullish/bearish/neutral/mixed) with a score from -1.0 to 1.0
2. Asset/ticker mentions with their context and implied direction
3. Specific trade signals (entries, targets, stop losses, alerts) — extract price levels from charts if visible
4. Key themes and risk level
5. Whether this is an actionable trade call
6. Industry/sector domains covered — use only labels from this list:
   "Semiconductors", "CPO / Optical Networking", "AI / ML", "Cloud Computing",
   "Energy", "Electricity / Utilities", "Electric Vehicles", "Defense",
   "Biotech / Healthcare", "Financials", "Crypto / DeFi", "Macro / Fed",
   "Options Flow", "Real Estate", "Consumer Tech", "Industrials",
   "Commodities", "Retail / E-Commerce", "Telecom", "Media / Entertainment"

When images contain charts: note the asset, approximate price range, trend direction, and any key levels visible.
Be precise. Only use domain labels clearly relevant to the content.`;

// Static schema instruction — separated so it can be prompt-cached across all tweet analyses.
const SCHEMA_INSTRUCTION = `Analyze the tweet and any attached images from a financial/trading perspective. Return ONLY valid JSON matching the schema exactly.

Return this exact JSON structure:
{
  "sentiment": "bullish|bearish|neutral|mixed",
  "sentiment_score": <-1.0 to 1.0>,
  "sentiment_reasoning": "<brief explanation, reference image content if relevant>",
  "domains": ["<domain from allowed list>"],
  "image_insights": "<what the images show, e.g. chart of $SOI up 600% YTD, or null if no images>",
  "tickers": [
    {
      "ticker": "<symbol e.g. BTC, ETH, SPY, NVDA>",
      "asset_type": "crypto|stock|forex|commodity|index|unknown",
      "context": "<how it's mentioned or shown>",
      "direction": "long|short|neutral"
    }
  ],
  "signals": [
    {
      "type": "entry|exit|target|stop_loss|alert|analysis",
      "asset": "<asset name>",
      "price": <number or null>,
      "target": <number or null>,
      "stop_loss": <number or null>,
      "leverage": "<e.g. 10x or null>",
      "timeframe": "<e.g. 4h, daily or null>",
      "confidence": "high|medium|low",
      "raw_text": "<relevant part of tweet or image>"
    }
  ],
  "key_themes": ["<theme1>", "<theme2>"],
  "risk_level": "high|medium|low|none",
  "is_trade_call": <true|false>,
  "summary": "<1-2 sentence plain English summary including image context>"
}`;

async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rawType = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = (rawType.split(';')[0].trim() as string) as
      'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    // Skip if over 4MB base64 — Claude's limit is 5MB per image
    if (base64.length > 5_400_000) return null;
    return { base64, mediaType };
  } catch {
    return null;
  }
}

export async function analyzeTweet(tweet: {
  id: string;
  text: string;
  created_at: string;
  media_urls?: string[];
}): Promise<TweetAnalysis> {
  const imageResults = await Promise.all(
    (tweet.media_urls ?? []).map(fetchImageAsBase64)
  );
  const imageBlocks: Anthropic.ImageBlockParam[] = imageResults
    .filter((img): img is NonNullable<typeof img> => img !== null)
    .map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
    }));

  // Content order: cached schema instruction → dynamic images → dynamic tweet text.
  // The cache_control marker on SCHEMA_INSTRUCTION establishes the stable prefix;
  // per-tweet images and text come after and are never cached.
  const content: Anthropic.MessageParam['content'] = [
    {
      type: 'text',
      text: SCHEMA_INSTRUCTION,
      cache_control: { type: 'ephemeral' },
    },
    ...imageBlocks,
    {
      type: 'text',
      text: `Tweet (posted ${tweet.created_at}):\n"${tweet.text}"`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });

  if (process.env.NODE_ENV === 'development') {
    const u = response.usage as unknown as Record<string, number>;
    console.log(
      `[claude] cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens} output=${u.output_tokens}`
    );
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    tweet_id: tweet.id,
    ...parsed,
    domains: parsed.domains ?? [],
    analyzed_at: new Date().toISOString(),
  } as TweetAnalysis;
}

export async function analyzeBatch(
  tweets: Array<{ id: string; text: string; created_at: string; media_urls?: string[] }>
): Promise<TweetAnalysis[]> {
  const results: TweetAnalysis[] = [];
  for (const tweet of tweets) {
    try {
      results.push(await analyzeTweet(tweet));
    } catch (err) {
      console.error(`Failed to analyze tweet ${tweet.id}:`, err);
    }
  }
  return results;
}
