'use client';

import { useState } from 'react';
import { StoredTweet, TickerMention, TradeSignal } from '@/lib/types';
import { getDomainConfig } from '@/lib/domainConfig';
import SentimentBadge from './SentimentBadge';
import { formatDistanceToNow } from 'date-fns';
import {
  Heart, Repeat2, MessageCircle, TrendingUp, ShieldAlert,
  ExternalLink, ImageIcon, Zap, Loader2,
} from 'lucide-react';

interface Props { tweet: StoredTweet; onAnalyzed?: () => void }

function DomainBadge({ domain }: { domain: string }) {
  const cfg = getDomainConfig(domain);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
      <span className="text-[9px]">{cfg.icon}</span>
      {domain}
    </span>
  );
}

function TickerChip({ ticker }: { ticker: TickerMention }) {
  const styles: Record<string, string> = {
    crypto:    'text-orange-700 bg-orange-50   border-orange-200',
    stock:     'text-sky-700    bg-sky-50      border-sky-200',
    forex:     'text-purple-700 bg-purple-50   border-purple-200',
    commodity: 'text-amber-700  bg-amber-50    border-amber-200',
    index:     'text-cyan-700   bg-cyan-50     border-cyan-200',
    unknown:   'text-slate-600  bg-slate-100   border-slate-200',
  };
  const dirColor = ticker.direction === 'long' ? 'text-emerald-600' : ticker.direction === 'short' ? 'text-red-600' : 'text-slate-400';
  const dirIcon  = ticker.direction === 'long' ? '↑' : ticker.direction === 'short' ? '↓' : '·';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${styles[ticker.asset_type] ?? styles.unknown}`}>
      <span className={`text-[10px] ${dirColor}`}>{dirIcon}</span>
      ${ticker.ticker}
    </span>
  );
}

function SignalPill({ signal }: { signal: TradeSignal }) {
  const styles: Record<string, { row: string; label: string }> = {
    entry:     { row: 'border-emerald-200 bg-emerald-50', label: 'text-emerald-700' },
    exit:      { row: 'border-red-200     bg-red-50',     label: 'text-red-700'     },
    target:    { row: 'border-sky-200     bg-sky-50',     label: 'text-sky-700'     },
    stop_loss: { row: 'border-red-200     bg-red-50',     label: 'text-red-700'     },
    alert:     { row: 'border-amber-200   bg-amber-50',   label: 'text-amber-700'   },
    analysis:  { row: 'border-slate-200   bg-slate-50',   label: 'text-slate-600'   },
  };
  const s = styles[signal.type] ?? styles.analysis;
  const parts = [
    signal.asset,
    signal.price     ? `@ $${signal.price.toLocaleString()}`      : null,
    signal.target    ? `→ $${signal.target.toLocaleString()}`     : null,
    signal.stop_loss ? `SL $${signal.stop_loss.toLocaleString()}` : null,
    signal.leverage  ?? null,
  ].filter(Boolean);

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-xs ${s.row}`}>
      <span className={`font-semibold uppercase tracking-wider text-[10px] ${s.label}`}>
        {signal.type.replace('_', ' ')}
      </span>
      {parts.map((p, i) => (
        <span key={i} className="text-slate-500">{p}</span>
      ))}
      <span className={`ml-auto text-[10px] tabular-nums ${
        signal.confidence === 'high' ? 'text-emerald-600' :
        signal.confidence === 'low'  ? 'text-red-600'     : 'text-amber-600'
      }`}>
        {signal.confidence}
      </span>
    </div>
  );
}

const SENTIMENT_BORDER: Record<string, string> = {
  bullish: 'border-l-emerald-400',
  bearish: 'border-l-red-400',
  mixed:   'border-l-amber-400',
  neutral: 'border-l-slate-300',
};

const RISK_BADGE: Record<string, string> = {
  high:   'text-red-700   bg-red-50   border-red-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  low:    'text-green-700 bg-green-50 border-green-200',
};

export default function TweetCard({ tweet, onAnalyzed }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const a = tweet.analysis;
  const tweetUrl = `https://x.com/aleabitoreddit/status/${tweet.id}`;
  const accent = a ? (SENTIMENT_BORDER[a.sentiment] ?? SENTIMENT_BORDER.neutral) : 'border-l-slate-200';

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_id: tweet.id }),
      });
      onAnalyzed?.();
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <article className={`group relative flex flex-col gap-3.5 rounded-xl border border-slate-200/80 border-l-2 bg-white p-5 shadow-sm transition-all duration-150 hover:shadow-md hover:border-slate-300/60 ${accent}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
            S
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-slate-700">@aleabitoreddit</span>
            <time className="text-[11px] text-slate-400 shrink-0">
              {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
            </time>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {tweet.media_urls && tweet.media_urls.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <ImageIcon className="h-3 w-3" />{tweet.media_urls.length}
            </span>
          )}
          {a?.risk_level && a.risk_level !== 'none' && (
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${RISK_BADGE[a.risk_level]}`}>
              <ShieldAlert className="h-2.5 w-2.5" />{a.risk_level}
            </span>
          )}
          {a && <SentimentBadge sentiment={a.sentiment} score={a.sentiment_score} />}
        </div>
      </div>

      {/* ── Domain labels ── */}
      {a?.domains && a.domains.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.domains.map((d) => <DomainBadge key={d} domain={d} />)}
        </div>
      )}

      {/* ── Tweet text ── */}
      <p className="whitespace-pre-wrap text-[14px] leading-[1.72] text-slate-700">
        {tweet.text}
      </p>

      {/* ── Media ──
          Single image: natural height so charts display fully, no letterboxing.
          Multiple images: uniform 4:3 grid with object-cover for clean layout. */}
      {tweet.media_urls && tweet.media_urls.length > 0 && (
        tweet.media_urls.length === 1 ? (
          <a
            href={tweet.media_urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="group/img relative block overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tweet.media_urls[0]}
              alt="media"
              className="w-full h-auto max-h-80 object-contain transition-transform duration-300 group-hover/img:scale-[1.01]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/8 rounded-xl" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/img:opacity-100">
              <span className="rounded-full bg-white/90 p-2 shadow-md">
                <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
              </span>
            </div>
          </a>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tweet.media_urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/img relative block aspect-[4/3] overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`media ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.04]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/10 rounded-xl" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/img:opacity-100">
                  <span className="rounded-full bg-white/90 p-2 shadow-md">
                    <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        )
      )}

      {/* ── Tickers ── */}
      {a?.tickers && a.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.tickers.map((t, i) => <TickerChip key={i} ticker={t} />)}
        </div>
      )}

      {/* ── Signals ── */}
      {a?.signals && a.signals.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            <TrendingUp className="h-3 w-3" /> Signals
          </p>
          <div className="space-y-1">
            {a.signals.map((s, i) => <SignalPill key={i} signal={s} />)}
          </div>
        </div>
      )}

      {/* ── AI Summary ── */}
      {a?.summary && (
        <p className="rounded-lg border-l-2 border-indigo-300 bg-indigo-50/60 pl-3 pr-2 py-2 text-[12px] leading-relaxed text-slate-500 italic">
          {a.summary}
        </p>
      )}

      {/* ── Key themes ── */}
      {a?.key_themes && a.key_themes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.key_themes.map((theme, i) => (
            <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
              {theme}
            </span>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-3.5 text-[11px] text-slate-400">
          <span className="flex items-center gap-1 transition-colors hover:text-rose-500 cursor-default">
            <Heart className="h-3 w-3" />{tweet.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 transition-colors hover:text-emerald-600 cursor-default">
            <Repeat2 className="h-3 w-3" />{tweet.retweet_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />{tweet.reply_count.toLocaleString()}
          </span>
        </div>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-700"
        >
          <ExternalLink className="h-3 w-3" /> View on X
        </a>
      </div>

      {/* ── Pending analyze CTA ── */}
      {!a && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {analyzing
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</>
            : <><Zap className="h-3 w-3" /> Analyze this tweet</>}
        </button>
      )}
    </article>
  );
}
