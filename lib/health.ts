// Health snapshot for the /status page and GET /api/health.
//
// Runs in the same Node process as the background scheduler (both are started
// from instrumentation.ts), so getLastFetchAt() / getNextDigestAt() read the
// live in-process state rather than a stored copy. The sub-service checks ping
// the same upstreams the fetch loop uses (RSSHub, the Truth Social sidecar).

import { getStats, getLatestDigest, getLastFetchTime } from './db';
import { getNextDigestAt, getDigestHour } from './scheduler';

export interface ServiceHealth {
  name: string;
  configured: boolean;
  ok: boolean;
  detail: string; // human-readable status ("200 · 42ms", "not configured", …)
}

export interface Health {
  now: string;
  scheduler: {
    last_fetch_at: string | null;
    next_digest_at: string;
    digest_hour: number;
  };
  posts: { total: number; analyzed: number; pending: number };
  digest: {
    generated_at: string;
    window_start: string;
    window_end: string;
    post_count: number;
    items: number;
    input_tokens: number | null;
    output_tokens: number | null;
  } | null;
  services: ServiceHealth[];
}

// Ping a URL with a short timeout. "ok" = any non-5xx response (a 200/302/404
// still proves the service is up and reachable); a thrown error (DNS, refused,
// timeout) means it's down.
async function ping(name: string, url: string | undefined, path = ''): Promise<ServiceHealth> {
  if (!url) {
    return { name, configured: false, ok: false, detail: 'not configured' };
  }
  const target = `${url.replace(/\/$/, '')}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    const ms = Date.now() - t0;
    return {
      name,
      configured: true,
      ok: res.status < 500,
      detail: `${res.status} · ${ms}ms`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, configured: true, ok: false, detail: `unreachable — ${msg}` };
  }
}

export async function getHealth(): Promise<Health> {
  const stats = getStats() as { total_tweets: number; analyzed_tweets: number };
  const latest = getLatestDigest();
  const lastFetch = getLastFetchTime();

  // Service pings run in parallel. RSSHub root proves reachability; the Truth
  // Social sidecar exposes /healthz (see truthsocial-sidecar/server.py).
  const [rsshub, truthsocial] = await Promise.all([
    ping('RSSHub', process.env.RSSHUB_URL?.trim(), '/'),
    ping('Truth Social sidecar', process.env.TRUTHSOCIAL_URL?.trim(), '/healthz'),
  ]);

  return {
    now: new Date().toISOString(),
    scheduler: {
      last_fetch_at: lastFetch,
      next_digest_at: new Date(getNextDigestAt()).toISOString(),
      digest_hour: getDigestHour(),
    },
    posts: {
      total: stats.total_tweets,
      analyzed: stats.analyzed_tweets,
      pending: Math.max(0, stats.total_tweets - stats.analyzed_tweets),
    },
    digest: latest
      ? {
          generated_at: latest.generated_at,
          window_start: latest.window_start,
          window_end: latest.window_end,
          post_count: latest.post_count,
          items: latest.items.length,
          input_tokens: latest.input_tokens,
          output_tokens: latest.output_tokens,
        }
      : null,
    services: [rsshub, truthsocial],
  };
}
