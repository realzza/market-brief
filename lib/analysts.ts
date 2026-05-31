// Analyst registry — the single source of truth for which X/Twitter accounts
// this dashboard tracks. The app used to be hard-wired to one handle
// (@aleabitoreddit, "Serenity"); it now tracks a configurable list so adding
// a new voice is a one-line change here (or a deploy-time env override).
//
// This module is import-safe from both server and client code: it reads only
// plain env vars and synchronous config, no Node-only APIs. The server page
// resolves the list once and passes it to the client via props, so an env
// override is honored on the client too (client-side process.env is empty).

import type { Analyst } from './types';

// The original single-analyst handle. Used as the attribution for tweet rows
// that predate the `author` column (see the migration in lib/db.ts), and as
// the default when no other configuration is present.
export const LEGACY_HANDLE = (process.env.TWITTER_USERNAME || 'aleabitoreddit').toLowerCase();

// Known analysts with curated display metadata. Handles configured purely via
// the TRACKED_HANDLES env var that aren't found here fall back to a synthesized
// entry (name = "@handle"), so the env path still works for arbitrary accounts.
const REGISTRY: Analyst[] = [
  {
    id: 'serenity',
    handle: 'aleabitoreddit',
    name: 'Serenity',
    blurb: 'Markets & trade signals',
  },
  {
    id: 'trump',
    handle: 'realDonaldTrump',
    name: 'Donald J. Trump',
    blurb: 'Policy & macro',
    // Trump mainly posts on Truth Social; those posts merge into this same
    // analyst alongside his X feed (see lib/truthsocial.ts + the scheduler).
    truthSocial: 'realDonaldTrump',
  },
];

// Canonical author key for a handle — lowercased, no leading @. This is what
// gets written to / queried from the `tweets.author` column.
export function authorKey(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

function findKnown(handle: string): Analyst | undefined {
  const key = authorKey(handle);
  return REGISTRY.find((a) => authorKey(a.handle) === key);
}

// Resolve the configured analyst list. Precedence:
//   1. TRACKED_HANDLES (comma-separated) — explicit deploy-time override.
//   2. The curated REGISTRY default (Serenity + Trump).
export function getAnalysts(): Analyst[] {
  const raw = process.env.TRACKED_HANDLES?.trim();
  if (!raw) return REGISTRY;

  const handles = raw
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);
  if (handles.length === 0) return REGISTRY;

  return handles.map(
    (h) => findKnown(h) ?? { id: authorKey(h), handle: h, name: `@${h}` },
  );
}

// Look up an analyst by its stored author key (lowercased handle). Returns
// undefined for tweets whose author isn't in the active config — callers
// fall back to rendering the bare handle.
export function getAnalystByKey(key: string): Analyst | undefined {
  const k = authorKey(key);
  return getAnalysts().find((a) => authorKey(a.handle) === k);
}
