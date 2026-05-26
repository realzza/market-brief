import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 24-hour in-process cache — exchange names rarely change
const cache = new Map<string, { label: string; ts: number }>();
const TTL = 24 * 60 * 60 * 1000;

function abbreviate(exchange: string, assetType: string): string {
  if (assetType === 'crypto') return 'Crypto';
  if (assetType === 'forex')  return 'FX';
  if (assetType === 'commodity') return 'Commodity';

  const map: Record<string, string> = {
    NasdaqGS: 'NASDAQ', NasdaqCM: 'NASDAQ', NasdaqNM: 'NASDAQ',
    NYSE: 'NYSE', NYSEArca: 'NYSE', 'NYSE American': 'NYSE',
    LSE: 'LSE', 'London Stock Exchange': 'LSE',
    'Toronto Stock Exchange': 'TSX', TSX: 'TSX',
    Euronext: 'Euronext', PAR: 'Paris', AMS: 'AEX',
    XETRA: 'XETRA', FRA: 'Frankfurt',
    TYO: 'Tokyo', HKG: 'HKEX',
    ASX: 'ASX', 'Australian Securities Exchange': 'ASX',
    SHG: 'Shanghai', SHE: 'Shenzhen',
    CCC: 'Crypto', // Yahoo crypto suffix
    OTC: 'OTC', PNK: 'OTC',
  };
  return map[exchange] ?? exchange.split(' ')[0];
}

async function resolveExchange(ticker: string, assetType: string): Promise<string> {
  // Crypto/forex don't need Yahoo lookup
  if (assetType === 'crypto') return 'Crypto';
  if (assetType === 'forex')  return 'FX';
  if (assetType === 'commodity') return 'Commodity';

  // Try exact, then .L suffix, then search
  async function tryQuote(sym: string) {
    const q = await yf.quote(sym, {}, { validateResult: false });
    if (q.regularMarketPrice != null) return q.fullExchangeName ?? q.exchange ?? '';
    return null;
  }

  let raw = await tryQuote(ticker).catch(() => null);
  if (!raw) raw = await tryQuote(`${ticker}.L`).catch(() => null);
  if (!raw) {
    const r = (await yf.search(ticker, {}, { validateResult: false })) as {
      quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean; exchange?: string }>;
    };
    const hit = r.quotes?.find((q) => q.symbol && q.quoteType === 'EQUITY' && q.isYahooFinance);
    raw = hit?.exchange ?? '';
  }

  return abbreviate(raw, assetType);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('tickers') ?? '';
  const pairs = raw
    .split(',')
    .map((s) => {
      const [ticker, assetType = 'unknown'] = s.split(':');
      return { ticker: ticker.trim(), assetType };
    })
    .filter((p) => p.ticker);

  if (pairs.length === 0) return NextResponse.json({});

  const result: Record<string, string> = {};

  await Promise.all(
    pairs.map(async ({ ticker, assetType }) => {
      const cached = cache.get(ticker);
      if (cached && Date.now() - cached.ts < TTL) {
        result[ticker] = cached.label;
        return;
      }
      try {
        const label = await resolveExchange(ticker, assetType);
        cache.set(ticker, { label, ts: Date.now() });
        result[ticker] = label;
      } catch {
        result[ticker] = '';
      }
    }),
  );

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
