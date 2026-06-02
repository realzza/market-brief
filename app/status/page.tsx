// System status page — a glanceable health view of the sub-services and the
// background scheduler. Server-rendered from lib/health (same process as the
// scheduler). On the live server it's rendered per-request (always current);
// in the static export it's a build-time snapshot of the DB-derived facts
// (content counts, last digest, schedule) with the live sub-service checks
// omitted — there's no process to reach them from.

import Link from 'next/link';
import { connection } from 'next/server';
import { formatDistanceToNow } from 'date-fns';
import { getHealth, type ServiceHealth } from '@/lib/health';
import { IS_STATIC } from '@/lib/static';

function dotClass(s: ServiceHealth): string {
  if (!s.configured) return 'dot-neutral';
  return s.ok ? 'dot-bull' : 'dot-bear';
}

function rel(iso: string | null): string {
  if (!iso) return 'never';
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function Row({ label, value, sub, dot }: { label: string; value: string; sub?: string; dot?: string }) {
  return (
    <div className="status-row">
      <span className="status-label">
        {dot && <span className={`dot ${dot}`} />}
        {label}
      </span>
      <span className="status-value">
        {value}
        {sub && <span className="status-sub">{sub}</span>}
      </span>
    </div>
  );
}

export default async function StatusPage() {
  // Force per-request rendering on the live server so the page is always
  // current. Gated out of the static export (IS_STATIC inlines to a literal,
  // so the call is dead-code-eliminated), where this is a build-time snapshot.
  if (!IS_STATIC) await connection();

  const h = await getHealth();
  const allUp = h.services.every((s) => !s.configured || s.ok);

  return (
    <div className="container status-page">
      <div className="status-head">
        <Link href="/" className="eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ← Back to the brief
        </Link>
        <span className="eyebrow text-ink-4">The Market Brief</span>
      </div>

      <h1 className="status-title">System Status</h1>
      <p className="status-asof">
        {IS_STATIC ? (
          <>
            <span className="dot dot-neutral" />
            Static snapshot · as of {fmtTime(h.now)}
          </>
        ) : (
          <>
            <span className={`dot ${allUp ? 'dot-bull' : 'dot-bear'}`} />
            {allUp ? 'All systems operational' : 'Degraded — a service is unreachable'} · as of {fmtTime(h.now)}
          </>
        )}
      </p>

      {/* Live sub-service reachability can't be probed from a static snapshot —
          the section only renders on the live server. */}
      {!IS_STATIC && (
        <section className="status-section">
          <div className="eyebrow status-section-head">Sub-services</div>
          {h.services.map((s) => (
            <Row
              key={s.name}
              label={s.name}
              dot={dotClass(s)}
              value={!s.configured ? 'Not configured' : s.ok ? 'Up' : 'Down'}
              sub={s.detail}
            />
          ))}
        </section>
      )}

      <section className="status-section">
        <div className="eyebrow status-section-head">Scheduler</div>
        <Row label="Last post fetch" value={rel(h.scheduler.last_fetch_at)}
          sub={h.scheduler.last_fetch_at ? fmtTime(h.scheduler.last_fetch_at) : undefined} />
        <Row label="Next daily digest" value={rel(h.scheduler.next_digest_at)}
          sub={`${fmtTime(h.scheduler.next_digest_at)} · ${String(h.scheduler.digest_hour).padStart(2, '0')}:00 daily`} />
      </section>

      <section className="status-section">
        <div className="eyebrow status-section-head">Content</div>
        <Row label="Posts tracked" value={h.posts.total.toLocaleString()}
          sub={`${h.posts.analyzed.toLocaleString()} analyzed · ${h.posts.pending.toLocaleString()} unanalyzed`} />
        {h.digest ? (
          <Row
            label="Latest digest"
            value={rel(h.digest.generated_at)}
            sub={`${h.digest.post_count} posts → ${h.digest.items} highlights · ${h.digest.input_tokens ?? '—'} in / ${h.digest.output_tokens ?? '—'} out tokens`}
          />
        ) : (
          <Row label="Latest digest" value="None yet" sub="click Brief on the dashboard to compile one" />
        )}
      </section>

      <p className="status-foot">
        {IS_STATIC ? (
          <>Snapshot rebuilt on each publish · counts and digest reflect the last refresh</>
        ) : (
          <>Live JSON at <Link href="/api/health" className="status-link">/api/health</Link> · reload for the latest</>
        )}
      </p>
    </div>
  );
}
