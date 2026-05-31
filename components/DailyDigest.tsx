'use client';

import Link from 'next/link';
import { Digest, DashboardStats, Analyst } from '@/lib/types';
import { authorKey } from '@/lib/analysts';
import { fmtDate, fmtTime, fmtSigned, sentimentLabel, isValidTicker } from '@/lib/format';

const SENTIMENT_DOT: Record<string, string> = {
  bullish: 'dot-bull', bearish: 'dot-bear', neutral: 'dot-neutral', mixed: 'dot-mixed',
};

// "Serenity" → "S"; "Donald J. Trump" → "DT" (first + last word initials).
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

interface Props {
  digest: Digest;
  stats: DashboardStats;
  analysts: Analyst[];
  // post_id → author key fallback for digests predating the stored item.author.
  authorByPost: Record<string, string>;
  onTicker: (t: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

// The batched "morning brief" hero. Replaces the single-post Today's Brief:
// one Claude request summarized every post in the window into an overall
// headline + a ranked list, each item linking to that post's page on our site.
export default function DailyDigest({ digest, stats, analysts, authorByPost, onTicker, onRegenerate, regenerating }: Props) {
  const analystByAuthor = new Map(analysts.map((a) => [authorKey(a), a]));
  const score = stats.avg_sentiment_score ?? 0;
  const lbl = sentimentLabel(score);
  const markerPct = Math.min(98, Math.max(2, ((score + 1) / 2) * 100));
  const analyzed = stats.analyzed_tweets || 1;
  const bullPct = Math.round((stats.bullish_count / analyzed) * 100);
  const bearPct = Math.round((stats.bearish_count / analyzed) * 100);

  return (
    <section className="brief">
      <div className="container">
        <div className="brief-grid">

          {/* Left — the digest */}
          <div className="brief-feature">
            <div className="brief-eyebrow">
              <span className="eyebrow" style={{ color: 'var(--accent)' }}>The Morning Wire</span>
              <span className="eyebrow text-ink-4">·</span>
              <span className="eyebrow text-ink-4">
                {fmtDate(digest.generated_at)} · {fmtTime(digest.generated_at)} · {digest.post_count} posts
              </span>
              <button
                type="button"
                className="digest-regen"
                onClick={onRegenerate}
                disabled={regenerating}
                title="Summarize posts tracked since the last brief (no cost when there are none)"
              >
                {regenerating ? <span className="spinner-inline" /> : null}
                {regenerating ? 'Compiling…' : 'Refresh'}
              </button>
            </div>

            <h2 className="brief-headline">{digest.headline}</h2>
            {digest.summary && <p className="brief-dek">{digest.summary}</p>}

            {digest.items.length > 0 ? (
              <ol className="digest-list">
                {digest.items.map((it) => {
                  const tickers = it.tickers.filter(isValidTicker);
                  const authKey = it.author || authorByPost[it.post_id] || '';
                  const analyst = authKey ? analystByAuthor.get(authKey) : undefined;
                  const authorName = analyst?.name ?? (authKey ? `@${authKey}` : '');
                  return (
                    <li key={it.post_id} className="digest-item">
                      <span
                        className={`dot ${SENTIMENT_DOT[it.sentiment] ?? 'dot-neutral'} digest-dot`}
                        title={it.sentiment}
                      />
                      <div className="digest-item-body">
                        {authorName && (
                          <span className="digest-byline">
                            <span className="digest-mono">{initials(authorName)}</span>
                            <span className="digest-byline-name">{authorName}</span>
                          </span>
                        )}
                        <Link href={`/post/${it.post_id}`} className="digest-item-headline">
                          {it.headline}
                        </Link>
                        {it.importance === 'high' && (
                          <div className="digest-flag-row">
                            <span className="digest-flag">Top story</span>
                          </div>
                        )}
                        {it.blurb && <p className="digest-item-blurb">{it.blurb}</p>}
                        {tickers.length > 0 && (
                          <div className="digest-tickers">
                            {tickers.map((t) => (
                              <button key={t} className="digest-ticker" onClick={() => onTicker(t)}>
                                ${t}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="brief-dek text-ink-3" style={{ fontStyle: 'italic' }}>
                Nothing market-moving in this window.
              </p>
            )}
          </div>

          {/* Right — market mood readout (carried over from Today's Brief) */}
          <div className="mood">
            <div className="mood-block">
              <div className="eyebrow label">Market mood · 30-day avg</div>
              <div className="mood-score">{fmtSigned(score, 2)}</div>
              <div className="text-ink-3" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 8 }}>
                {lbl} · {stats.analyzed_tweets} of {stats.total_tweets} posts analyzed
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
