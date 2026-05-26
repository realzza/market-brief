'use client';

interface Props {
  topTickers: Array<{ ticker: string; count: number }>;
}

const COLORS = [
  '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f59e0b', '#6366f1', '#14b8a6',
];

const ASSET_TYPE_HINT: Record<string, string> = {
  BTC: 'Crypto', ETH: 'Crypto', SOL: 'Crypto', XRP: 'Crypto', DOGE: 'Crypto',
  BNB: 'Crypto', ADA: 'Crypto', AVAX: 'Crypto', MATIC: 'Crypto', LINK: 'Crypto',
  SPY: 'ETF', QQQ: 'ETF', IWM: 'ETF', GLD: 'ETF', TLT: 'ETF',
  NVDA: 'Stock', TSLA: 'Stock', AAPL: 'Stock', MSFT: 'Stock', AMZN: 'Stock',
};

export default function AssetMentions({ topTickers }: Props) {
  if (!topTickers || topTickers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        No asset mentions yet. Fetch and analyze tweets to see which assets are discussed most.
      </div>
    );
  }

  const max = topTickers[0]?.count || 1;

  return (
    <div className="space-y-2.5">
      {topTickers.map((t, i) => {
        const pct = (t.count / max) * 100;
        const color = COLORS[i % COLORS.length];
        const hint = ASSET_TYPE_HINT[t.ticker.toUpperCase()];
        return (
          <div key={t.ticker} className="flex items-center gap-3">
            {/* Rank */}
            <span className="w-5 shrink-0 text-right text-xs font-medium text-slate-600">
              {i + 1}
            </span>

            {/* Ticker label */}
            <div className="w-20 shrink-0">
              <span className="font-mono text-sm font-semibold text-slate-200">
                ${t.ticker}
              </span>
              {hint && (
                <span className="ml-1.5 text-xs text-slate-600">{hint}</span>
              )}
            </div>

            {/* Bar */}
            <div className="flex-1 rounded-full bg-slate-800">
              <div
                className="flex h-6 items-center justify-end rounded-full px-2 transition-all duration-500"
                style={{ width: `${Math.max(pct, 4)}%`, background: color + '33', border: `1px solid ${color}55` }}
              >
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: color }}
                />
              </div>
            </div>

            {/* Count */}
            <span className="w-16 shrink-0 text-right text-sm font-semibold text-slate-300">
              {t.count}
              <span className="ml-1 text-xs font-normal text-slate-600">
                {t.count === 1 ? 'mention' : 'mentions'}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
