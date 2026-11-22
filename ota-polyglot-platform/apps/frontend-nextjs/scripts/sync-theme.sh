#!/usr/bin/env bash
#
# Re-pull the AeroTake visual theme from the sibling `aerotake_front` repo
# (https://github.com/<org>/aerotake_front, checked out next to this repo's
# GitHub root by default) into this app.
#
# Usage:
#   scripts/sync-theme.sh                      # uses ../../../../aerotake_front
#   AEROTAKE_FRONT_DIR=/path/to/aerotake_front scripts/sync-theme.sh
#
# What this DOES sync (theme-owned, safe to overwrite wholesale):
#   public/, components/, data/, app/globals.css, postcss.config.mjs,
#   app/favicon.ico, and the route dirs: app/dashboard, app/signup,
#   app/forgot-password, app/set-password, app/verify, app/welcome,
#   app/welcome-back, app/thank-you.
#
# What this NEVER touches (this app's real functionality — hand-merge if
# aerotake_front's own layout.tsx / page.tsx shape has changed):
#   middleware.ts, lib/, app/api/, app/global-error.tsx, app/layout.tsx,
#   app/page.tsx, package.json, next.config.mjs, tsconfig.json.
#
# app/layout.tsx and app/page.tsx are MERGED by hand, not copied verbatim,
# because they also carry tenant-resolution / BFF concerns that don't exist
# in aerotake_front. After running this script, diff aerotake_front's
# src/app/layout.tsx and src/app/page.tsx against what's here and fold in
# any theme changes manually.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="${AEROTAKE_FRONT_DIR:-$APP_DIR/../../../../aerotake_front}"

if [ ! -d "$SRC/src/app" ]; then
  echo "error: aerotake_front not found at '$SRC' (set AEROTAKE_FRONT_DIR to override)" >&2
  exit 1
fi

echo "Syncing theme from $SRC"

rsync -a --delete "$SRC/public/" "$APP_DIR/public/"
rsync -a --delete "$SRC/src/components/" "$APP_DIR/components/"
rsync -a --delete "$SRC/src/data/" "$APP_DIR/data/"
cp "$SRC/src/app/globals.css" "$APP_DIR/app/globals.css"
cp "$SRC/postcss.config.mjs" "$APP_DIR/postcss.config.mjs"
cp "$SRC/src/app/favicon.ico" "$APP_DIR/app/favicon.ico"

for d in dashboard signup forgot-password set-password verify welcome welcome-back thank-you; do
  rsync -a --delete "$SRC/src/app/$d/" "$APP_DIR/app/$d/"
done

echo "Done. Now:"
echo "  1. Review 'git status' / 'git diff' in this app for what changed."
echo "  2. Diff $SRC/src/app/layout.tsx and src/app/page.tsx against"
echo "     app/layout.tsx and app/page.tsx here, and fold in theme changes by hand"
echo "     (these two are merged with tenant/BFF logic, not synced verbatim)."
echo "  3. Check package.json here still has every dependency the theme uses"
echo "     (e.g. new icon sets, fonts) and run npm install if not."
echo "  4. aerotake_front pins a newer Next.js major than this app. Run"
echo "     'npm run build' and fix any next/image or next/* API drift"
echo "     (e.g. Image's 'preload' prop -> 'priority' on this app's Next version)."
