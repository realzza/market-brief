'use client';

import { StoredTweet, DashboardStats } from '@/lib/types';
import { fmtDate, fmtTime, fmtSigned, sentimentLabel, headlineFromTweet, filterValidTickers } from '@/lib/format';
import { renderRichSummary } from '@/lib/richText';
import type { FeaturedReason } from '@/lib/featured';

const SENTIMENT_TEXT: Record<string, string> = {
  bullish: 'text-bull', bearish: 'text-bear', neutral: 'text-neutral', mixed: 'text-mixed',
};
const SENTIMENT_DOT: Record<string, string> = {
  bullish: 'dot-bull', bearish: 'dot-bear', neutral: 'dot-neutral', mixed: 'dot-mixed',
};
const SENTIMENT_LABEL: Record<string, string> = {
  bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral', mixed: 'Mixed',
};

interface Props {
  brief: StoredTweet | null;
  stats: DashboardStats;
  onTicker: (t: string) => void;
  // Why this tweet was selected for the hero. Drives the eyebrow text so the
  // reader isn't misled into thinking a 4-day-old commentary tweet is
  // "Today's Brief". Defaults to 'signal' for backwards-compat with any
  // older caller that hasn't been updated.
  reason?: FeaturedReason;
}

export default function TodaysBrief({ brief, stats, onTicker, reason = 'signal' }: Props) {
  if (!brief?.analysis) return null;
  const eyebrowText = reason === 'signal' ? "Today's Brief" : 'Recent analysis';
  const a = brief.analysis;
  const score = stats.avg_sentiment_score ?? 0;
  const lbl = sentimentLabel(score);
  const markerPct = Math.min(98, Math.max(2, ((score + 1) / 2) * 100));
  const primarySignal = a.signals?.[0];
  // First *real* ticker — same filter as the per-tweet card, so the brief's
  // "Primary call" row doesn't read "Long $UNKNOWN" when Claude returned a
  // placeholder for a non-tickerable mention.
  const primaryTicker = filterValidTickers(a.tickers)[0];
  const analyzed = stats.analyzed_tweets || 1;
  const bullPct = Math.round((stats.bullish_count / analyzed) * 100);
  const bearPct = Math.round((stats.bearish_count / analyzed) * 100);

  return (
    <section className="brief">
      <div className="container">
        <div className="brief-grid">

          {/* Left — feature */}
          <div className="brief-feature">
            <div className="brief-eyebrow">
              <span className="eyebrow" style={{ color: 'var(--accent)' }}>{eyebrowText}</span>
              <span className="eyebrow text-ink-4">·</span>
              <span className="eyebrow text-ink-4">
                {fmtDate(brief.created_at)} · {fmtTime(brief.created_at)}
              </span>
            </div>

            <h2 className="brief-headline">{headlineFromTweet(brief)}</h2>
            <p className="brief-dek">{renderRichSummary(a.summary, onTicker)}</p>

            <div className="brief-signal-row">
              {primaryTicker && (
                <div className="field">
                  <span className="eyebrow">Primary call</span>
                  <span className="v">
                    <button
                      onClick={() => onTicker(primaryTicker.ticker)}
                      style={{ background: 'transparent', border: 0, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      {primaryTicker.direction === 'long' ? 'Long ' : primaryTicker.direction === 'short' ? 'Short ' : ''}
                      ${primaryTicker.ticker}
                    </button>
                  </span>
                </div>
              )}
              {primarySignal?.target != null && (
                <div className="field">
                  <span className="eyebrow">Target</span>
                  <span className="v">${primarySignal.target.toLocaleString()}</span>
                </div>
              )}
              {primarySignal?.price != null && (
                <div className="field">
                  <span className="eyebrow">Entry</span>
                  <span className="v">${primarySignal.price.toLocaleString()}</span>
                </div>
              )}
              {primarySignal?.timeframe && (
                <div className="field">
                  <span className="eyebrow">Timeframe</span>
                  <span className="v">{primarySignal.timeframe}</span>
                </div>
              )}
              <div className="field">
                <span className="eyebrow">Sentiment</span>
                <span className="v">
                  <span
                    className={SENTIMENT_TEXT[a.sentiment]}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span className={`dot ${SENTIMENT_DOT[a.sentiment]}`} />
                    {SENTIMENT_LABEL[a.sentiment]}
                  </span>
                  <span className="text-ink-4" style={{ marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(a.sentiment_score, 2)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Right — mood readout */}
          <div className="mood">
            <div className="mood-block">
              <div className="eyebrow label">Market mood · 30-day avg</div>
              <div className="mood-score">
                {fmtSigned(score, 2)}
              </div>
              <div className="text-ink-3" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 8 }}>
                {lbl} · {stats.analyzed_tweets} of {stats.total_tweets} tweets analyzed
              </div>
              <div className="mood-gauge">
                <span className="marker" style={{ left: `${markerPct}%` }} />
                <span className="scale"><span>−1.0</span><span>0</span><span>+1.0</span></span>
              </div>
            </div>

            <div className="mood-mini-grid">
              <div className="mood-mini">
                <div className="v text-bull">
                  {bullPct}<span style={{ fontSize: 16, color: 'var(--ink-3)', marginLeft: 2 }}>%</span>
                </div>
                <div className="sub">Bullish · {stats.bullish_count}</div>
              </div>
              <div className="mood-mini">
                <div className="v text-bear">
                  {bearPct}<span style={{ fontSize: 16, color: 'var(--ink-3)', marginLeft: 2 }}>%</span>
                </div>
                <div className="sub">Bearish · {stats.bearish_count}</div>
              </div>
              <div className="mood-mini">
                <div className="v text-signal">{stats.trade_calls}</div>
                <div className="sub">Active signals</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
