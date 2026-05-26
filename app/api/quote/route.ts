import { NextRequest, NextResponse } from 'next/server';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

  try {
    const sym = encodeURIComponent(ticker.toUpperCase());
    const [quoteRes, chartRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=price`, {
        headers: YF_HEADERS,
        next: { revalidate: 60 },
      }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1mo`, {
        headers: YF_HEADERS,
        next: { revalidate: 60 },
      }),
    ]);

    if (!quoteRes.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${quoteRes.status} for ${ticker}` },
        { status: 502 },
      );
    }

    const quoteData = await quoteRes.json();
    const price = quoteData?.quoteSummary?.result?.[0]?.price;
    if (!price) return NextResponse.json({ error: `No quote data for ${ticker}` }, { status: 404 });

    let closes: number[] = [];
    if (chartRes.ok) {
      const chartData = await chartRes.json();
      const raw: (number | null)[] =
        chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      closes = raw.filter((v): v is number => v != null);
    }

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      name: price.shortName ?? ticker,
      currency: price.currency ?? 'USD',
      exchange: price.exchangeName ?? '',
      price: price.regularMarketPrice?.raw ?? 0,
      change: price.regularMarketChange?.raw ?? 0,
      changePct: (price.regularMarketChangePercent?.raw ?? 0) * 100,
      volume: price.regularMarketVolume?.raw ?? 0,
      marketCap: price.marketCap?.raw ?? 0,
      dayHigh: price.regularMarketDayHigh?.raw ?? 0,
      dayLow: price.regularMarketDayLow?.raw ?? 0,
      week52High: price.fiftyTwoWeekHigh?.raw ?? 0,
      week52Low: price.fiftyTwoWeekLow?.raw ?? 0,
      open: price.regularMarketOpen?.raw ?? 0,
      closes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
