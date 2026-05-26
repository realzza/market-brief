import { RawTweet } from './types';

const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name';

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
  extended_entities?: { media?: Array<{ media_url_https: string; type: string }> };
  entities?: {
    media?: Array<{ media_url_https: string; type: string }>;
    urls?: Array<{ url: string; expanded_url: string; display_url: string }>;
  };
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

  const media = (t.extended_entities?.media ?? t.entities?.media ?? [])
    .filter((m) => m.type === 'photo')
    .map((m) => m.media_url_https);

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

export async function fetchLatestTweets(username: string, count = 100): Promise<RawTweet[]> {
  const url = `${SYNDICATION_URL}/${encodeURIComponent(username)}?count=${count}&showReplies=false`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Syndication fetch failed: ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find __NEXT_DATA__ in syndication response');

  const data = JSON.parse(match[1]);
  const entries: Array<{ type: string; content?: { tweet: SyndicationTweet } }> =
    data?.props?.pageProps?.timeline?.entries ?? [];

  const tweets: RawTweet[] = [];
  for (const entry of entries) {
    if (entry.type !== 'tweet' || !entry.content?.tweet) continue;
    const t = entry.content.tweet;
    // Skip retweets and replies
    if (t.retweeted || t.in_reply_to_status_id_str) continue;
    tweets.push(toRawTweet(t));
    if (tweets.length >= count) break;
  }

  return tweets;
}
