'use client';

import { useState } from 'react';
import { StoredTweet, TickerMention, TradeSignal } from '@/lib/types';
import { getDomainConfig } from '@/lib/domainConfig';
import SentimentBadge from './SentimentBadge';
import { formatDistanceToNow } from 'date-fns';
import { Heart, Repeat2, MessageCircle, Eye, TrendingUp, ShieldAlert, ExternalLink, ImageIcon, Zap, Loader2 } from 'lucide-react';

interface Props { tweet: StoredTweet; onAnalyzed?: () => void }

function DomainBadge({ domain }: { domain: string }) {
  const cfg = getDomainConfig(domain);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <span className="text-[10px] leading-none">{cfg.icon}</span>
      {domain}
    </span>
  );
}

function TickerChip({ ticker }: { ticker: TickerMention }) {
  const colors: Record<string, string> = {
    crypto:    'bg-orange-500/10 text-orange-300 border-orange-500/25',
    stock:     'bg-blue-500/10 text-blue-300 border-blue-500/25',
    forex:     'bg-purple-500/10 text-purple-300 border-purple-500/25',
    commodity: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25',
    index:     'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    unknown:   'bg-slate-500/10 text-slate-400 border-slate-500/25',
  };
  const dirIcon = ticker.direction === 'long' ? '↑' : ticker.direction === 'short' ? '↓' : '';
  const dirColor = ticker.direction === 'long' ? 'text-emerald-400' : ticker.direction === 'short' ? 'text-red-400' : '';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs font-mono font-semibold ${colors[ticker.asset_type] || colors.unknown}`}>
      {dirIcon && <span className={`text-[10px] ${dirColor}`}>{dirIcon}</span>}
      ${ticker.ticker}
    </span>
  );
}

function SignalPill({ signal }: { signal: TradeSignal }) {
  const typeStyle: Record<string, string> = {
    entry:     'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    exit:      'bg-red-500/10 text-red-300 border-red-500/25',
    target:    'bg-blue-500/10 text-blue-300 border-blue-500/25',
    stop_loss: 'bg-red-500/15 text-red-400 border-red-500/30',
    alert:     'bg-amber-500/10 text-amber-300 border-amber-500/25',
    analysis:  'bg-slate-500/10 text-slate-400 border-slate-500/25',
  };
  const parts = [
    signal.type.replace('_', ' ').toUpperCase(),
    signal.asset,
    signal.price ? `@ $${signal.price.toLocaleString()}` : null,
    signal.target ? `→ $${signal.target.toLocaleString()}` : null,
    signal.stop_loss ? `SL $${signal.stop_loss.toLocaleString()}` : null,
    signal.leverage ?? null,
  ].filter(Boolean);

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-2.5 py-1.5 text-xs ${typeStyle[signal.type] || typeStyle.analysis}`}>
      {parts.map((p, i) => (
        <span key={i} className={i === 0 ? 'font-semibold tracking-wide' : 'opacity-80'}>{p}</span>
      ))}
      <span className={`ml-auto pl-2 text-[10px] font-medium opacity-60 ${signal.confidence === 'high' ? 'text-emerald-400' : signal.confidence === 'low' ? 'text-red-400' : 'text-amber-400'}`}>
        {signal.confidence} conf.
      </span>
    </div>
  );
}

const RISK_STYLE = {
  high:   'bg-red-500/10 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  low:    'bg-green-500/10 text-green-400 border-green-500/25',
  none:   '',
};

export default function TweetCard({ tweet, onAnalyzed }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const a = tweet.analysis;
  const tweetUrl = `https://x.com/aleabitoreddit/status/${tweet.id}`;

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
    <article className="group relative flex flex-col gap-3 rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4 shadow-lg backdrop-blur transition-all duration-200 hover:border-slate-600/60 hover:bg-slate-900/80 hover:shadow-slate-900/50">

      {/* Glow accent based on sentiment */}
      {a && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl ${
          a.sentiment === 'bullish' ? 'bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent' :
          a.sentiment === 'bearish' ? 'bg-gradient-to-r from-transparent via-red-500/40 to-transparent' :
          a.sentiment === 'mixed'   ? 'bg-gradient-to-r from-transparent via-amber-500/30 to-transparent' :
          'bg-gradient-to-r from-transparent via-slate-500/20 to-transparent'
        }`} />
      )}

      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow">
            S
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-200">@aleabitoreddit</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <time className="text-xs text-slate-500">
              {formatDistanceToNow(new Date(tweet.created_at), { addSuffix: true })}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tweet.media_urls && tweet.media_urls.length > 0 && (
            <span className="flex items-center gap-1 rounded-md border border-slate-700/50 bg-slate-800/60 px-1.5 py-0.5 text-xs text-slate-500">
              <ImageIcon className="h-3 w-3" />{tweet.media_urls.length}
            </span>
          )}
          {a?.risk_level && a.risk_level !== 'none' && (
            <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${RISK_STYLE[a.risk_level]}`}>
              <ShieldAlert className="h-3 w-3" />
              {a.risk_level}
            </span>
          )}
          {a && <SentimentBadge sentiment={a.sentiment} score={a.sentiment_score} />}
        </div>
      </div>

      {/* ── Domain labels ── */}
      {a?.domains && a.domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.domains.map((d) => <DomainBadge key={d} domain={d} />)}
        </div>
      )}

      {/* ── Tweet text ── */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
        {tweet.text}
      </p>

      {/* ── Media images ── */}
      {tweet.media_urls && tweet.media_urls.length > 0 && (
        <div className={`grid gap-2 ${tweet.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {tweet.media_urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/img relative block overflow-hidden rounded-xl border border-slate-700/40 bg-slate-950/60"
            >
              <div className={tweet.media_urls!.length === 1 ? 'aspect-video' : 'aspect-[4/3]'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Tweet media ${i + 1}`}
                  className="h-full w-full object-contain transition-transform duration-300 group-hover/img:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="absolute inset-0 bg-black/0 transition-all duration-200 group-hover/img:bg-black/30 rounded-xl" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/img:opacity-100">
                <span className="rounded-full border border-white/20 bg-black/60 p-2 backdrop-blur-sm">
                  <ExternalLink className="h-4 w-4 text-white" />
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
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <TrendingUp className="h-3 w-3" /> Signals
          </div>
          <div className="space-y-1">
            {a.signals.map((s, i) => <SignalPill key={i} signal={s} />)}
          </div>
        </div>
      )}

      {/* ── AI Summary ── */}
      {a?.summary && (
        <p className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-3 py-2 text-xs leading-relaxed text-slate-400 italic">
          {a.summary}
        </p>
      )}

      {/* ── Themes ── */}
      {a?.key_themes && a.key_themes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.key_themes.map((theme, i) => (
            <span key={i} className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500">
              {theme}
            </span>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1 hover:text-rose-400 transition-colors">
            <Heart className="h-3 w-3" />{tweet.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 hover:text-green-400 transition-colors">
            <Repeat2 className="h-3 w-3" />{tweet.retweet_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />{tweet.reply_count.toLocaleString()}
          </span>
          {tweet.impression_count > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />{(tweet.impression_count / 1000).toFixed(1)}k
            </span>
          )}
        </div>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-slate-600 transition-colors hover:text-slate-300"
        >
          <ExternalLink className="h-3 w-3" /> X
        </a>
      </div>

      {!a && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700/50 py-1.5 text-xs text-slate-600 transition-colors hover:border-indigo-500/40 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</>
            : <><Zap className="h-3 w-3" /> Analyze this tweet</>}
        </button>
      )}
    </article>
  );
}
