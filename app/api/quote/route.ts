import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Module-level singleton — reused across requests in the same worker.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function hasPrice(sym: string): Promise<boolean> {
  try {
    const q = await yf.quote(sym, {}, { validateResult: false });
    return q.regularMarketPrice != null;
  } catch {
    return false;
  }
}

/**
 * Resolve a bare ticker to a Yahoo Finance symbol.
 * Order: exact match → .L suffix (London) → search first equity hit.
 */
async function resolveSymbol(ticker: string): Promise<string> {
  if (await hasPrice(ticker)) return ticker;

  const lse = `${ticker}.L`;
  if (await hasPrice(lse)) return lse;

  const results = (await yf.search(ticker, {}, { validateResult: false })) as {
    quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean }>;
  };
  const equities = results.quotes?.filter(
    (q) => q.symbol && q.quoteType === 'EQUITY' && q.isYahooFinance,
  );
  const hit = equities?.[0];
  if (hit?.symbol) return hit.symbol;

  throw new Error(`No Yahoo Finance symbol found for ${ticker}`);
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

  try {
    const sym = await resolveSymbol(ticker.toUpperCase());

    const [quote, chartResult] = await Promise.all([
      yf.quote(sym, {}, { validateResult: false }),
      yf
        .chart(
          sym,
          {
            period1: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            interval: '1d',
          },
          { validateResult: false },
        )
        .catch(() => null),
    ]);

    const rawQuotes = (chartResult as { quotes?: Array<{ close?: number | null }> } | null)
      ?.quotes ?? [];
    const closes: number[] = rawQuotes
      .map((q) => q.close)
      .filter((v): v is number => v != null);

    const change = quote.regularMarketChange ?? 0;
    const changePct = quote.regularMarketChangePercent ?? 0;

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      resolvedSymbol: sym,
      name: quote.shortName ?? quote.longName ?? ticker,
      currency: quote.currency ?? 'USD',
      exchange: quote.fullExchangeName ?? quote.exchange ?? '',
      price: quote.regularMarketPrice ?? 0,
      change,
      changePct,
      volume: quote.regularMarketVolume ?? 0,
      marketCap: quote.marketCap ?? 0,
      dayHigh: quote.regularMarketDayHigh ?? 0,
      dayLow: quote.regularMarketDayLow ?? 0,
      week52High: quote.fiftyTwoWeekHigh ?? 0,
      week52Low: quote.fiftyTwoWeekLow ?? 0,
      open: quote.regularMarketOpen ?? 0,
      closes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
