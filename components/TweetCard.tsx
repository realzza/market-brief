'use client';

import { useState } from 'react';
import { StoredTweet, TickerMention, TradeSignal } from '@/lib/types';
import { domainColor } from '@/lib/domainConfig';
import { fmtCompact, fmtDate, fmtPrice } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import TickerModal from './TickerModal';

interface Props {
  tweet: StoredTweet;
  serial: number;
  onAnalyzed?: () => void;
}

// ─── Icon set ────────────────────────────────────────────────────────────────
function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const props = {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'zap':      return <svg {...props}><path d="M9 1L2 9h5l-1 6 7-8h-5l1-6z"/></svg>;
    case 'heart':    return <svg {...props}><path d="M8 13s-5-3.2-5-7a2.8 2.8 0 0 1 5-1.8A2.8 2.8 0 0 1 13 6c0 3.8-5 7-5 7z"/></svg>;
    case 'repeat':   return <svg {...props}><path d="M3 7V5h8M13 5l-2-2M13 9v2H5M3 11l2 2"/></svg>;
    case 'reply':    return <svg {...props}><path d="M14 12c0-3-2-5-5-5H3M3 7l3-3M3 7l3 3"/></svg>;
    case 'external': return <svg {...props}><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L8 8"/></svg>;
    default: return null;
  }
}

// ─── Ticker-highlighted tweet text ───────────────────────────────────────────
const TICKER_SPLIT = /(\$[A-Z]{1,6}(?:[-.][A-Z]{1,4})?)/g;
const TICKER_TEST  = /^\$[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/;

function TweetText({ text, onTicker }: { text: string; onTicker: (t: string) => void }) {
  const parts = text.split(TICKER_SPLIT);
  return (
    <p className="article-text">
      {parts.map((part, i) =>
        TICKER_TEST.test(part) ? (
          <button key={i} className="ticker" onClick={() => onTicker(part.slice(1))}>
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

// ─── Signal row ──────────────────────────────────────────────────────────────
function SignalRow({ signal }: { signal: TradeSignal }) {
  return (
    <div className={`signal-row is-${signal.type}`}>
      <span className="label">{signal.type.replace('_', ' ')}</span>
      <span className="data">
        ${signal.asset}
        {signal.price != null && <> @ ${fmtPrice(signal.price)}</>}
        {signal.target != null && <> <span className="arrow">→</span> ${fmtPrice(signal.target)}</>}
        {signal.stop_loss != null && <> · SL ${fmtPrice(signal.stop_loss)}</>}
        {signal.leverage && <> · {signal.leverage}</>}
        {signal.timeframe && <> · {signal.timeframe}</>}
      </span>
      <span className="conf">{signal.confidence}</span>
    </div>
  );
}

// ─── Sentiment labels ─────────────────────────────────────────────────────────
const SENTIMENT_LABEL: Record<string, string> = {
  bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral', mixed: 'Mixed',
};
const SENTIMENT_DOT: Record<string, string> = {
  bullish: 'dot-bull', bearish: 'dot-bear', neutral: 'dot-neutral', mixed: 'dot-mixed',
};
const SENTIMENT_TEXT: Record<string, string> = {
  bullish: 'text-bull', bearish: 'text-bear', neutral: 'text-neutral', mixed: 'text-mixed',
};

// ─── Main card ───────────────────────────────────────────────────────────────
export default function TweetCard({ tweet, serial, onAnalyzed }: Props) {
  const [busy, setBusy] = useState(false);
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const a = tweet.analysis;
  const tweetUrl = `https://x.com/aleabitoreddit/status/${tweet.id}`;

  async function handleAnalyze() {
    setBusy(true);
    try {
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_id: tweet.id }),
      });
      onAnalyzed?.();
    } finally {
      setBusy(false);
    }
  }

  const mediaUrls: string[] = tweet.media_urls ?? [];

  return (
    <>
      <article className="article">
        {/* Side rail */}
        <div className="article-rail">
          <span className="date">
            {fmtDate(tweet.created_at)}
            <br />
            <span className="ago">
              {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
            </span>
          </span>

          {a && (
            <span className={`sentiment-tag ${SENTIMENT_TEXT[a.sentiment] ?? 'text-ink-3'}`}>
              <span className={`dot ${SENTIMENT_DOT[a.sentiment] ?? 'dot-neutral'}`} />
              {SENTIMENT_LABEL[a.sentiment] ?? a.sentiment}
            </span>
          )}

          {a?.is_trade_call && (
            <span className="sentiment-tag text-signal">
              <span className="dot dot-signal" />
              Signal
            </span>
          )}

          <span className="serial">№ {String(serial).padStart(3, '0')}</span>
        </div>

        {/* Body */}
        <div className="article-body">
          {a?.domains && a.domains.length > 0 && (
            <div className="article-tags">
              {a.domains.map((d) => (
                <span key={d} className="article-tag" style={{ color: domainColor(d) }}>
                  <span className="dot" style={{ background: domainColor(d) }} />
                  {d}
                </span>
              ))}
            </div>
          )}

          <TweetText text={tweet.text} onTicker={setActiveTicker} />

          {/* Media */}
          {mediaUrls.length > 0 && (
            <div className={`article-media ${mediaUrls.length > 1 ? 'is-multi' : ''}`}>
              {mediaUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="media-slot"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`media ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}

          {/* Analyst note */}
          {a?.summary && <div className="article-summary">{a.summary}</div>}

          {/* Signals */}
          {a?.signals && a.signals.length > 0 && (
            <div className="signals-block">
              <div className="eyebrow">Signals</div>
              {a.signals.map((s, i) => <SignalRow key={i} signal={s} />)}
            </div>
          )}

          {/* Tickers list */}
          {a?.tickers && a.tickers.length > 0 && (
            <div className="tickers-row">
              {a.tickers.map((t: TickerMention, i) => {
                const arrow = t.direction === 'long' ? '↑' : t.direction === 'short' ? '↓' : '•';
                const arrowCls = t.direction === 'long' ? 'long' : t.direction === 'short' ? 'short' : 'flat';
                return (
                  <button key={i} className="ticker-chip" onClick={() => setActiveTicker(t.ticker)}>
                    <span className={`arrow ${arrowCls}`}>{arrow}</span>
                    <span className="symbol">${t.ticker}</span>
                    <span className="typ">{t.asset_type}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Key themes */}
          {a?.key_themes && a.key_themes.length > 0 && (
            <div className="themes-row">
              {a.key_themes.map((th, i) => (
                <span key={i}>
                  {i > 0 && <span className="sep">·</span>}
                  {th}
                </span>
              ))}
            </div>
          )}

          {/* Analyze CTA (unanalyzed only) */}
          {!a && (
            <button className="analyze-cta" onClick={handleAnalyze} disabled={busy}>
              {busy
                ? <><span className="spinner-inline" />Analyzing…</>
                : <><Icon name="zap" size={12} />Analyze this tweet</>
              }
            </button>
          )}

          {/* Footer */}
          <div className="article-footer">
            <span className="metric"><Icon name="heart" size={11} />{fmtCompact(tweet.like_count)}</span>
            <span className="metric"><Icon name="repeat" size={11} />{fmtCompact(tweet.retweet_count)}</span>
            <span className="metric"><Icon name="reply" size={11} />{fmtCompact(tweet.reply_count)}</span>
            <span className="metric num">{fmtCompact(tweet.impression_count)} views</span>

            {a && (
              <button
                className="reanalyze"
                onClick={handleAnalyze}
                disabled={busy}
                title="Re-run AI analysis"
              >
                {busy
                  ? <><span className="spinner-inline" />Analyzing…</>
                  : <><Icon name="zap" size={11} />Re-analyze</>
                }
              </button>
            )}

            <a className="external" href={tweetUrl} target="_blank" rel="noopener noreferrer">
              View on X<Icon name="external" size={11} />
            </a>
          </div>
        </div>
      </article>

      {activeTicker && (
        <TickerModal ticker={activeTicker} onClose={() => setActiveTicker(null)} />
      )}
    </>
  );
}
