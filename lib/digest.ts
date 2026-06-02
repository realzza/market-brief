// Daily digest builder.
//
// One Claude request reads every post in a time window and returns an editorial
// "morning brief": an overall headline + a ranked list of the most important
// posts. This is the cheap, batched alternative to per-post analysis
// (lib/claude.ts) for the daily-overview use case — N expensive ~700-token
// output generations collapse into a single ~2k-token output, and we send post
// TEXT only (no per-image input), which is where the bulk of the saving comes
// from. See lib/db.ts `digests` table; token counts are persisted so the
// saving is observable.

import Anthropic from '@anthropic-ai/sdk';
import { getPostsInWindow, getLatestDigest, saveBatchClassifications } from './db';
import { getAnalystByKey } from './analysts';
import type { DigestItem, Sentiment } from './types';

const client = new Anthropic();

const MODEL = 'claude-sonnet-4-6';

// Token-safety caps. A busy day can produce hundreds of posts; cap per-post
// text and total post count so the single request can never blow the context
// window. ~500 posts × ~200 tokens ≈ 100k input, comfortably under Sonnet's
// 200k. Newest posts win when we trim (getPostsInWindow returns newest-first).
const MAX_POSTS = 500;
const MAX_POST_CHARS = 600;
const MAX_ITEMS = 12;

// Output ceiling. The brief now also returns a compact one-line classification
// for EVERY post in the window (not just the ranked items) so the batch can
// feed the market-mood gauge — see `classifications` below. Each entry, with a
// ~19-digit snowflake id, runs ~30 tokens, so the 500-post cap is ~15k tokens
// of classifications on top of the ~2k editorial body. Truncation here is not a
// cosmetic loss: the JSON is extracted with a single {…} match and parsed whole,
// so a cut-off classifications tail makes the ENTIRE brief unparseable (headline
// and items included). We therefore budget well above the worst case — 32k still
// sits comfortably under Sonnet's 64k output limit, and we only pay for tokens
// actually produced, so the headroom is free.
const MAX_OUTPUT_TOKENS = 32000;

const SYSTEM_PROMPT = `You are the markets editor of a financial news desk compiling a concise morning brief.
You are given a batch of social-media posts from tracked traders, analysts, and public figures over a time window.
Your job is to identify the most market-relevant developments and write a tight, scannable editorial digest — like the front page of a markets paper.

Editorial judgement:
- Prioritize posts that move markets or carry real signal: concrete trade calls, price levels, policy/macro shifts, earnings, notable sentiment swings.
- Demote low-signal chatter, jokes, and pure engagement bait.
- Be precise and neutral. Never invent prices, tickers, or facts not present in the posts.`;

// Static schema instruction — separated so it can be prompt-cached. (A single
// request gains little from caching, but the daily cadence means the prefix is
// re-used across days, and it keeps the structure identical to lib/claude.ts.)
const SCHEMA_INSTRUCTION = `From the posts below, select the most important ones and produce a digest. Return ONLY valid JSON matching this schema exactly:

{
  "headline": "<one punchy headline summarizing the whole window>",
  "summary": "<2-4 sentence overview of the window's most important developments>",
  "items": [
    {
      "post_id": "<the EXACT id of a post from the list below — never invent one>",
      "headline": "<short punchy headline for this post>",
      "blurb": "<1-2 sentences on what it says and why it matters>",
      "sentiment": "bullish|bearish|neutral|mixed",
      "tickers": ["<symbol e.g. NVDA, BTC>"],
      "importance": "high|medium|low"
    }
  ],
  "classifications": [
    { "id": "<exact post id>", "sentiment": "bullish|bearish|neutral|mixed", "score": <-1.0 to 1.0>, "trade_call": <true|false> }
  ]
}

Rules:
- "items" must be ranked most-important first.
- Include at most ${MAX_ITEMS} items — only genuinely noteworthy posts. A quiet window may have very few.
- Every "post_id" MUST be copied verbatim from a [#id] tag below. Do not summarize posts that aren't in the list.
- "tickers" is the symbols actually referenced in that post (empty array if none).
- "classifications" MUST contain exactly one entry for EVERY post in the list below — this is how the market-mood gauge is computed, so never skip a post. Keep each entry to those four compact fields only.
  - "score" is the post's market sentiment strength, from -1.0 (very bearish) to 1.0 (very bullish); use 0 for genuinely neutral/off-topic posts.
  - "trade_call" is true only when the post is an actionable buy/sell signal (a concrete entry, target, or directional call), not mere commentary.`;

const VALID_SENTIMENTS: ReadonlySet<string> = new Set(['bullish', 'bearish', 'neutral', 'mixed']);
const VALID_IMPORTANCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

// A lightweight per-post sentiment read produced for EVERY post in the window
// (unlike the ranked, editorial `items`, which cover only the top stories).
// These are persisted into `tweet_analysis` as gap-fill so the batch moves the
// market-mood gauge and closes the "X of Y posts analyzed" gap — without the
// cost of the per-post pipeline (lib/claude.ts). They never overwrite a richer
// per-post analysis; see db.saveBatchClassifications.
export interface BatchClassification {
  post_id: string;
  sentiment: Sentiment;
  sentiment_score: number;
  is_trade_call: boolean;
}

export interface BuiltDigest {
  generated_at: string;
  window_start: string;
  window_end: string;
  post_count: number;
  headline: string;
  summary: string;
  items: DigestItem[];
  // Per-post sentiment reads for every post in the window (see above). Persisted
  // separately from the digest row, into `tweet_analysis`, by the caller.
  classifications: BatchClassification[];
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

// In-flight guard — a digest build is an API spend, so concurrent triggers
// (rapid manual clicks, or a manual click overlapping the cron) must not
// double-spend. Mirrors the gate in lib/scheduler.ts `runFetch`.
let inFlight = false;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// Resolve an author key to a display name for the prompt (so the editor can
// attribute "Trump said …" rather than a bare handle). Falls back to the handle.
function displayAuthor(authorKey: string): string {
  return getAnalystByKey(authorKey)?.name ?? `@${authorKey}`;
}

/**
 * Compute the window for a manual ("refresh newly tracked posts") trigger:
 * everything since the last digest's window_end, falling back to the last 24h
 * when no digest exists yet.
 */
export function manualWindow(now = new Date()): { start: string; end: string } {
  const end = now.toISOString();
  const last = getLatestDigest();
  const start = last?.window_end ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

/** Window for the daily cron: the trailing 24 hours. */
export function dailyWindow(now = new Date()): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    end: now.toISOString(),
  };
}

/**
 * Persist a built digest's per-post classifications into `tweet_analysis`, so
 * the batch feeds the market-mood gauge. Returns the count of posts NEWLY
 * scored (posts that already carried any analysis are skipped). Kept out of
 * buildDigest so the build stays side-effect-free and mirrors the
 * build-then-saveDigest split the callers already use.
 */
export function persistClassifications(built: BuiltDigest): number {
  return saveBatchClassifications(
    built.classifications.map((c) => ({
      tweet_id: c.post_id,
      sentiment: c.sentiment,
      sentiment_score: c.sentiment_score,
      is_trade_call: c.is_trade_call ? 1 : 0,
      analyzed_at: built.generated_at,
    })),
  );
}

/**
 * Build (but do not persist) a digest over [start, end). Returns null when the
 * window holds no posts. Throws if a build is already in flight.
 */
export async function buildDigest(window: { start: string; end: string }): Promise<BuiltDigest | null> {
  if (inFlight) {
    throw new Error('A digest is already being generated — please wait a moment.');
  }
  inFlight = true;
  try {
    const generated_at = new Date().toISOString();
    const allPosts = getPostsInWindow(window.start, window.end);
    if (allPosts.length === 0) return null;

    // Newest-first already; trim to the cap so the request stays bounded.
    const posts = allPosts.slice(0, MAX_POSTS);
    const validIds = new Set(posts.map((p) => p.id));
    const postById = new Map(posts.map((p) => [p.id, p]));

    const postList = posts
      .map(
        (p) =>
          `[#${p.id} · ${displayAuthor(p.author)} · ${p.platform === 'truthsocial' ? 'Truth Social' : 'X'} · ${p.created_at}]\n${truncate(p.text, MAX_POST_CHARS)}`,
      )
      .join('\n\n');

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SCHEMA_INSTRUCTION, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: `Posts in window (${posts.length}):\n\n${postList}` },
          ],
        },
      ],
    });

    const usage = response.usage as unknown as Record<string, number>;
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[digest] posts=${posts.length} cache_read=${usage.cache_read_input_tokens ?? 0} input=${usage.input_tokens} output=${usage.output_tokens}`,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      console.warn('[digest] hit max_tokens — output may be truncated');
    }

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in digest response');
    const parsed = JSON.parse(jsonMatch[0]) as {
      headline?: string;
      summary?: string;
      items?: Array<Record<string, unknown>>;
      classifications?: Array<Record<string, unknown>>;
    };

    // Validate + sanitize. Drop any item whose post_id the model invented or
    // that points outside the window — guarantees every headline links to a
    // real /post/<id> page.
    const items: DigestItem[] = (parsed.items ?? [])
      .filter((it) => typeof it.post_id === 'string' && validIds.has(it.post_id as string))
      .slice(0, MAX_ITEMS)
      .map((it) => {
        const sentiment = String(it.sentiment) as Sentiment;
        const postId = it.post_id as string;
        return {
          post_id: postId,
          author: postById.get(postId)?.author ?? '',
          headline: String(it.headline ?? '').trim(),
          blurb: String(it.blurb ?? '').trim(),
          sentiment: VALID_SENTIMENTS.has(sentiment) ? sentiment : 'neutral',
          tickers: Array.isArray(it.tickers)
            ? (it.tickers as unknown[]).map(String).filter(Boolean)
            : [],
          importance: VALID_IMPORTANCE.has(String(it.importance))
            ? (String(it.importance) as DigestItem['importance'])
            : 'medium',
        };
      });

    // Per-post classifications: one read per post in the window, used to move
    // the market-mood gauge. Drop entries whose id the model invented or
    // duplicated, clamp the score to [-1, 1], and default an unknown sentiment
    // to neutral — same defensiveness as the items above.
    const seenIds = new Set<string>();
    const classifications: BatchClassification[] = (parsed.classifications ?? [])
      .filter((c) => {
        const id = typeof c.id === 'string' ? (c.id as string) : '';
        if (!id || !validIds.has(id) || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      })
      .map((c) => {
        const sentiment = String(c.sentiment) as Sentiment;
        const rawScore = Number(c.score);
        const score = Number.isFinite(rawScore) ? Math.max(-1, Math.min(1, rawScore)) : 0;
        return {
          post_id: c.id as string,
          sentiment: VALID_SENTIMENTS.has(sentiment) ? sentiment : 'neutral',
          sentiment_score: score,
          is_trade_call: c.trade_call === true,
        };
      });

    return {
      generated_at,
      window_start: window.start,
      window_end: window.end,
      post_count: posts.length,
      headline: String(parsed.headline ?? '').trim() || 'Market brief',
      summary: String(parsed.summary ?? '').trim(),
      items,
      classifications,
      model: MODEL,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
    };
  } finally {
    inFlight = false;
  }
}
