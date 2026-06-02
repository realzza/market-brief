// Shared Yahoo Finance quote builder.
//
// Plain JS (not TS) so it can be imported both by the TS route handler
// (app/api/quote) on the live server AND by the Node build script
// (scripts/bake-quotes.mjs) that pre-renders quotes into the static export.
// Keeping one implementation means the baked snapshot matches the live API.

import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function hasPrice(sym) {
  try {
    const q = await yf.quote(sym, {}, { validateResult: false });
    return q.regularMarketPrice != null;
  } catch {
    return false;
  }
}

// Resolve a bare ticker to a Yahoo symbol: try as-is, then the LSE suffix,
// then fall back to Yahoo search for the first matching equity.
export async function resolveSymbol(ticker) {
  if (await hasPrice(ticker)) return ticker;
  const lse = `${ticker}.L`;
  if (await hasPrice(lse)) return lse;
  const results = await yf.search(ticker, {}, { validateResult: false });
  const hit = results.quotes?.filter((q) => q.symbol && q.quoteType === 'EQUITY' && q.isYahooFinance)[0];
  if (hit?.symbol) return hit.symbol;
  throw new Error(`No Yahoo Finance symbol found for ${ticker}`);
}

function pctChange(from, to) {
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * Build the full quote payload the TickerModal / PositionChart consume:
 * spot fields, a 1-year daily close series, the most-recent intraday session,
 * the full 5-day intraday window, and period performance.
 * Throws if the ticker can't be resolved or Yahoo is unreachable.
 */
export async function buildQuote(ticker) {
  const sym = await resolveSymbol(ticker.toUpperCase());

  // 1 year of daily + a 5-day intraday window (the wider window guarantees we
  // catch the last session over weekends/holidays; filtered to one day below).
  const yearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [quote, chartResult, intradayResult] = await Promise.all([
    yf.quote(sym, {}, { validateResult: false }),
    yf.chart(sym, { period1: yearAgo, interval: '1d' }, { validateResult: false }).catch(() => null),
    yf.chart(sym, { period1: fiveDaysAgo, interval: '5m' }, { validateResult: false }).catch(() => null),
  ]);

  function toPoints(raw, iso = false) {
    return raw
      .filter((q) => q.close != null)
      .map((q) => ({ t: iso ? q.date.toISOString() : q.date.toISOString().split('T')[0], c: q.close }));
  }

  const closes = toPoints(chartResult?.quotes ?? []);
  const intradayAll = toPoints(intradayResult?.quotes ?? [], true);

  // Keep only the most recent session's intraday points (group by UTC date,
  // take the last group). US sessions don't cross midnight UTC.
  let intraday = intradayAll;
  if (intradayAll.length > 0) {
    const lastDate = intradayAll[intradayAll.length - 1].t.slice(0, 10);
    intraday = intradayAll.filter((p) => p.t.slice(0, 10) === lastDate);
  }

  const latest = closes.at(-1)?.c ?? (quote.regularMarketPrice ?? 0);

  function perfSinceDays(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const slice = closes.filter((q) => new Date(q.t).getTime() >= cutoff);
    if (slice.length < 2) return null;
    return pctChange(slice[0].c, latest);
  }

  function ytdPerf() {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
    const slice = closes.filter((q) => new Date(q.t).getTime() >= jan1);
    if (slice.length < 2) return null;
    return pctChange(slice[0].c, latest);
  }

  return {
    ticker: ticker.toUpperCase(),
    resolvedSymbol: sym,
    name: quote.shortName ?? quote.longName ?? ticker,
    currency: quote.currency ?? 'USD',
    exchange: quote.fullExchangeName ?? quote.exchange ?? '',
    price: quote.regularMarketPrice ?? 0,
    change: quote.regularMarketChange ?? 0,
    changePct: quote.regularMarketChangePercent ?? 0,
    volume: quote.regularMarketVolume ?? 0,
    marketCap: quote.marketCap ?? 0,
    dayHigh: quote.regularMarketDayHigh ?? 0,
    dayLow: quote.regularMarketDayLow ?? 0,
    week52High: quote.fiftyTwoWeekHigh ?? 0,
    week52Low: quote.fiftyTwoWeekLow ?? 0,
    open: quote.regularMarketOpen ?? 0,
    closes,
    intraday,
    intradayAll,
    performance: {
      d1: quote.regularMarketChangePercent ?? perfSinceDays(1) ?? 0,
      w1: perfSinceDays(7),
      m1: perfSinceDays(30),
      m3: perfSinceDays(90),
      ytd: ytdPerf(),
      y1: perfSinceDays(365),
    },
  };
}
