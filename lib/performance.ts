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

export interface CheckedOutcome {
  outcome: 'win' | 'loss';
  actual_return_pct: number;
}

// Compare the current market price against the entry / target / stop levels
// to decide if a pending entry has resolved. Conservative: only mark win/loss
// when the level has actually been crossed. Anything ambiguous stays pending
// for the next cron tick.
export async function checkOutcome(entry: PerformanceEntry): Promise<CheckedOutcome | null> {
  if (entry.entry_price == null) return null;
  if (entry.target_price == null && entry.stop_loss_price == null) return null;

  const sym = await resolveSymbol(entry.asset);
  if (!sym) return null;

  let current: number | null = null;
  try {
    const q = await yf.quote(sym, {}, { validateResult: false });
    current = q.regularMarketPrice ?? null;
  } catch {
    return null;
  }
  if (current == null) return null;

  const entryPrice = entry.entry_price;
  const isLong = entry.direction === 'long';

  // Long: target above entry, stop below. Short: inverted. Compute return
  // off the actual level that was hit, not the current spot — gives the
  // canonical fill-at-target / fill-at-stop P&L the dashboard expects.
  if (isLong) {
    if (entry.target_price != null && current >= entry.target_price) {
      return {
        outcome: 'win',
        actual_return_pct: ((entry.target_price - entryPrice) / entryPrice) * 100,
      };
    }
    if (entry.stop_loss_price != null && current <= entry.stop_loss_price) {
      return {
        outcome: 'loss',
        actual_return_pct: ((entry.stop_loss_price - entryPrice) / entryPrice) * 100,
      };
    }
  } else {
    if (entry.target_price != null && current <= entry.target_price) {
      return {
        outcome: 'win',
        actual_return_pct: ((entryPrice - entry.target_price) / entryPrice) * 100,
      };
    }
    if (entry.stop_loss_price != null && current >= entry.stop_loss_price) {
      return {
        outcome: 'loss',
        actual_return_pct: ((entryPrice - entry.stop_loss_price) / entryPrice) * 100,
      };
    }
  }

  return null;
}

// ─── DB-touching orchestrators ───────────────────────────────────────────
// These pull pending rows from the DB and write resolved outcomes back.
// Kept here (not in db.ts) so the heavy yahoo-finance2 import is only
// loaded when the performance pipeline actually runs.

import {
  getPendingPerformanceEntries,
  updatePerformanceOutcome,
  upsertPerformance,
  getAnalyzedTradeCalls,
} from './db';

/** Walk every pending entry, check it against Yahoo, persist resolutions. */
export async function runOutcomeRefresh(): Promise<{ checked: number; resolved: number }> {
  const pending = getPendingPerformanceEntries() as unknown as PerformanceEntry[];
  let resolved = 0;
  for (const entry of pending) {
    const result = await checkOutcome(entry);
    if (result) {
      updatePerformanceOutcome(entry.id, result.outcome, result.actual_return_pct);
      resolved += 1;
    }
  }
  return { checked: pending.length, resolved };
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
