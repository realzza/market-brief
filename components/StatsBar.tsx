'use client';

import { DashboardStats } from '@/lib/types';
import { fmtCompact } from '@/lib/format';

interface Props { stats: DashboardStats }

export default function StatsBar({ stats }: Props) {
  const analyzed = stats.analyzed_tweets || 0;
  const total    = stats.total_tweets || 0;
  const bullPct  = analyzed > 0 ? Math.round((stats.bullish_count / analyzed) * 100) : 0;
  const bearPct  = analyzed > 0 ? Math.round((stats.bearish_count / analyzed) * 100) : 0;
  const neutPct  = analyzed > 0 ? Math.round(((stats.neutral_count ?? 0) / analyzed) * 100) : 0;
  const sigPct   = analyzed > 0 ? Math.round((stats.trade_calls / analyzed) * 100) : 0;
  const covPct   = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  const winPct   = stats.win_rate != null ? Math.round(stats.win_rate * 100) : null;

  const cells = [
    { label: 'Coverage', v: fmtCompact(total),    sub: `${analyzed} analyzed · ${covPct}%`,  bar: covPct,      trend: 'accent'  },
    { label: 'Bullish',  v: bullPct + '%',         sub: `${stats.bullish_count} posts`,        bar: bullPct,     trend: 'bull'    },
    { label: 'Bearish',  v: bearPct + '%',         sub: `${stats.bearish_count} posts`,        bar: bearPct,     trend: 'bear'    },
    { label: 'Neutral',  v: neutPct + '%',         sub: `${stats.neutral_count ?? 0} posts`,   bar: neutPct,     trend: 'neutral' },
    { label: 'Signals',  v: stats.trade_calls,     sub: `${sigPct}% are calls`,               bar: sigPct,      trend: 'signal'  },
    { label: 'Win rate', v: winPct != null ? winPct + '%' : '—', sub: 'Tracked outcomes',     bar: winPct || 0, trend: 'bull'    },
  ];

  return (
    <div className="container">
      <div className="stats">
        {cells.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label">
              <span className="eyebrow">{c.label}</span>
            </div>
            <div>
              <div className="v num">{c.v}</div>
              <div className="sub">{c.sub}</div>
            </div>
            <div className={`trend ${c.trend}`}>
              <i style={{ width: `${Math.max(c.bar, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
