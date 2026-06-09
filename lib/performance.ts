// Performance pipeline.
//
// The Performance tab reads from a separate `performance` SQLite table, but
// nothing was populating it. This file closes the gap:
//
//   1. `derivePerformanceEntry`  — pure: turn a trade-call analysis into a
//                                   performance row (or null when there's
//                                   nothing actionable).
//   2. `checkOutcome`            — async: hit Yahoo Finance for the current
//                                   price and decide whether the entry has
//                                   hit its target or stop. Returns null if
//                                   still pending.
//   3. `runOutcomeRefresh`       — iterate every pending row, update those
//                                   that have resolved.
//   4. `backfillPerformance`     — one-shot scan of existing trade-call
//                                   analyses; safely idempotent via the
//                                   UNIQUE(tweet_id, asset) index on the
//                                   table.
//
// Yahoo Finance access uses the same `yahoo-finance2` library the quote
// endpoint already uses — no new dependency, no API key, no cost.

import YahooFinance from 'yahoo-finance2';
import type { TweetAnalysis, PerformanceEntry } from './types';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Same ticker shape used elsewhere — only count entries with a valid symbol
// AND a directional bias (long/short). Without direction we can't reason
// about whether a price hit is a win or a loss.
const TICKER_RE = /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/;

export interface DerivedPerformanceEntry {
  tweet_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  signal_date: string;
  outcome: 'pending';
}

export function derivePerformanceEntry(
  tweet_id: string,
  signal_date: string,
  analysis: TweetAnalysis,
): DerivedPerformanceEntry | null {
  if (!analysis.is_trade_call) return null;

  // First ticker mention with a real symbol AND a directional bias.
  const mention = (analysis.tickers ?? []).find((t) =>
    TICKER_RE.test(t.ticker ?? '') &&
    (t.direction === 'long' || t.direction === 'short')
  );
  if (!mention) return null;

  const asset = mention.ticker;
  const direction = mention.direction as 'long' | 'short';

  // Look for the first signal that carries any price levels — prefer one
  // explicitly bound to the same asset, fall back to whichever has prices.
  const signal =
    (analysis.signals ?? []).find(
      (s) => s.asset === asset && (s.price != null || s.target != null || s.stop_loss != null),
    ) ??
    (analysis.signals ?? []).find(
      (s) => s.price != null || s.target != null || s.stop_loss != null,
    );

  return {
    tweet_id,
    asset,
    direction,
    entry_price: signal?.price,
    target_price: signal?.target,
    stop_loss_price: signal?.stop_loss,
    signal_date,
    outcome: 'pending',
  };
}

// Resolve `AAPL` → `AAPL`, `XFAB` → `XFAB.DE` etc. Same fallback the quote
// route uses (direct → .L suffix → search). Cheap when the direct hit works.
async function resolveSymbol(asset: string): Promise<string | null> {
  async function priceOf(sym: string): Promise<number | null> {
    try {
      const q = await yf.quote(sym, {}, { validateResult: false });
      return q.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }
  if ((await priceOf(asset)) != null) return asset;
  if ((await priceOf(`${asset}.L`)) != null) return `${asset}.L`;
  try {
    const r = (await yf.search(asset, {}, { validateResult: false })) as {
      quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean }>;
    };
    const hit = r.quotes?.find((q) => q.symbol && q.quoteType === 'EQUITY' && q.isYahooFinance);
    return hit?.symbol ?? null;
  } catch {
    return null;
  }
}

export interface ResolvedOutcome {
  /** Final outcome when target/stop has been crossed, null while still open. */
  outcome: 'win' | 'loss' | null;
  /** Running return on open entries; final return on resolved ones. Null if we
   *  truly can't compute (no entry, no symbol, no chart data). */
  return_pct: number | null;
  /** The price we used as the effective entry. Worth persisting so the Entry
   *  column on the dashboard shows a real number instead of an em-dash; the
   *  caller writes it back via COALESCE so Claude-extracted entries stay
   *  authoritative when they exist. */
  effective_entry: number | null;
}

interface ChartCandle {
  date: Date | string;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  close?: number | null;
}

// Pick chart resolution by signal age. Yahoo's intraday lookbacks (roughly):
//   5m  → ~60 days, sometimes shorter
//   1h  → ~2 years
//   1d  → unlimited
// Recent signals get the highest resolution so the entry candle sits as close
// to the tweet's posting time as possible; older signals fall back to daily,
// where the entry effectively becomes the close on the next trading day.
function pickInterval(daysSinceSignal: number): '5m' | '1h' | '1d' {
  if (daysSinceSignal <= 7) return '5m';
  if (daysSinceSignal <= 60) return '1h';
  return '1d';
}

function candleTime(c: ChartCandle): number {
  return c.date instanceof Date
    ? c.date.getTime()
    : new Date(c.date as string).getTime();
}

/**
 * Resolve an entry against Yahoo.
 *
 *   1. **Entry from the tweet's exact timestamp.** Fetch intraday OHLC at the
 *      finest resolution Yahoo supports for the signal's age (5m for recent,
 *      1h for the past two months, 1d beyond). The entry candle is the first
 *      one whose timestamp lies at or after the tweet's posting time — its
 *      close is the synthetic entry price. Much more accurate than "close on
 *      signal day," which could be hours away from a 10:32am tweet.
 *
 *   2. **OHLC walking from the entry candle.** Walk highs/lows on every
 *      candle after the entry, checking whether target or stop was crossed.
 *      Catches intraday spikes through the level that have since reversed.
 *
 *   3. **Running P&L on still-open positions.** Compare the effective entry
 *      against the latest price (live quote, fall back to last candle close)
 *      and persist via the caller. The Return column on the dashboard shows
 *      live percentages instead of perpetual em-dashes.
 *
 * Returns null only when we genuinely can't compute anything — bad ticker,
 * Yahoo down, or no chart data available yet (very fresh tweets).
 */
export async function resolveOutcome(entry: PerformanceEntry): Promise<ResolvedOutcome | null> {
  const sym = await resolveSymbol(entry.asset);
  if (!sym) return null;

  const signalTime = new Date(entry.signal_date).getTime();
  if (!Number.isFinite(signalTime)) return null;
  const daysSinceSignal = (Date.now() - signalTime) / 86_400_000;
  const interval = pickInterval(daysSinceSignal);

  // period1 is the tweet's full ISO timestamp — yahoo-finance2 accepts a Date
  // and we want intraday precision when the resolution is 5m / 1h. For 1d
  // the time portion is effectively ignored and we get the signal-date
  // candle and onward.
  const period1 = new Date(entry.signal_date);

  let candles: ChartCandle[] = [];
  let currentPrice: number | null = null;
  try {
    const [chartRes, quoteRes] = await Promise.all([
      yf.chart(sym, { period1, interval }, { validateResult: false }).catch(() => null),
      yf.quote(sym, {}, { validateResult: false }).catch(() => null),
    ]);
    candles = ((chartRes as { quotes?: ChartCandle[] } | null)?.quotes ?? []).filter(
      (c) => c.high != null || c.low != null || c.close != null || c.open != null,
    );
    currentPrice = quoteRes?.regularMarketPrice ?? null;
  } catch {
    return null;
  }

  // Entry candle: first one whose timestamp is at or after the tweet. For
  // intraday intervals this lands within minutes of the tweet; for 1d, on
  // the first trading day. If the chart returned nothing yet (very fresh
  // tweet, before the next candle has formed), the entry stays undefined.
  const entryIdx = candles.findIndex((c) => candleTime(c) >= signalTime);
  const entryCandle = entryIdx >= 0 ? candles[entryIdx] : candles[0];
  const syntheticEntry = entryCandle?.close ?? entryCandle?.open ?? null;

  // Prefer Claude's extracted entry when it exists — that's an explicit level
  // the author quoted. Fall back to the synthetic entry from the candle.
  const effectiveEntry = entry.entry_price ?? syntheticEntry;
  if (effectiveEntry == null) return null;

  const isLong = entry.direction === 'long';
  const pctFromEntry = (level: number) =>
    isLong
      ? ((level - effectiveEntry) / effectiveEntry) * 100
      : ((effectiveEntry - level) / effectiveEntry) * 100;

  // OHLC walking starts from the entry candle. Candles BEFORE the tweet
  // don't represent the position — including them would falsely resolve
  // entries against price action that happened before the call.
  const walked = entryIdx >= 0 ? candles.slice(entryIdx) : candles;

  if (entry.target_price != null || entry.stop_loss_price != null) {
    for (const c of walked) {
      const hi = c.high ?? null;
      const lo = c.low ?? null;
      if (hi == null && lo == null) continue;

      let targetHit = false;
      let stopHit = false;
      if (isLong) {
        if (entry.target_price != null && hi != null && hi >= entry.target_price) targetHit = true;
        if (entry.stop_loss_price != null && lo != null && lo <= entry.stop_loss_price) stopHit = true;
      } else {
        if (entry.target_price != null && lo != null && lo <= entry.target_price) targetHit = true;
        if (entry.stop_loss_price != null && hi != null && hi >= entry.stop_loss_price) stopHit = true;
      }

      // Both touched in the same candle — can't tell intraday order from
      // OHLC alone. Conservative: assume stop-out (pessimistic-by-default,
      // which is the assumption you want for honest strategy evaluation).
      if (stopHit) {
        return {
          outcome: 'loss',
          return_pct: pctFromEntry(entry.stop_loss_price!),
          effective_entry: effectiveEntry,
        };
      }
      if (targetHit) {
        return {
          outcome: 'win',
          return_pct: pctFromEntry(entry.target_price!),
          effective_entry: effectiveEntry,
        };
      }
    }
  }

  // Still open. Running P&L from effective entry to latest price.
  const lastPrice = currentPrice ?? walked[walked.length - 1]?.close ?? null;
  if (lastPrice == null) {
    return { outcome: null, return_pct: null, effective_entry: effectiveEntry };
  }

  return {
    outcome: null,
    return_pct: pctFromEntry(lastPrice),
    effective_entry: effectiveEntry,
  };
}

// ─── DB-touching orchestrators ───────────────────────────────────────────
// These pull pending rows from the DB and write resolved outcomes back.
// Kept here (not in db.ts) so the heavy yahoo-finance2 import is only
// loaded when the performance pipeline actually runs.

import {
  getPendingPerformanceEntries,
  updatePerformanceOutcome,
  updatePerformanceRunning,
  upsertPerformance,
  getAnalyzedTradeCalls,
} from './db';

/**
 * Walk every pending entry, resolve against Yahoo, persist both resolutions
 * (win/loss + final return) and running P&L on still-open positions. The
 * synthetic entry price gets written back via COALESCE so Claude-extracted
 * entries (when present) stay authoritative.
 */
export async function runOutcomeRefresh(): Promise<{
  checked: number;
  resolved: number;
  updated: number;
}> {
  const pending = getPendingPerformanceEntries() as unknown as PerformanceEntry[];
  let resolved = 0;
  let updated = 0;
  for (const entry of pending) {
    const result = await resolveOutcome(entry);
    if (!result) continue;
    if (result.outcome) {
      // Target or stop has been crossed — final outcome + final return.
      updatePerformanceOutcome(
        entry.id,
        result.outcome,
        result.return_pct ?? 0,
        result.effective_entry,
      );
      resolved += 1;
    } else if (result.return_pct != null) {
      // Still open — persist running return so the Return column shows live
      // P&L instead of an em-dash. Also writes the synthetic entry once, so
      // the Entry column shows a real price for tracked-from-tweet entries.
      updatePerformanceRunning(entry.id, result.return_pct, result.effective_entry);
      updated += 1;
    }
  }
  return { checked: pending.length, resolved, updated };
}

/**
 * One-shot scan of existing trade-call analyses, inserting a performance row
 * per (tweet, ticker) pair. Idempotent — the UNIQUE(tweet_id, asset) index
 * on the table makes the upsert a no-op when a row already exists, so this
 * is safe to call on every server boot.
 */
export function backfillPerformance(): { scanned: number; inserted: number } {
  const calls = getAnalyzedTradeCalls() as Array<{
    tweet_id: string;
    created_at: string;
    analysis: TweetAnalysis;
  }>;
  const now = new Date().toISOString();
  let inserted = 0;
  for (const row of calls) {
    const entry = derivePerformanceEntry(row.tweet_id, row.created_at, row.analysis);
    if (!entry) continue;
    inserted += upsertPerformance({ ...entry, updated_at: now });
  }
  return { scanned: calls.length, inserted };
}
