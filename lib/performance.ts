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
}

interface ChartCandle {
  date: Date;
  high?: number | null;
  low?: number | null;
  close?: number | null;
}

/**
 * Resolve an entry against Yahoo. Two improvements over the v1 checkOutcome:
 *
 *   1. **OHLC walking.** Instead of "did current price cross target?", walk
 *      daily candles since signal_date and check each high / low. Catches
 *      intraday spikes through target/stop that have since reversed — once
 *      the level was touched, the position resolves.
 *
 *   2. **Synthetic entry + running return.** When Claude didn't extract an
 *      explicit entry_price (the common case — most tweets don't quote a
 *      precise level), use the close on signal_date as the implicit entry.
 *      That lets us compute and persist a running return for every pending
 *      row, so the Return column shows live P&L instead of perpetual "—".
 *
 * Returns null only when we genuinely can't compute anything — bad ticker,
 * Yahoo down, no chart data at all.
 */
export async function resolveOutcome(entry: PerformanceEntry): Promise<ResolvedOutcome | null> {
  const sym = await resolveSymbol(entry.asset);
  if (!sym) return null;

  // Fetch daily OHLC from signal_date forward + the current quote. The chart
  // gives us highs/lows to walk; the quote gives us the freshest price for
  // running return on entries whose level hasn't been hit.
  const period1 = entry.signal_date.slice(0, 10); // YYYY-MM-DD; trim time portion
  let candles: ChartCandle[] = [];
  let currentPrice: number | null = null;
  try {
    const [chartRes, quoteRes] = await Promise.all([
      yf.chart(sym, { period1, interval: '1d' }, { validateResult: false }).catch(() => null),
      yf.quote(sym, {}, { validateResult: false }).catch(() => null),
    ]);
    candles = ((chartRes as { quotes?: ChartCandle[] } | null)?.quotes ?? []).filter(
      (c) => c.high != null || c.low != null || c.close != null,
    );
    currentPrice = quoteRes?.regularMarketPrice ?? null;
  } catch {
    return null;
  }

  // Effective entry: prefer Claude's extracted level, fall back to the close
  // on the first trading day after signal_date. This is the conventional
  // "tracked from signal date" convention retail dashboards use.
  const syntheticEntry = candles[0]?.close ?? null;
  const effectiveEntry = entry.entry_price ?? syntheticEntry;
  if (effectiveEntry == null) return null;

  const isLong = entry.direction === 'long';
  const pctFromEntry = (level: number) =>
    isLong
      ? ((level - effectiveEntry) / effectiveEntry) * 100
      : ((effectiveEntry - level) / effectiveEntry) * 100;

  // OHLC walking: only run when explicit target or stop has been extracted.
  // Iterate candles oldest-first; whichever level is hit first wins. If both
  // a target and a stop are hit inside the same candle, we can't tell the
  // order intraday — conservative call is to mark it a stop-out (the
  // pessimistic assumption you'd want if you were using these numbers to
  // judge the strategy).
  if (entry.target_price != null || entry.stop_loss_price != null) {
    for (const c of candles) {
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

      if (stopHit) {
        return { outcome: 'loss', return_pct: pctFromEntry(entry.stop_loss_price!) };
      }
      if (targetHit) {
        return { outcome: 'win', return_pct: pctFromEntry(entry.target_price!) };
      }
    }
  }

  // No level crossing detected — return running P&L against the latest price.
  // Prefer the live quote; fall back to the most recent candle's close in case
  // the quote call failed but the chart succeeded.
  const lastPrice = currentPrice ?? candles[candles.length - 1]?.close ?? null;
  if (lastPrice == null) return { outcome: null, return_pct: null };

  return { outcome: null, return_pct: pctFromEntry(lastPrice) };
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
 * (win/loss + final return) and running P&L on still-open positions.
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
      updatePerformanceOutcome(entry.id, result.outcome, result.return_pct ?? 0);
      resolved += 1;
    } else if (result.return_pct != null) {
      // Still open — persist running return so the Return column shows
      // live P&L instead of an em-dash.
      updatePerformanceRunning(entry.id, result.return_pct);
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
    const before = inserted;
    upsertPerformance({ ...entry, updated_at: now });
    // upsertPerformance is silent on conflict, so we can't tell from a return
    // value whether this was a fresh insert or a no-op. Counting "attempts"
    // is fine for the scheduler log message.
    inserted = before + 1;
  }
  return { scanned: calls.length, inserted };
}
