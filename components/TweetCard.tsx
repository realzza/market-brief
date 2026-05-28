'use client';

import { useState } from 'react';
import { StoredTweet, TickerMention, TradeSignal } from '@/lib/types';
import { domainColor } from '@/lib/domainConfig';
import { fmtCompact, fmtDate, fmtPrice } from '@/lib/format';
import { renderWithTickers, renderRichSummary } from '@/lib/richText';
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

// Tweets longer than this are collapsed by default with a "Show more" toggle
// to keep the feed scannable. Most regular tweets are <= 280 chars, so this
// only affects long-form (X Premium) posts.
const LONG_TWEET_CHARS = 480;
const COLLAPSED_CHARS  = 320;

// Cut at the last word boundary at or before `target`, never mid-word/ticker.
function truncateAtWord(text: string, target: number): string {
  if (text.length <= target) return text;
  const slice = text.slice(0, target);
  const lastSpace = slice.lastIndexOf(' ');
  // Only honor the boundary if it's reasonably close to target; otherwise
  // (e.g. one massive word) just cut hard so we don't over-shorten.
  const cut = lastSpace > target * 0.6 ? lastSpace : target;
  return slice.slice(0, cut).trimEnd() + '…';
}

function TweetText({ text, onTicker }: { text: string; onTicker: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TWEET_CHARS;
  const shown = !isLong || expanded ? text : truncateAtWord(text, COLLAPSED_CHARS);

  return (
    <p className="article-text">
      {renderWithTickers(shown, onTicker)}
      {isLong && (
        <>
          {' '}
          <button
            type="button"
            className="text-expand"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `Show more · ${text.length.toLocaleString()} chars`}
          </button>
        </>
      )}
    </p>
  );
}

// ─── Media gallery ───────────────────────────────────────────────────────────
// 1 → narrow solo · 2 → paired side-by-side · 3+ → horizontally scrollable
// filmstrip with edge-fade gradients so the user can see content extends.
function MediaGallery({ urls }: { urls: string[] }) {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) {
    return (
      <div className="article-media is-single">
        <a href={urls[0]} target="_blank" rel="noopener noreferrer" className="media-slot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[0]} alt="media" loading="lazy" />
        </a>
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className="article-media is-multi">
        {urls.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="media-slot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`media ${i + 1}`} loading="lazy" />
          </a>
        ))}
      </div>
    );
  }

  // 3+ — horizontal scroll strip. Native scroll (trackpad / shift-wheel /
  // touch swipe) handles paging. The edge gradients are pure CSS via the
  // .strip-track mask in globals.css.
  return (
    <div className="article-media is-strip">
      <div className="strip-track" role="region" aria-label={`${n} images, scroll horizontally`}>
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="media-slot strip-slot"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`media ${i + 1} of ${n}`} loading="lazy" />
          </a>
        ))}
      </div>
    </div>
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
  const [showPrompt, setShowPrompt] = useState(false);
  const [question, setQuestion] = useState('');
  const a = tweet.analysis;
  const tweetUrl = `https://x.com/aleabitoreddit/status/${tweet.id}`;

  async function runAnalysis() {
    setBusy(true);
    setShowPrompt(false);
    try {
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweet_id: tweet.id,
          user_question: question.trim() || undefined,
        }),
      });
      onAnalyzed?.();
      setQuestion('');
    } finally {
      setBusy(false);
    }
  }

  function cancelPrompt() {
    setShowPrompt(false);
    setQuestion('');
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
          <MediaGallery urls={mediaUrls} />

          {/* Image insights — only rendered when an analysis actually
              extracted something from the attached media. Sits between
              the media strip and the analyst note so the visual order
              reads: tweet → images → what's in the images → take.

              Claude's output for multi-image tweets is a single string
              like "Image 1: … Image 2: … Image 3: …". Split on the
              "Image N:" marker so each gets its own paragraph instead of
              wrapping into one dense block. Single-image tweets (or
              custom-question analyses that don't number) just render as
              one paragraph — the split returns a single chunk. */}
          {a?.image_insights && (
            <div className="article-image-insights">
              <span className="eyebrow">In the images</span>
              {a.image_insights
                .split(/(?=\bImage\s+\d+\s*:)/i)
                .map((chunk) => chunk.trim())
                .filter(Boolean)
                .map((chunk, i) => <p key={i}>{chunk}</p>)}
            </div>
          )}

          {/* Analyst note */}
          {a?.summary && (
            <div className="article-summary">
              {renderRichSummary(a.summary, setActiveTicker)}
            </div>
          )}

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

          {/* Analyze CTA (unanalyzed only, when form is closed) */}
          {!a && !showPrompt && !busy && (
            <button className="analyze-cta" onClick={() => setShowPrompt(true)}>
              <Icon name="zap" size={12} />Analyze this tweet
            </button>
          )}

          {/* Busy indicator (replaces button while a request is in flight) */}
          {busy && (
            <div className="analyze-cta is-busy">
              <span className="spinner-inline" />Analyzing…
            </div>
          )}

          {/* Custom-prompt form — opens when user clicks Analyze or Re-analyze */}
          {showPrompt && !busy && (
            <div className="analyze-form">
              <label className="eyebrow" htmlFor={`prompt-${tweet.id}`}>
                Ask a specific question (optional)
              </label>
              <textarea
                id={`prompt-${tweet.id}`}
                className="analyze-prompt"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAnalysis();
                  if (e.key === 'Escape') cancelPrompt();
                }}
                placeholder='e.g. "Research and figure out which ticker is being hinted at." Leave blank for the default extraction.'
                rows={3}
                autoFocus
              />
              <div className="analyze-actions">
                <button className="btn btn-primary" onClick={runAnalysis}>
                  <Icon name="zap" size={12} />
                  {question.trim() ? 'Answer + analyze' : 'Run default analysis'}
                </button>
                <button className="btn" onClick={cancelPrompt}>Cancel</button>
                <span className="analyze-hint">⌘+Enter to submit · Esc to cancel</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="article-footer">
            <span className="metric"><Icon name="heart" size={11} />{fmtCompact(tweet.like_count)}</span>
            <span className="metric"><Icon name="repeat" size={11} />{fmtCompact(tweet.retweet_count)}</span>
            <span className="metric"><Icon name="reply" size={11} />{fmtCompact(tweet.reply_count)}</span>
            <span className="metric num">{fmtCompact(tweet.impression_count)} views</span>

            {a && !showPrompt && !busy && (
              <button
                className="reanalyze"
                onClick={() => setShowPrompt(true)}
                title="Re-run AI analysis (optionally with a custom question)"
              >
                <Icon name="zap" size={11} />Re-analyze
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
