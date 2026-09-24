#!/usr/bin/env bash
#
# publish-restricted.sh — the two operator-only steps of the restricted lane.
#
# Restricted is not the same as unavailable. Every library-api endpoint is
# bearer-auth'd, so a licence denial is a statement about REPUBLISHING, never
# about your own reading. These texts end up as /docs/private/*.enc: readable in
# the online reader once you authenticate, invisible and undecryptable to anyone
# else, and never present as plaintext on a public surface.
#
#   [1/2] encrypt six already-published bodies whose own frontmatter names a
#         commercial publisher or a piracy host — a withdrawal from public
#         plaintext to admin-encrypted.
#   [2/2] stage nine restricted §1f texts that were never public, straight to
#         .admin-stage/ and then to .enc. They skip the public lane entirely.
#
# The content key is prompted for once, with echo off, and piped to each node
# script on stdin. It is never an argument, never an environment variable, and
# never touches disk — argv is world-readable in `ps` and env is inherited by
# every child. Step 2's export needs no key at all; only the encrypt does.
#
#   ./bin/publish-restricted.sh --dry-run    # no key prompt, shows everything
#   ./bin/publish-restricted.sh              # dry run, then prompts to proceed
#
set -euo pipefail

# Runnable from anywhere: resolve the repo root from this script's own location.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

# The exporter reads library.db through node:sqlite, which is experimental and
# absent before Node 22. That is why this runs on the workstation, not the
# laptop: it is a missing built-in module, not a missing database.
if ! node -e 'import("node:sqlite")' 2>/dev/null; then
	echo "this Node ($(node -v)) has no node:sqlite — run this on the workstation." >&2
	exit 1
fi

DRY_ONLY=0
EXTRA=()
for a in "$@"; do
	case "$a" in
		--dry-run) DRY_ONLY=1 ;;
		*) EXTRA+=("$a") ;;
	esac
done

# The six already-public bodies to withdraw into .enc.
WITHDRAW=(
	65-anarchism-in-the-united-states
	73-anarchist-education
	258-freedom
	489-post-industrial-and-digital-society
	676-the-iliad-or-the-poem-of-force
	742-the-psychological-structure-of-fascism
)
# The nine restricted §1f book ids to stage, never having been public.
STAGE_IDS=22,64,548,684,708,778,842,891,212

echo "=== [1/2] withdraw ${#WITHDRAW[@]} published bodies to /docs/private/*.enc (dry run) ==="
node scripts/encrypt-doc.mjs --dry-run "${WITHDRAW[@]}"

echo
echo "=== [2/2] stage 9 restricted §1f texts (dry run) ==="
node scripts/export-library-docs.mjs --dry-run --admin "$STAGE_IDS" "${EXTRA[@]+"${EXTRA[@]}"}"

if [[ $DRY_ONLY -eq 1 ]]; then
	echo
	echo "DRY RUN ONLY — nothing was written. Re-run without --dry-run to apply."
	exit 0
fi

echo
read -r -p "Apply both steps? [y/N] " reply
[[ "$reply" == [yY] ]] || { echo "aborted; nothing written."; exit 0; }

# Read the key once, echo off, and keep it out of everything but this shell.
read -rs -p "admin content key: " KEY
echo
[[ -n "$KEY" ]] || { echo "empty key; aborted." >&2; exit 1; }

echo
echo "=== [1/2] encrypting ==="
printf '%s' "$KEY" | node scripts/encrypt-doc.mjs --confirm "${WITHDRAW[@]}"

echo
echo "=== [2/2] staging ==="
node scripts/export-library-docs.mjs --confirm --admin "$STAGE_IDS" "${EXTRA[@]+"${EXTRA[@]}"}"

# Stage 2 only writes plaintext into the gitignored .admin-stage/. It is not
# done until those are encrypted too, so do it here rather than leave plaintext
# restricted bodies sitting in the working tree.
mapfile -t STAGED < <(cd .admin-stage 2>/dev/null && ls -1 *.md 2>/dev/null | sed 's/\.md$//' || true)
if [[ ${#STAGED[@]} -gt 0 ]]; then
	echo
	echo "=== [2/2] encrypting ${#STAGED[@]} staged body/ies ==="
	printf '%s' "$KEY" | node scripts/encrypt-doc.mjs --confirm "${STAGED[@]}"
fi
unset KEY

echo
echo "Done. Review and commit:"
echo "  git -C '$ROOT' status --short static/docs books.json"
