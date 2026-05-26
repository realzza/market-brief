import { RawTweet } from './types';

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN!;
const BASE_URL = 'https://api.twitter.com/2';

async function twitterFetch(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter API ${res.status}: ${err}`);
  }
  return res.json();
}

export async function resolveUserId(username: string): Promise<string> {
  const data = await twitterFetch(
    `${BASE_URL}/users/by/username/${username}?user.fields=id,name,username`
  );
  return data.data.id as string;
}

export async function fetchUserTweets(
  userId: string,
  maxResults = 100,
  paginationToken?: string
): Promise<{ tweets: RawTweet[]; next_token?: string }> {
  const params = new URLSearchParams({
    max_results: Math.max(5, Math.min(maxResults, 100)).toString(),
    'tweet.fields': 'created_at,public_metrics,text,attachments',
    'media.fields': 'url,preview_image_url,type,alt_text',
    expansions: 'attachments.media_keys',
    exclude: 'retweets,replies',
  });
  if (paginationToken) params.set('pagination_token', paginationToken);

  const data = await twitterFetch(`${BASE_URL}/users/${userId}/tweets?${params}`);

  // Build a media_key → url lookup from the includes
  const mediaMap: Record<string, string> = {};
  for (const m of data.includes?.media ?? []) {
    const url = m.url ?? m.preview_image_url;
    if (url) mediaMap[m.media_key] = url;
  }

  const tweets: RawTweet[] = (data.data ?? []).map((t: any) => ({
    ...t,
    media_urls: (t.attachments?.media_keys ?? [])
      .map((k: string) => mediaMap[k])
      .filter(Boolean),
  }));

  return { tweets, next_token: data.meta?.next_token };
}

export async function fetchLatestTweets(username: string, count = 100): Promise<RawTweet[]> {
  const userId = await resolveUserId(username);
  const all: RawTweet[] = [];
  let nextToken: string | undefined;

  do {
    const { tweets, next_token } = await fetchUserTweets(
      userId,
      Math.min(count - all.length, 100),
      nextToken
    );
    all.push(...tweets);
    nextToken = next_token;
  } while (nextToken && all.length < count);

  return all.slice(0, count);
}
