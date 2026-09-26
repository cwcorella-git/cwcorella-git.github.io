#!/usr/bin/env bash
# Browser check for the library's URLs (links, Back/Forward, bookmarks, new tabs)
# against a REAL library-api and the BUILT site served the way Cloudflare Pages
# serves it. Mocks resolve instantly and hid real bugs; this found one (a URL
# rewrite before the router mounted froze the page on "loading library…").
#
#   scripts/e2e/library-links.sh            # needs ../library-api (or LIBRARY_API_DIR)
set -euo pipefail
cd "$(dirname "$0")/../.."
API_DIR=${LIBRARY_API_DIR:-../library-api}
WORK=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT

(cd "$API_DIR" && python3 "$OLDPWD/scripts/e2e/seed-library.py" "$WORK/data")
(cd "$API_DIR" && LIBRARY_DB=$WORK/data/library.db LIBRARY_CURATION_DB=$WORK/data/curation.db \
  LIBRARY_EDITS_DB=$WORK/data/edits.db LIBRARY_BODIES=$WORK/data/bodies \
  LIBRARY_API_TOKEN=e2e-token LIBRARY_CORS_ORIGIN=http://127.0.0.1:5188 LIBRARY_API_PORT=8099 \
  exec python3 -m backend.api >"$WORK/api.log" 2>&1) &  # exec: the trap's kill reaches uvicorn
PUBLIC_LIBRARY_API_URL=http://127.0.0.1:8099 npm run build >"$WORK/build.log"
python3 scripts/e2e/serve-like-pages.py build 5188 &
for _ in $(seq 50); do curl -sf http://127.0.0.1:8099/health >/dev/null && break; sleep 0.2; done
npx playwright test -c playwright.links.config.ts
echo "note: build/ now points at the test API; run 'npm run build' before deploying by hand."
