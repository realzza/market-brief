'use client';

import { useEffect, useState } from 'react';
import { domainColor } from '@/lib/domainConfig';

interface Ticker { ticker: string; count: number; asset_type: string }

interface Props {
  topTickers: Ticker[];
  topDomains: Array<{ domain: string; count: number }>;
  onTicker: (ticker: string) => void;
}

export default function AssetMentions({ topTickers, topDomains, onTicker }: Props) {
  const [exchangeMap, setExchangeMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!topTickers.length) return;
    const query = topTickers.map((t) => `${t.ticker}:${t.asset_type}`).join(',');
    fetch(`/api/tickers-info?tickers=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then(setExchangeMap)
      .catch(() => {});
  }, [topTickers]);

  const maxT = topTickers[0]?.count || 1;
  const maxD = topDomains[0]?.count || 1;

  return (
    <div className="panel-grid">
        {/* Most-mentioned assets */}
        <section>
          <div className="panel-head">
            <h3 className="panel-title">Most-mentioned assets</h3>
            <span className="panel-sub">From raw tweet text</span>
          </div>
          {topTickers.length === 0 ? (
            <div className="empty">
              <div className="title">No data yet</div>
              <div className="desc">Fetch tweets to see asset mentions.</div>
            </div>
          ) : (
            <table className="assets-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th className="bar-cell">Mentions</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {topTickers.map((t, i) => (
                  <tr key={t.ticker} onClick={() => onTicker(t.ticker)}>
                    <td className="rank num">{String(i + 1).padStart(2, '0')}</td>
                    <td className="symbol">${t.ticker}</td>
                    <td className="typ">{exchangeMap[t.ticker] || t.asset_type}</td>
                    <td className="bar-cell">
                      <div className="bar">
                        <i style={{ width: `${(t.count / maxT) * 100}%` }} />
                      </div>
                    </td>
                    <td className="count num">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Active sectors */}
        <section>
          <div className="panel-head">
            <h3 className="panel-title">Active sectors</h3>
            <span className="panel-sub">Domains mentioned in analysis</span>
          </div>
          {topDomains.length === 0 ? (
            <div className="empty">
              <div className="title">No sectors yet</div>
              <div className="desc">Analyze tweets to see domain breakdown.</div>
            </div>
          ) : (
            <div className="domain-list">
              {topDomains.map((d, i) => (
                <div
                  key={d.domain}
                  className="domain-row"
                  style={{ color: domainColor(d.domain) }}
                >
                  <span className="rank num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="name">
                    <span className="dot" style={{ background: domainColor(d.domain) }} />
                    <span style={{ color: 'var(--ink)' }}>{d.domain}</span>
                  </span>
                  <span className="bar">
                    <i style={{ width: `${(d.count / maxD) * 100}%` }} />
                  </span>
                  <span className="count num">{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
    </div>
  );
}
