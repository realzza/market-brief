# Serenity Tracker

An editorial dashboard that fetches the latest tweets from a single X / Twitter
account, runs them through Claude for structured financial analysis (sentiment,
tickers, trade signals, sectors), and presents the result as a daily "brief"
with a feed, sentiment timeline, asset leaderboard, and tracked-signal
performance.

Default target account is [@aleabitoreddit](https://x.com/aleabitoreddit); set
`TWITTER_USERNAME` to point at anyone else.

## Stack

- **Next.js 16** (App Router, RSC where it matters, standalone output for Docker)
- **React 19**
- **SQLite via better-sqlite3** — single file under `data/serenity.db`, WAL mode
- **Anthropic Claude (Sonnet 4.6)** — analysis with prompt caching on the schema instruction
- **yahoo-finance2** — quotes + intraday/daily charts for the ticker drill-down modal
- **RSSHub (optional)** — fresh tweet path; falls back to the public syndication endpoint when not configured

## Quick start (local)

```bash
cp .env.example .env       # then fill in ANTHROPIC_API_KEY
npm install
npm run dev                # http://localhost:3000
```

The scheduler kicks in once the dev server boots (see [`instrumentation.ts`](instrumentation.ts))
and pulls fresh tweets every 15 minutes. On first run it also creates
`data/serenity.db` and runs the schema migrations in
[`lib/db.ts`](lib/db.ts).

## Docker (recommended for unattended runs)

```bash
cp .env.example .env       # at minimum, set ANTHROPIC_API_KEY
docker compose up -d
```

The host port defaults to **3737** (set `PORT_HOST` in `.env` to change).
The container always listens on 3000 internally; SQLite lives in a named
volume (`serenity-tracker-data`) so the database survives container
restarts. See [`docker-compose.yml`](docker-compose.yml) for the full
setup, including the optional RSSHub sidecar.

## Environment variables

| Variable | Required? | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | Claude API key for tweet analysis |
| `TWITTER_USERNAME` | no | X handle to track. Default: `aleabitoreddit` |
| `TZ` | no | IANA timezone for container logs. Default: `UTC` |
| `PORT_HOST` | no | Host port for the Docker container. Default: `3737` |
| `RSSHUB_URL` | no | Base URL of an RSSHub instance. When unset (or empty), the app skips RSSHub and goes straight to the syndication endpoint. The compose file sets this to `http://rsshub:1200` by default. |
| `TWITTER_AUTH_TOKEN` | no | `auth_token` cookie from a logged-in X session, passed through to RSSHub. **Use a throwaway account** — this cookie is a full login session. |
| `TWITTER_CONSUMER_KEY` / `TWITTER_CONSUMER_SECRET` | no | Twitter Developer App credentials for RSSHub's Twitter route |

See [`.env.example`](.env.example) for the full annotated set, including
how to obtain the Twitter credentials.

## How tweet fetching works

[`lib/twitter.ts`](lib/twitter.ts) has two paths:

1. **RSSHub** (preferred) — when `RSSHUB_URL` is set and the Twitter route
   is configured (all three Twitter env vars), this scrapes the live
   user timeline and returns fresh data. It does not expose engagement
   metrics, so like/RT/reply counts come back as 0.
2. **Syndication** (fallback) — `syndication.twitter.com`'s public
   endpoint. No auth required, but for many individual accounts it
   serves heavily cached data (sometimes months stale). It does return
   real engagement metrics.

The scheduler logs which path served each fetch and how stale the
newest tweet is, so you can tell at a glance whether RSSHub is healthy
and whether the upstream is current:

```
[twitter] via rsshub: 100 tweets · newest=2026-05-27T01:11:00.000Z (0.4d ago)
[scheduler] ok · 2026-05-27T01:30:00.000Z · fetched=100 new=2 updated=98 took=842ms
```

## How analysis works

`POST /api/analyze` pulls up to N (default 10) unanalyzed tweets, sends
each to Claude with a JSON-schema prompt, and writes the result back to
`tweet_analysis`. The schema lives in [`lib/claude.ts`](lib/claude.ts)
and asks for:

- overall sentiment (`bullish` / `bearish` / `neutral` / `mixed`) and a `-1.0…+1.0` score
- ticker mentions with asset type and implied direction
- structured trade signals (entry / exit / target / stop / alert / analysis)
- key themes, risk level, `is_trade_call` boolean
- a constrained list of industry domains (semis, AI, crypto, macro/fed, etc.)
- a 1–2 sentence prose summary

The schema instruction is sent with `cache_control: { type: 'ephemeral' }`
so Anthropic's prompt cache amortizes it across requests. Per-tweet
inputs (image attachments, the tweet text, and optional user questions)
are appended after the cache breakpoint.

The dashboard's per-card **Analyze this tweet** button supports a free-form
follow-up question — that gets a wider token budget (8K vs the default
4K) since non-English answers eat ~2 tokens/char.

## Project layout

```
app/
├── api/              Route handlers (see "API routes" below)
├── layout.tsx        Root layout, font setup, theme bootstrap script
├── page.tsx          The dashboard (client component)
└── globals.css       Design tokens + all component styles

components/           Presentational React components
├── Masthead.tsx      Top bar: edition #, title, action buttons, status toast
├── TodaysBrief.tsx   Hero: featured trade-call tweet + market mood gauge
├── StatsBar.tsx      Coverage / Bullish / Bearish / Neutral / Signals / Win rate strip
├── TweetCard.tsx     Per-tweet article: text, media, signals, ticker chips
├── TickerModal.tsx   Quote drill-down: price chart, perf chips, market data
├── SentimentChart.tsx, AssetMentions.tsx, PerformanceDashboard.tsx
└── …

lib/
├── twitter.ts        RSSHub + syndication fetchers, normalization
├── claude.ts         Analysis pipeline, schema, prompt caching, image handling
├── db.ts             better-sqlite3 wrapper, schema, migrations, queries
├── scheduler.ts      In-process cron (15 min) + shared in-flight gate
├── domainConfig.ts   Sector → color mapping (oklch)
├── format.ts         Number / date / sentiment formatters
├── richText.tsx      Inline $TICKER + **bold** renderer
├── featured.ts       Pick the featured trade-call for the brief
└── types.ts          Shared TypeScript shapes

instrumentation.ts    Boots the scheduler exactly once per server start
```

## API routes

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/tweets?limit=&offset=` | List stored tweets (with analysis if available) |
| `POST` | `/api/tweets` | Trigger a manual fetch now (subject to the in-flight gate) |
| `POST` | `/api/analyze` | Analyze N unanalyzed tweets (`{ limit }`) or a single tweet (`{ tweet_id, user_question? }`) |
| `GET`  | `/api/analyze` | Reports whether any tweet is still unanalyzed |
| `GET`  | `/api/refresh?days=30` | Dashboard stats + sentiment timeline |
| `GET`  | `/api/quote?ticker=` | Yahoo Finance quote + 1y daily + 5d intraday |
| `GET`  | `/api/tickers-info?tickers=AAPL:stock,BTC:crypto` | Resolve display labels (exchange / asset class) |
| `GET`  | `/api/performance` | Tracked trade-signal outcomes |
| `POST` | `/api/performance` | Upsert a tracked signal |

## Operational notes

- **SQLite location.** Dev: `./data/serenity.db`. Docker: bind-mounted volume at `/app/data` (named volume `serenity-tracker-data`). The DB is small (hundreds of KB per few thousand tweets) and survives container restarts.
- **Scheduler.** Single in-process cron at 15-minute intervals, started by [`instrumentation.ts`](instrumentation.ts). It shares an in-flight gate with the manual fetch button so a button-press and a scheduled tick can't both hammer the upstream.
- **Stats cost.** `/api/refresh` aggregates the whole table on every call (counts + ticker scan + domain rollup). For larger corpora consider adding an in-process cache layer keyed on the latest `analyzed_at`.
- **No write auth.** All `POST` routes are unauthenticated — fine for local / single-host use, not fine if you expose the container to the internet. Add a bearer-token check at the edge or in middleware before doing that.

## Development tips

- `npm run lint` runs ESLint.
- `npx tsc --noEmit` for a fast standalone type check.
- The `[claude]` / `[twitter]` / `[scheduler]` log prefixes make it easy to `grep` the container logs.
- The scheduler's "newest=…d ago" log line is the quickest way to confirm the upstream isn't serving stale data.
