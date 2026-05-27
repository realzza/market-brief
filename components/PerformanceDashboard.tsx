'use client';

import { fmtDate, fmtPrice, fmtPct } from '@/lib/format';

interface PerformanceEntry {
  id: number;
  tweet_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  signal_date: string;
  outcome?: 'win' | 'loss' | 'breakeven' | 'pending';
  actual_return_pct?: number;
  notes?: string;
}

interface Props { entries: PerformanceEntry[] }

export default function PerformanceDashboard({ entries }: Props) {
  const wins      = entries.filter((e) => e.outcome === 'win').length;
  const losses    = entries.filter((e) => e.outcome === 'loss').length;
  const breakeven = entries.filter((e) => e.outcome === 'breakeven').length;
  const pending   = entries.filter((e) => e.outcome === 'pending').length;
  const closed    = wins + losses + breakeven;
  const winRate   = closed > 0 ? Math.round((wins / closed) * 100) : 0;
  const returns   = entries.filter((e) => e.actual_return_pct != null).map((e) => e.actual_return_pct!);
  const avgRet    = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  const cells = [
    { label: 'Total signals', v: entries.length,       sub: `${pending} open · ${closed} closed`,  bar: 100,                              trend: 'accent'                       },
    { label: 'Win rate',      v: winRate + '%',         sub: `${wins} wins · ${losses} losses`,     bar: winRate,                          trend: 'bull'                         },
    { label: 'Avg return',    v: fmtPct(avgRet, 2),    sub: 'Across closed trades',                bar: Math.min(100, Math.abs(avgRet)*8), trend: avgRet >= 0 ? 'bull' : 'bear' },
    { label: 'Open',          v: pending,               sub: 'Pending outcome',                     bar: entries.length ? (pending/entries.length)*100 : 0, trend: 'neutral'     },
  ];

  const outcomeColor = (o?: string) => {
    switch (o) {
      case 'win':       return 'var(--bull)';
      case 'loss':      return 'var(--bear)';
      case 'breakeven': return 'var(--ink-3)';
      default:          return 'var(--mixed)';
    }
  };

  return (
    <div>
      <div className="panel-head">
        <h3 className="panel-title">Signal performance</h3>
        <span className="panel-sub">Tracked trade calls · realised P&amp;L</span>
      </div>

      <div className="perf-summary stats">
        {cells.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label"><span className="eyebrow">{c.label}</span></div>
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

      {entries.length === 0 ? (
        <div className="empty">
          <div className="title">No signals tracked</div>
          <div className="desc">Signals from analyzed trade-call tweets will appear here.</div>
        </div>
      ) : (
        <table className="perf-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Dir</th>
              <th>Date</th>
              <th className="num-cell">Entry</th>
              <th className="num-cell">Target</th>
              <th className="num-cell">Stop</th>
              <th>Outcome</th>
              <th className="num-cell">Return</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="asset">${e.asset}</td>
                <td>
                  <span className={`dir ${e.direction}`}>{e.direction}</span>
                </td>
                <td className="date-cell">{fmtDate(e.signal_date)}</td>
                <td className="num-cell">{e.entry_price ? '$' + fmtPrice(e.entry_price) : '—'}</td>
                <td className="num-cell">{e.target_price ? '$' + fmtPrice(e.target_price) : '—'}</td>
                <td className="num-cell">{e.stop_loss_price ? '$' + fmtPrice(e.stop_loss_price) : '—'}</td>
                <td>
                  <span className={`outcome ${e.outcome ?? 'pending'}`}>
                    <span className="dot" style={{ background: outcomeColor(e.outcome) }} />
                    {e.outcome ?? 'pending'}
                  </span>
                </td>
                <td className={`num-cell ret ${e.actual_return_pct == null ? '' : e.actual_return_pct >= 0 ? 'pos' : 'neg'}`}>
                  {e.actual_return_pct != null ? fmtPct(e.actual_return_pct, 1) : '—'}
                </td>
                <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{e.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
