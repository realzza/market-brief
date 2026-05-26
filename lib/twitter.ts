import { Scraper } from 'agent-twitter-client';
import { RawTweet } from './types';

// Module-level singleton — reuse the authenticated session across requests.
let _scraper: Scraper | null = null;

async function getScraper(): Promise<Scraper> {
  if (_scraper) return _scraper;

  const scraper = new Scraper();
  const username = process.env.SCRAPER_USERNAME;
  const password = process.env.SCRAPER_PASSWORD;

  if (username && password) {
    await scraper.login(username, password);
  }
  // No explicit guest-auth call needed — Scraper acquires a guest token automatically

  _scraper = scraper;
  return scraper;
}

export async function fetchLatestTweets(handle: string, count = 100): Promise<RawTweet[]> {
  const scraper = await getScraper();
  const results: RawTweet[] = [];

  try {
    for await (const tweet of scraper.getTweets(handle, count)) {
      // Skip retweets and replies — only want original posts
      if (tweet.isRetweet || tweet.isReply) continue;
      if (!tweet.id || !tweet.text) continue;

      results.push({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.timeParsed
          ? tweet.timeParsed.toISOString()
          : new Date((tweet.timestamp ?? 0) * 1000).toISOString(),
        public_metrics: {
          like_count: tweet.likes ?? 0,
          retweet_count: tweet.retweets ?? 0,
          reply_count: tweet.replies ?? 0,
          impression_count: tweet.views ?? 0,
        },
        media_urls: tweet.photos.map((p) => p.url),
      });

      if (results.length >= count) break;
    }
  } catch (err) {
    // Reset so the next request gets a fresh session
    _scraper = null;
    throw err;
  }

  return results;
}
