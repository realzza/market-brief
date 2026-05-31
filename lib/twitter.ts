import { RawTweet } from './types';

const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name';
// e.g. http://rsshub:1200 — set by docker-compose. When empty/unset, the
// RSSHub path is skipped entirely and we go straight to syndication.
const RSSHUB_URL = process.env.RSSHUB_URL?.trim();

// Twitter's date format: "Mon Feb 23 15:29:35 +0000 2026"
function parseTweetDate(raw: string): string {
  return new Date(raw).toISOString();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

interface SyndicationTweet {
  id_str: string;
  full_text?: string;
  text?: string;
  created_at: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  retweeted?: boolean;
  in_reply_to_status_id_str?: string;
  extended_entities?: { media?: SyndicationMedia[] };
  entities?: {
    media?: SyndicationMedia[];
    urls?: Array<{ url: string; expanded_url: string; display_url: string }>;
  };
}

interface SyndicationMedia {
  media_url_https: string;
  type: string; // 'photo' | 'video' | 'animated_gif'
  video_info?: {
    variants?: Array<{ bitrate?: number; content_type?: string; url?: string }>;
  };
}

// Pick a single playable mp4 for a video/gif media item. Twitter offers
// several bitrates plus an HLS (.m3u8) variant; native <video> can't play
// HLS without a library, so we take the highest-bitrate mp4 at or below a
// feed-friendly cap (avoids pulling a 25 Mbps 4K file into the timeline).
function bestVideoUrl(media: SyndicationMedia): string | null {
  const mp4s = (media.video_info?.variants ?? []).filter(
    (v): v is { bitrate?: number; content_type: string; url: string } =>
      v.content_type === 'video/mp4' && !!v.url,
  );
  if (mp4s.length === 0) return null;
  const capped = mp4s.filter((v) => (v.bitrate ?? 0) <= 2_500_000);
  const pool = capped.length > 0 ? capped : mp4s;
  return pool.reduce((best, v) => ((v.bitrate ?? 0) > (best.bitrate ?? 0) ? v : best)).url;
}

function toRawTweet(t: SyndicationTweet): RawTweet {
  const rawText = t.full_text ?? t.text ?? '';

  // Expand t.co short links using the entities url table
  let text = rawText;
  for (const u of t.entities?.urls ?? []) {
    text = text.replace(u.url, u.expanded_url);
  }
  // Strip any remaining t.co links (media attachments etc.)
  text = text.replace(/https:\/\/t\.co\/\S+/g, '').trim();
  text = decodeHtmlEntities(text);

  // Photos contribute their image URL; videos / GIFs contribute a playable
  // mp4 URL with the poster thumbnail carried in a `#poster=` fragment so the
  // card can paint a frame before any video data loads (preload=metadata shows
  // black otherwise). Both land in the flat media_urls list — the card
  // distinguishes them by URL (see isVideoUrl in TweetCard).
  const media = (t.extended_entities?.media ?? t.entities?.media ?? [])
    .map((m) => {
      if (m.type === 'photo') return m.media_url_https;
      const mp4 = bestVideoUrl(m);
      if (!mp4) return null;
      return m.media_url_https ? `${mp4}#poster=${encodeURIComponent(m.media_url_https)}` : mp4;
    })
    .filter((u): u is string => !!u);

  return {
    id: t.id_str,
    text,
    created_at: parseTweetDate(t.created_at),
    public_metrics: {
      like_count: t.favorite_count ?? 0,
      retweet_count: t.retweet_count ?? 0,
      reply_count: t.reply_count ?? 0,
      impression_count: 0, // not exposed by syndication API
    },
    media_urls: media,
  };
}

// ─── RSSHub path ─────────────────────────────────────────────────────────────
// RSSHub returns a JSON Feed (https://jsonfeed.org). We pull the items array
// and convert each to our RawTweet shape.
//
// Known limitation: JSON Feed has no field for engagement metrics, and
// RSSHub doesn't include them as extensions either. So tweets fetched via
// RSSHub will have like/RT/reply/impression counts of 0 — the schema can't
// distinguish "0 engagement" from "engagement unknown". Tweets fetched via
// syndication still come back with real counts.

interface JsonFeedItem {
  id?: string;
  url?: string;
  title?: string;
  content_html?: string;
  content_text?: string;
  date_published?: string;
  attachments?: Array<{ url: string; mime_type?: string }>;
}

function extractTweetId(item: JsonFeedItem): string | null {
  // URLs look like https://twitter.com/USER/status/12345 or x.com/.../status/12345
  const src = item.url ?? item.id ?? '';
  const m = src.match(/status\/(\d+)/);
  return m?.[1] ?? null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMedia(item: JsonFeedItem): string[] {
  const urls = new Set<string>();
  for (const a of item.attachments ?? []) {
    if (a.url && (!a.mime_type || a.mime_type.startsWith('image/') || a.mime_type.startsWith('video/'))) {
      urls.add(decodeHtmlEntities(a.url));
    }
  }
  if (item.content_html) {
    for (const m of item.content_html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      // CRITICAL: RSSHub's HTML keeps URLs HTML-encoded (& → &amp;). Twitter
      // image URLs always have a query string with at least one &, so a raw
      // copy of the src attribute yields a 404. Decode entities to recover.
      urls.add(decodeHtmlEntities(m[1]));
    }
    // RSSHub renders videos as <video src="MP4" poster="THUMB" …>. Pair the
    // poster with the mp4 (carried in a #poster fragment, see TweetCard) so the
    // card paints a frame instead of black — matching the syndication path.
    for (const m of item.content_html.matchAll(/<video\b[^>]*>/g)) {
      const src = m[0].match(/\bsrc="([^"]+)"/)?.[1];
      if (!src) continue;
      const mp4 = decodeHtmlEntities(src);
      const poster = m[0].match(/\bposter="([^"]+)"/)?.[1];
      urls.add(poster ? `${mp4}#poster=${encodeURIComponent(decodeHtmlEntities(poster))}` : mp4);
    }
    // Nested <source src="…"> fallback (no poster attribute lives on <source>).
    for (const m of item.content_html.matchAll(/<source\b[^>]+src="([^"]+)"/g)) {
      urls.add(decodeHtmlEntities(m[1]));
    }
  }
  return [...urls];
}

async function fetchFromRSSHub(username: string): Promise<RawTweet[]> {
  if (!RSSHUB_URL) throw new Error('RSSHUB_URL not configured');

  const url = `${RSSHUB_URL.replace(/\/$/, '')}/twitter/user/${encodeURIComponent(username)}?format=json`;
  const ctl = AbortSignal.timeout(20_000);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'serenity-tracker/1.0', Accept: 'application/json' },
    signal: ctl,
  });
  if (!res.ok) throw new Error(`RSSHub ${res.status}: ${(await res.text()).slice(0, 120)}`);

  const feed = (await res.json()) as { items?: JsonFeedItem[] };
  const items = feed.items ?? [];

  const tweets: RawTweet[] = [];
  for (const item of items) {
    const id = extractTweetId(item);
    if (!id) continue;
    const text = decodeHtmlEntities(stripHtml(item.content_html ?? item.content_text ?? item.title ?? ''));
    tweets.push({
      id,
      text,
      created_at: new Date(item.date_published ?? Date.now()).toISOString(),
      public_metrics: { like_count: 0, retweet_count: 0, reply_count: 0, impression_count: 0 },
      media_urls: extractMedia(item),
    });
  }
  return tweets;
}

// ─── Syndication path (fallback) ─────────────────────────────────────────────

export async function fetchLatestTweets(username: string, count = 100): Promise<RawTweet[]> {
  // Try RSSHub first when configured. On any failure, fall back to syndication.
  if (RSSHUB_URL) {
    try {
      const tweets = await fetchFromRSSHub(username);
      if (tweets.length > 0) {
        tweets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const ageDays = (Date.now() - new Date(tweets[0].created_at).getTime()) / 86_400_000;
        console.log(`[twitter] via rsshub: ${tweets.length} tweets · newest=${tweets[0].created_at} (${ageDays.toFixed(1)}d ago)`);
        return tweets.slice(0, count);
      }
      console.warn('[twitter] rsshub returned 0 tweets — falling back to syndication');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[twitter] rsshub failed (${msg}) — falling back to syndication`);
    }
  }

  return fetchFromSyndication(username, count);
}

async function fetchFromSyndication(username: string, count: number): Promise<RawTweet[]> {
  // Cache-buster nudges the upstream CDN. Limited upside (server-side cache
  // is shared across all callers) but zero downside.
  const bust = Date.now();
  const url = `${SYNDICATION_URL}/${encodeURIComponent(username)}?count=${count}&showReplies=false&dnt=true&_=${bust}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://platform.twitter.com/',
    },
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('Twitter rate-limited this request — wait a few minutes and try again.');
    throw new Error(`Syndication fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find __NEXT_DATA__ in syndication response');

  const data = JSON.parse(match[1]);
  const entries: Array<{ type: string; content?: { tweet: SyndicationTweet } }> =
    data?.props?.pageProps?.timeline?.entries ?? [];

  // Collect everything that's a real tweet (no retweets / replies). The API
  // returns entries in a curated order (pinned first, then a mix that's NOT
  // chronological), so we must sort ourselves before taking the top N.
  const all: RawTweet[] = [];
  for (const entry of entries) {
    if (entry.type !== 'tweet' || !entry.content?.tweet) continue;
    const t = entry.content.tweet;
    if (t.retweeted || t.in_reply_to_status_id_str) continue;
    all.push(toRawTweet(t));
  }

  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Visibility on upstream freshness — surfaces "endpoint serving stale data"
  // in the scheduler logs without having to dump rows from sqlite.
  if (all.length > 0) {
    const newest = all[0].created_at;
    const ageDays = (Date.now() - new Date(newest).getTime()) / 86_400_000;
    console.log(
      `[twitter] via syndication: ${all.length} tweets · newest=${newest} (${ageDays.toFixed(1)}d ago)`,
    );
  }

  return all.slice(0, count);
}
