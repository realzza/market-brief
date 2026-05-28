import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function hasPrice(sym: string): Promise<boolean> {
  try {
    const q = await yf.quote(sym, {}, { validateResult: false });
    return q.regularMarketPrice != null;
  } catch {
    return false;
  }
}

async function resolveSymbol(ticker: string): Promise<string> {
  if (await hasPrice(ticker)) return ticker;
  const lse = `${ticker}.L`;
  if (await hasPrice(lse)) return lse;
  const results = (await yf.search(ticker, {}, { validateResult: false })) as {
    quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean }>;
  };
  const hit = results.quotes?.filter((q) => q.symbol && q.quoteType === 'EQUITY' && q.isYahooFinance)[0];
  if (hit?.symbol) return hit.symbol;
  throw new Error(`No Yahoo Finance symbol found for ${ticker}`);
}

function pctChange(from: number, to: number) {
  return ((to - from) / Math.abs(from)) * 100;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

  try {
    const sym = await resolveSymbol(ticker.toUpperCase());

    // Fetch 1 year of daily data + a 5-day intraday window. The wider intraday
    // window guarantees we get the last trading session even over weekends or
    // holidays; we then filter to just that most-recent day below.
    const yearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    type ChartQuote = { date: Date; close?: number | null };

    const [quote, chartResult, intradayResult] = await Promise.all([
      yf.quote(sym, {}, { validateResult: false }),
      yf.chart(sym, { period1: yearAgo, interval: '1d' }, { validateResult: false }).catch(() => null),
      yf.chart(sym, { period1: fiveDaysAgo, interval: '5m' }, { validateResult: false }).catch(() => null),
    ]);

    function toPoints(raw: ChartQuote[], iso = false): { t: string; c: number }[] {
      return raw
        .filter((q): q is ChartQuote & { close: number } => q.close != null)
        .map((q) => ({ t: iso ? q.date.toISOString() : q.date.toISOString().split('T')[0], c: q.close }));
    }

    const rawQuotes = (chartResult as { quotes?: ChartQuote[] } | null)?.quotes ?? [];
    const closes = toPoints(rawQuotes);
    const intradayRaw = (intradayResult as { quotes?: ChartQuote[] } | null)?.quotes ?? [];
    const intradayAll = toPoints(intradayRaw, true);

    // Keep only the most recent trading session's points (group by local date
    // of the timestamp, then take the last group). This means the 1D tab will
    // show today's session when the market is open and Friday's session over
    // the weekend — always intraday, never a multi-day fallback.
    let intraday = intradayAll;
    if (intradayAll.length > 0) {
      // ISO timestamps are UTC; compare UTC date prefix so the filter is
      // independent of server timezone. US trading sessions don't cross midnight UTC.
      const lastDate = intradayAll[intradayAll.length - 1].t.slice(0, 10);
      intraday = intradayAll.filter((p) => p.t.slice(0, 10) === lastDate);
    }

    const latest = closes.at(-1)?.c ?? (quote.regularMarketPrice ?? 0);

    function perfSinceDays(days: number): number | null {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const slice = closes.filter((q) => new Date(q.t).getTime() >= cutoff);
      if (slice.length < 2) return null;
      return pctChange(slice[0].c, latest);
    }

    function ytdPerf(): number | null {
      const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
      const slice = closes.filter((q) => new Date(q.t).getTime() >= jan1);
      if (slice.length < 2) return null;
      return pctChange(slice[0].c, latest);
    }

    const performance = {
      d1: quote.regularMarketChangePercent ?? perfSinceDays(1) ?? 0,
      w1: perfSinceDays(7),
      m1: perfSinceDays(30),
      m3: perfSinceDays(90),
      ytd: ytdPerf(),
      y1: perfSinceDays(365),
    };

    return NextResponse.json({
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
      // Full 5-day window of 5-minute intraday bars. Same data the API
      // already fetched to build `intraday`, just before the "last session
      // only" filter. The performance position chart uses this so recent
      // signals (where today's daily close may not exist yet) still render
      // a meaningful curve. Adds ~30KB to the payload, which is fine.
      intradayAll,
      performance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
