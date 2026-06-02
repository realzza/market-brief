#!/bin/sh
# Rebuild + redeploy the GitHub Pages snapshot from the SQLite DB.
#
# Runs wherever the populated data/serenity.db is reachable. In this project
# that's inside the `pages-refresh` Docker service, which mounts the shared
# serenity-data volume (the same live DB the app writes). Skips the rebuild
# when the DB hasn't changed since the last deploy, so an idle half-hour
# doesn't churn a pointless Pages build.
#
# Timers/containers run with a bare PATH and no shell profile, so we set PATH
# explicitly (covers the node image, plus Homebrew if run on a Mac) and resolve
# the repo from this script's own location rather than a hardcoded path.
set -eu

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO"

STAMP=".pages-last-deploy.hash"

# Portable sha256 — coreutils on Linux, Perl shim on macOS.
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }

# Hash the main DB + its write-ahead log together — any committed or pending
# write lands in one of the two, so a matching hash means "nothing new".
HASH="$( { cat data/serenity.db data/serenity.db-wal 2>/dev/null || true; } | sha256 | cut -d' ' -f1)"

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$HASH" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — no DB change since last deploy, skipping"
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — DB changed, deploying…"
npm run deploy:pages
echo "$HASH" > "$STAMP"
echo "$(date '+%Y-%m-%d %H:%M:%S') — deploy complete"
