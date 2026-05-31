// Analyst registry — the single source of truth for which voices this
// dashboard tracks and, per voice, which platforms. The app used to be
// hard-wired to one X handle (@aleabitoreddit, "Serenity"); it now tracks a
// configurable list, and each analyst declares explicitly which platforms it
// publishes on (see the `platforms` field on Analyst).
//
// Adding a platform to an analyst is a one-line change here: put the account
// handle under `platforms`. There is no implicit cross-platform tracking — an
// analyst with only `platforms.x` is X-only; Truth Social is fetched only when
// `platforms.truthsocial` is set.
//
// This module is import-safe from both server and client code: it reads only
// plain env vars and synchronous config, no Node-only APIs. The server page
// resolves the list once and passes it to the client via props, so an env
// override is honored on the client too (client-side process.env is empty).

import type { Analyst, Platform } from './types';

// LEGACY attribution handle — NOT a tracking selector. The TWITTER_USERNAME
// env var is read here and nowhere else: it backfills the `author` column on
// rows that predate the multi-analyst `author` column (see the migration in
// lib/db.ts). Changing it does not add or remove a tracked account; the roster
// is the REGISTRY below.
export const LEGACY_HANDLE = (process.env.TWITTER_USERNAME || 'aleabitoreddit').toLowerCase();

// ─── THE ROSTER ──────────────────────────────────────────────────────────────
// This is the single source of truth for who the dashboard tracks. To add a
// target, add an entry here; to track an existing target on another platform,
// add that platform's handle under `platforms`. Everything downstream — the
// scheduler's fetch loop, the source dropdown, the platform filter, the
// masthead byline, the per-card platform tag — derives from this array, so no
// other file needs touching.
//
// Each entry carries curated display metadata (name/blurb) plus the account
// handle on each tracked platform. (Handles supplied purely via the
// TRACKED_HANDLES env override that aren't found here fall back to a synthesized
// X-only entry named "@handle" — see getAnalysts below.)
const REGISTRY: Analyst[] = [
  {
    id: 'serenity',
    name: 'Serenity',
    blurb: 'Markets & trade signals',
    platforms: { x: 'aleabitoreddit' },
  },
  {
    id: 'trump',
    name: 'Donald J. Trump',
    blurb: 'Policy & macro',
    // Trump publishes on both — his Truth Social posts merge into this same
    // analyst alongside his X feed (see lib/truthsocial.ts + the scheduler).
    platforms: { x: 'realDonaldTrump', truthsocial: 'realDonaldTrump' },
  },
];

// Lowercase + strip a leading @ — normalizes a handle for comparison and for
// deriving the canonical author key.
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

// Canonical author key for an analyst — the value written to / queried from the
// `tweets.author` column. Kept stable across the explicit-platforms refactor
// (the X handle when present) so previously-stored rows stay attributed.
export function authorKey(analyst: Analyst): string {
  return normalizeHandle(analyst.platforms.x ?? analyst.platforms.truthsocial ?? analyst.id);
}

// The account handle for an analyst on a given platform, or undefined when we
// don't track that analyst there.
export function platformHandle(analyst: Analyst, platform: Platform): string | undefined {
  return platform === 'truthsocial' ? analyst.platforms.truthsocial : analyst.platforms.x;
}

function findKnown(handle: string): Analyst | undefined {
  const key = normalizeHandle(handle);
  return REGISTRY.find((a) => authorKey(a) === key);
}

// Resolve the configured analyst list. Precedence:
//   1. TRACKED_HANDLES (comma-separated) — explicit deploy-time override.
//   2. The curated REGISTRY default (Serenity + Trump).
// Env-added handles are X-only; to track Truth Social (or any extra platform)
// for an analyst, add it to the REGISTRY above — env entries fall back to a
// matching registry entry by handle, so its platforms are picked up too.
export function getAnalysts(): Analyst[] {
  const raw = process.env.TRACKED_HANDLES?.trim();
  if (!raw) return REGISTRY;

  const handles = raw
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);
  if (handles.length === 0) return REGISTRY;

  return handles.map(
    (h) => findKnown(h) ?? { id: normalizeHandle(h), name: `@${h}`, platforms: { x: h } },
  );
}

// Look up an analyst by its stored author key (lowercased handle). Returns
// undefined for tweets whose author isn't in the active config — callers
// fall back to rendering the bare handle.
export function getAnalystByKey(key: string): Analyst | undefined {
  const k = normalizeHandle(key);
  return getAnalysts().find((a) => authorKey(a) === k);
}

// Which platforms are tracked across the active roster. Drives the platform
// filter — only worth showing when more than one platform is in play.
export function trackedPlatforms(): Platform[] {
  const set = new Set<Platform>();
  for (const a of getAnalysts()) {
    if (a.platforms.x) set.add('x');
    if (a.platforms.truthsocial) set.add('truthsocial');
  }
  return [...set];
}
