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
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
      <span className="text-[9px]">{cfg.icon}</span>
      {domain}
    </span>
  );
}

function TickerChip({ ticker }: { ticker: TickerMention }) {
  const colors: Record<string, string> = {
    crypto:    'text-orange-400 bg-orange-500/8',
    stock:     'text-sky-400    bg-sky-500/8',
    forex:     'text-purple-400 bg-purple-500/8',
    commodity: 'text-yellow-400 bg-yellow-500/8',
    index:     'text-cyan-400   bg-cyan-500/8',
    unknown:   'text-slate-400  bg-slate-500/8',
  };
  const dirColor = ticker.direction === 'long' ? 'text-emerald-400' : ticker.direction === 'short' ? 'text-red-400' : 'text-slate-600';
  const dirIcon  = ticker.direction === 'long' ? '↑' : ticker.direction === 'short' ? '↓' : '·';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${colors[ticker.asset_type] ?? colors.unknown}`}>
      <span className={`text-[10px] ${dirColor}`}>{dirIcon}</span>
      ${ticker.ticker}
    </span>
  );
}

function SignalPill({ signal }: { signal: TradeSignal }) {
  const styles: Record<string, { row: string; label: string }> = {
    entry:     { row: 'border-emerald-500/20 bg-emerald-500/5',  label: 'text-emerald-400' },
    exit:      { row: 'border-red-500/20     bg-red-500/5',      label: 'text-red-400'     },
    target:    { row: 'border-sky-500/20     bg-sky-500/5',      label: 'text-sky-400'     },
    stop_loss: { row: 'border-red-500/25     bg-red-500/8',      label: 'text-red-500'     },
    alert:     { row: 'border-amber-500/20   bg-amber-500/5',    label: 'text-amber-400'   },
    analysis:  { row: 'border-slate-700/50   bg-slate-800/40',   label: 'text-slate-400'   },
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
        <span key={i} className="text-slate-400">{p}</span>
      ))}
      <span className={`ml-auto text-[10px] tabular-nums opacity-50 ${
        signal.confidence === 'high' ? 'text-emerald-400' :
        signal.confidence === 'low'  ? 'text-red-400'     : 'text-amber-400'
      }`}>
        {signal.confidence}
      </span>
    </div>
  );
}

const SENTIMENT_ACCENT: Record<string, string> = {
  bullish: 'border-l-emerald-500/50',
  bearish: 'border-l-red-500/50',
  mixed:   'border-l-amber-500/40',
  neutral: 'border-l-slate-700/50',
};

const RISK_BADGE: Record<string, string> = {
  high:   'text-red-400   bg-red-500/8   border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/8 border-amber-500/20',
  low:    'text-green-400 bg-green-500/8 border-green-500/20',
};

export default function TweetCard({ tweet, onAnalyzed }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const a = tweet.analysis;
  const tweetUrl = `https://x.com/aleabitoreddit/status/${tweet.id}`;
  const accent = a ? (SENTIMENT_ACCENT[a.sentiment] ?? SENTIMENT_ACCENT.neutral) : 'border-l-slate-800';

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
    <article className={`group relative flex flex-col gap-3.5 rounded-xl border border-white/[0.05] border-l-2 bg-[#080e1a] p-5 transition-all duration-150 hover:border-white/[0.09] hover:bg-[#0a1120] ${accent}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
            S
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-slate-300">@aleabitoreddit</span>
            <time className="text-[11px] text-slate-600 shrink-0">
              {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
            </time>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {tweet.media_urls && tweet.media_urls.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <ImageIcon className="h-3 w-3" />{tweet.media_urls.length}
            </span>
          )}
          {a?.risk_level && a.risk_level !== 'none' && (
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${RISK_BADGE[a.risk_level]}`}>
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
      <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-slate-300">
        {tweet.text}
      </p>

      {/* ── Media ── */}
      {tweet.media_urls && tweet.media_urls.length > 0 && (
        <div className={`grid gap-1.5 ${tweet.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {tweet.media_urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/img relative block overflow-hidden rounded-lg bg-[#050a10]"
            >
              <div className={tweet.media_urls!.length === 1 ? 'aspect-video' : 'aspect-[4/3]'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`media ${i + 1}`}
                  className="h-full w-full object-contain transition-transform duration-300 group-hover/img:scale-[1.02]"
                  loading="lazy"
                />
              </div>
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/25 rounded-lg" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/img:opacity-100">
                <span className="rounded-full bg-black/60 p-2 backdrop-blur-sm">
                  <ExternalLink className="h-3.5 w-3.5 text-white" />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* ── Tickers ── */}
      {a?.tickers && a.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.tickers.map((t, i) => <TickerChip key={i} ticker={t} />)}
        </div>
      )}

      {/* ── Signals ── */}
      {a?.signals && a.signals.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            <TrendingUp className="h-3 w-3" /> Signals
          </p>
          <div className="space-y-1">
            {a.signals.map((s, i) => <SignalPill key={i} signal={s} />)}
          </div>
        </div>
      )}

      {/* ── AI Summary ── */}
      {a?.summary && (
        <p className="rounded-lg border-l-2 border-indigo-500/30 bg-indigo-500/[0.04] pl-3 pr-2 py-2 text-[12px] leading-relaxed text-slate-500 italic">
          {a.summary}
        </p>
      )}

      {/* ── Key themes ── */}
      {a?.key_themes && a.key_themes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.key_themes.map((theme, i) => (
            <span key={i} className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-600">
              {theme}
            </span>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
        <div className="flex items-center gap-3.5 text-[11px] text-slate-700">
          <span className="flex items-center gap-1 transition-colors hover:text-rose-400 cursor-default">
            <Heart className="h-3 w-3" />{tweet.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 transition-colors hover:text-emerald-400 cursor-default">
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
          className="flex items-center gap-1 text-[11px] text-slate-700 transition-colors hover:text-slate-300"
        >
          <ExternalLink className="h-3 w-3" /> View on X
        </a>
      </div>

      {/* ── Pending analyze CTA ── */}
      {!a && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="group/btn flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.06] py-2 text-xs text-slate-700 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {analyzing
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</>
            : <><Zap className="h-3 w-3" /> Analyze this tweet</>}
        </button>
      )}
    </article>
  );
}
