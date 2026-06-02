#!/usr/bin/env node
// Build the static snapshot and publish it to the `gh-pages` branch.
//
// Why a fresh repo per deploy instead of a long-lived gh-pages worktree: the
// snapshot is a full rebuild every time (it bakes the current DB), so there's
// no useful history to keep. We init a throwaway repo inside out/, commit, and
// force-push it to the branch GitHub Pages serves from.
//
//   Env:
//     PAGES_REMOTE  remote name or URL to push to   (default: origin)
//     PAGES_BRANCH  branch GitHub Pages serves from  (default: gh-pages)
//     PAGES_BASE_PATH  URL sub-path / repo name       (default: /market-brief)
//
// ⚠ basePath MUST equal the repo name for a project site
//   (realzza.github.io/<repo>). Default targets a repo named `market-brief`.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'out');
const REMOTE = process.env.PAGES_REMOTE ?? 'origin';
const BRANCH = process.env.PAGES_BRANCH ?? 'gh-pages';
const basePath = process.env.PAGES_BASE_PATH ?? '/market-brief';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ \`${cmd} ${args.join(' ')}\` failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return r.status === 0 ? r.stdout.trim() : '';
}

// Resolve the remote to a URL so the throwaway repo (which has no remotes
// configured) can push to it.
const remoteUrl = /^https?:|^git@|\.git$/.test(REMOTE)
  ? REMOTE
  : capture('git', ['remote', 'get-url', REMOTE]);
if (!remoteUrl) {
  console.error(`\n✗ Couldn't resolve remote "${REMOTE}". Set PAGES_REMOTE to a URL or a configured remote.`);
  process.exit(1);
}

// A tokenized URL (https://x-access-token:TOKEN@github.com/...) is how the
// Docker sidecar passes credentials — strip the userinfo before logging so the
// token never lands in `docker compose logs`.
const safeUrl = remoteUrl.replace(/\/\/[^@/]+@/, '//');
const parts = safeUrl.replace(/\.git$/, '').split('/');
const repoName = parts.pop();
const owner = parts.pop() || '<owner>';
const pagesUrl = `https://${owner}.github.io/${repoName}/`;

if (basePath && `/${repoName}` !== basePath) {
  console.warn(`\n⚠  basePath "${basePath}" does not match repo "${repoName}".`);
  console.warn(`   GitHub Pages will serve ${pagesUrl}, so assets under`);
  console.warn(`   ${basePath}/ will 404. Rename the repo to match, or set PAGES_BASE_PATH=/${repoName}.\n`);
}

console.log(`\n▸ Building static snapshot…`);
run('node', ['scripts/build-static.mjs'], { env: { ...process.env, PAGES_BASE_PATH: basePath } });

if (!existsSync(OUT)) {
  console.error('\n✗ out/ missing after build — nothing to deploy.');
  process.exit(1);
}

console.log(`\n▸ Publishing out/ → ${safeUrl} (${BRANCH})\n`);
// Throwaway repo so we force-push a single flat commit and never bloat history.
rmSync(join(OUT, '.git'), { recursive: true, force: true });
const git = (...args) => run('git', args, { cwd: OUT });
git('init', '-q');
git('checkout', '-q', '-b', BRANCH);
git('add', '-A');
git('-c', 'user.name=pages-deploy', '-c', 'user.email=pages-deploy@local',
    'commit', '-q', '-m', `Deploy ${new Date().toISOString()}`);
git('push', '-f', remoteUrl, `${BRANCH}:${BRANCH}`);
rmSync(join(OUT, '.git'), { recursive: true, force: true });

console.log(`\n✓ Deployed. Once Pages is enabled on the ${BRANCH} branch:`);
console.log(`  ${pagesUrl}\n`);
