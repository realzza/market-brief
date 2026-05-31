import { RawTweet } from './types';
import { decodeHtmlEntities, stripHtml } from './twitter';

// Truth Social can't be fetched from Node directly — Cloudflare blocks the
// request by its TLS fingerprint before any header is read (see
// truthsocial-sidecar/server.py for the full explanation). So a small Python
// sidecar does the browser-impersonating fetch and exposes the posts as JSON
// on the internal network, exactly like RSSHub does for X. We just talk to it.
//
// When TRUTHSOCIAL_URL is unset (e.g. local `npm run dev` with no sidecar),
// the path is skipped entirely and the analyst is X-only.
const TRUTHSOCIAL_URL = process.env.TRUTHSOCIAL_URL?.trim();

export function truthSocialEnabled(): boolean {
  return !!TRUTHSOCIAL_URL;
}

// Shape returned by the sidecar's /statuses endpoint (normalized Mastodon).
interface SidecarMedia {
  type?: string; // image | video | gifv
  url?: string;
  preview_url?: string | null;
}
interface SidecarPost {
  id: string;
  content: string; // HTML
  created_at: string;
  replies_count?: number;
  reblogs_count?: number;
  favourites_count?: number;
  media?: SidecarMedia[];
}

function toRawTweet(p: SidecarPost): RawTweet {
  const text = decodeHtmlEntities(stripHtml(p.content ?? '')).trim();

  // Images contribute their URL; videos/GIFs contribute the playable file with
  // the poster carried in a #poster fragment — the exact convention TweetCard
  // already understands (split on #poster=, render <video poster>). This is
  // why a Truth Social video shows a thumbnail just like an X one.
  const media_urls: string[] = [];
  for (const m of p.media ?? []) {
    if (!m.url) continue;
    if (m.type === 'image') {
      media_urls.push(m.url);
    } else {
      // video | gifv
      media_urls.push(m.preview_url ? `${m.url}#poster=${encodeURIComponent(m.preview_url)}` : m.url);
    }
  }

  return {
    id: p.id,
    text,
    created_at: new Date(p.created_at).toISOString(),
    public_metrics: {
      // Mastodon's favourites/reblogs/replies map onto the X metric slots so
      // the card footer renders identically. Truth Social exposes no
      // impression count.
      like_count: p.favourites_count ?? 0,
      retweet_count: p.reblogs_count ?? 0,
      reply_count: p.replies_count ?? 0,
      impression_count: 0,
    },
    media_urls,
  };
}

export async function fetchTruthSocialPosts(acct: string, count = 40): Promise<RawTweet[]> {
  if (!TRUTHSOCIAL_URL) throw new Error('TRUTHSOCIAL_URL not configured');

  const base = TRUTHSOCIAL_URL.replace(/\/$/, '');
  const url = `${base}/statuses?acct=${encodeURIComponent(acct)}&limit=${count}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'serenity-tracker/1.0' },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`truthsocial sidecar ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }

  const data = (await res.json()) as { posts?: SidecarPost[] };
  const posts = (data.posts ?? []).map(toRawTweet);
  posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (posts.length > 0) {
    const ageDays = (Date.now() - new Date(posts[0].created_at).getTime()) / 86_400_000;
    console.log(
      `[truthsocial] @${acct}: ${posts.length} posts · newest=${posts[0].created_at} (${ageDays.toFixed(1)}d ago)`,
    );
  }
  return posts.slice(0, count);
}
