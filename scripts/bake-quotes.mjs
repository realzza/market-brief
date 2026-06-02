#!/usr/bin/env node
// Pre-render Yahoo quotes into the static export.
//
// A static site has no backend, so the TickerModal can't call /api/quote. This
// bakes one JSON file per clickable ticker into out/data/quotes/<TICKER>.json
// (the same payload lib/quote.mjs serves live), which the modal fetches in
// static mode. Quotes are therefore a snapshot — as fresh as the last build
// (≤ REFRESH_INTERVAL old).
//
// Run after `next build` (out/ must exist) by scripts/build-static.mjs. Set
// BAKE_QUOTES=0 to skip (the modal then shows an "unavailable" message).

import Database from 'better-sqlite3';
import { buildQuote } from '../lib/quote.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DB_PATH = join(ROOT, 'data', 'serenity.db');
const OUT_DIR = join(ROOT, 'out', 'data', 'quotes');
const CONCURRENCY = 5;

// Mirror lib/format.isValidTicker — only these render as clickable chips, so
// only these can open the modal.
const TICKER_RE = /^[A-Z]{1,6}(?:[-.][A-Z]{1,4})?$/;
// $-prefixed mentions in free text (mirrors lib/trending's extraction), which
// power the trending chips.
const TEXT_TICKER_RE = /\$([A-Z]{1,6}(?:[-][A-Z]{1,4})?)\b/g;

if (process.env.BAKE_QUOTES === '0') {
  console.log('▸ bake-quotes: BAKE_QUOTES=0, skipping');
  process.exit(0);
}
if (!existsSync(join(ROOT, 'out'))) {
  console.warn('▸ bake-quotes: out/ missing — run after next build. Skipping.');
  process.exit(0);
}
if (!existsSync(DB_PATH)) {
  console.warn('▸ bake-quotes: data/serenity.db not found — no tickers to bake. Skipping.');
  process.exit(0);
}

// ── Enumerate every clickable ticker ────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
const tickers = new Set();
const add = (s) => { if (typeof s === 'string') { const u = s.toUpperCase(); if (TICKER_RE.test(u)) tickers.add(u); } };

for (const r of db.prepare('SELECT tickers, signals FROM tweet_analysis').all()) {
  try { JSON.parse(r.tickers || '[]').forEach((t) => add(t?.ticker ?? t?.symbol ?? t)); } catch {}
  try { JSON.parse(r.signals || '[]').forEach((s) => add(s?.asset)); } catch {}
}
for (const r of db.prepare('SELECT text FROM tweets').all()) {
  for (const m of (r.text || '').matchAll(TEXT_TICKER_RE)) add(m[1]);
}
db.close();

const list = [...tickers].sort();
console.log(`▸ bake-quotes: ${list.length} clickable tickers → out/data/quotes/`);
if (list.length === 0) process.exit(0);

mkdirSync(OUT_DIR, { recursive: true });

// ── Fetch + write, bounded concurrency, graceful per-ticker failure ─────────
let ok = 0;
let failed = 0;
let idx = 0;

async function worker() {
  while (idx < list.length) {
    const ticker = list[idx++];
    try {
      const data = await buildQuote(ticker);
      writeFileSync(join(OUT_DIR, `${ticker}.json`), JSON.stringify(data));
      ok++;
    } catch (err) {
      // Write an error payload (not nothing) so the modal's fetch resolves to a
      // clean "unavailable" message instead of a noisy 404.
      const msg = err instanceof Error ? err.message : String(err);
      writeFileSync(join(OUT_DIR, `${ticker}.json`), JSON.stringify({ ticker, error: msg }));
      failed++;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
console.log(`▸ bake-quotes: done — ${ok} ok, ${failed} failed`);
