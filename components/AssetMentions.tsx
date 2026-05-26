'use client';

interface Props {
  topTickers: Array<{ ticker: string; count: number }>;
}

const COLORS = [
  { bar: '#6366f1', bg: '#eef2ff' },
  { bar: '#0ea5e9', bg: '#f0f9ff' },
  { bar: '#10b981', bg: '#f0fdf4' },
  { bar: '#f59e0b', bg: '#fffbeb' },
  { bar: '#ec4899', bg: '#fdf2f8' },
  { bar: '#8b5cf6', bg: '#f5f3ff' },
  { bar: '#14b8a6', bg: '#f0fdfa' },
  { bar: '#f97316', bg: '#fff7ed' },
  { bar: '#06b6d4', bg: '#ecfeff' },
  { bar: '#84cc16', bg: '#f7fee7' },
];

const ASSET_HINT: Record<string, string> = {
  BTC: 'Crypto', ETH: 'Crypto', SOL: 'Crypto', XRP: 'Crypto', DOGE: 'Crypto',
  SPY: 'ETF',   QQQ: 'ETF',   IWM: 'ETF',   GLD: 'ETF',   TLT: 'ETF',
  NVDA: 'Stock', TSLA: 'Stock', AAPL: 'Stock', MSFT: 'Stock', AMZN: 'Stock',
};

export default function AssetMentions({ topTickers }: Props) {
  if (!topTickers || topTickers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-400">
        No asset mentions yet.
      </div>
    );
  }

  const max = topTickers[0]?.count || 1;

  return (
    <div className="space-y-2">
      {topTickers.map((t, i) => {
        const pct = (t.count / max) * 100;
        const c = COLORS[i % COLORS.length];
        const hint = ASSET_HINT[t.ticker.toUpperCase()];
        return (
          <div key={t.ticker} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-right text-[11px] font-medium text-slate-400 tabular-nums">
              {i + 1}
            </span>

            <div className="w-24 shrink-0 flex items-center gap-1.5">
              <span className="font-mono text-sm font-semibold text-slate-800">${t.ticker}</span>
              {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
            </div>

            <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-6">
              <div
                className="h-6 rounded-full flex items-center px-2 transition-all duration-500"
                style={{
                  width: `${Math.max(pct, 5)}%`,
                  backgroundColor: c.bg,
                  borderRight: `2px solid ${c.bar}40`,
                }}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.bar }} />
              </div>
            </div>

            <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-700 tabular-nums">
              {t.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
