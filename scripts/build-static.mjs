#!/usr/bin/env node
// Build the GitHub Pages static snapshot into `out/`.
//
// The full app is a Node server (sqlite, scheduler, live Claude/Yahoo calls).
// `output: 'export'` can only emit prebuilt HTML, so these must leave the tree
// for the export build — they're not statically exportable:
//   • app/api/*      — Request-based / POST route handlers
//   • instrumentation.ts — boots the background scheduler
//
// (/status stays in — it self-degrades to a build-time snapshot via IS_STATIC.)
//
// We physically stash them aside, run `next build`, then restore — so `main`
// source is untouched and the local/Docker build keeps every feature. The DB
// (data/serenity.db, gitignored) is read at build time to bake the data in, so
// this must run on a machine that has the populated DB (i.e. your local box).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, cpSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const STASH = join(ROOT, '.next-static-stash');

// [source, stash-name] — restored to `source` on exit.
const STASH_ITEMS = [
  [join(ROOT, 'app', 'api'), 'api'],
  [join(ROOT, 'instrumentation.ts'), 'instrumentation.ts'],
];

// rename is atomic and fast on the host, but throws EXDEV on Docker's overlayfs
// when the source directory lives in a lower image layer (a known overlayfs
// limitation). Fall back to copy+delete there.
function move(src, dest) {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

function restore() {
  if (!existsSync(STASH)) return;
  for (const [source, name] of STASH_ITEMS) {
    const stashed = join(STASH, name);
    if (existsSync(stashed)) {
      mkdirSync(dirname(source), { recursive: true });
      if (existsSync(source)) rmSync(source, { recursive: true, force: true });
      move(stashed, source);
    }
  }
  // Only remove the stash dir if it's now empty — never clobber unexpected files.
  if (readdirSync(STASH).length === 0) rmSync(STASH, { recursive: true, force: true });
}

function stash() {
  mkdirSync(STASH, { recursive: true });
  for (const [source, name] of STASH_ITEMS) {
    if (existsSync(source)) move(source, join(STASH, name));
  }
}

// A stash left over from a crashed run would silently drop api/status from the
// server build too — restore first, always.
restore();

if (!existsSync(join(ROOT, 'data', 'serenity.db'))) {
  console.warn('\n⚠  data/serenity.db not found — the export will have no posts/digest baked in.');
  console.warn('   Run this on the machine with your populated SQLite DB.\n');
}

// Restore on any exit path, including Ctrl-C / kill.
let restored = false;
const runRestore = () => { if (!restored) { restored = true; restore(); } };
process.on('exit', runRestore);
process.on('SIGINT', () => { runRestore(); process.exit(130); });
process.on('SIGTERM', () => { runRestore(); process.exit(143); });

let code = 1;
try {
  stash();

  const basePath = process.env.PAGES_BASE_PATH ?? '/market-brief';
  console.log(`\n▸ Static export — basePath="${basePath}" → out/\n`);

  const result = spawnSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    // NEXT_PUBLIC_BASE_PATH lets client code (TickerModal) build absolute URLs
    // to baked assets under the project sub-path — basePath isn't exposed to
    // raw fetch() the way it is to <Link>/next assets.
    env: { ...process.env, NEXT_PUBLIC_STATIC_EXPORT: '1', NEXT_PUBLIC_BASE_PATH: basePath },
    cwd: ROOT,
  });
  code = result.status ?? 1;

  if (code === 0) {
    // GitHub Pages runs Jekyll by default, which strips `_next/` (leading
    // underscore). `.nojekyll` disables that so our assets are served as-is.
    writeFileSync(join(ROOT, 'out', '.nojekyll'), '');
    console.log('\n✓ Static export ready in out/ (added .nojekyll)\n');

    // Bake Yahoo quotes for clickable tickers into out/data/quotes/ so the
    // TickerModal works offline. Honors BAKE_QUOTES=0. Non-fatal — a quote
    // bake failure shouldn't sink an otherwise-good export.
    const bake = spawnSync('node', ['scripts/bake-quotes.mjs'], { stdio: 'inherit', env: process.env, cwd: ROOT });
    if (bake.status !== 0) console.warn('\n⚠  bake-quotes exited non-zero — ticker previews may be missing.\n');
  }
} finally {
  runRestore();
}

process.exit(code);
