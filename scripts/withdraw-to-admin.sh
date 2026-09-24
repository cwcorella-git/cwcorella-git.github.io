#!/usr/bin/env bash
# withdraw-to-admin.sh — move published library bodies to the admin-only surface.
#
# Interactive wrapper around scripts/encrypt-doc.mjs. Shows a dry run, asks for
# confirmation, then prompts for the content key and pipes it on stdin.
#
# The key is read from /dev/tty with echo off and piped, never passed as an
# argument: a key in argv lands in shell history, in `ps` output, and in any
# transcript of the session that ran it. Do not "simplify" this into
# `encrypt-doc.mjs --key ...`.
#
#   ./scripts/withdraw-to-admin.sh                  # the default set
#   ./scripts/withdraw-to-admin.sh 65-anarchism-…   # or explicit doc names
#
# Runnable from any directory: the repo is resolved from this script's path.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# The six bodies the 2026-09-24 provenance audit found already published with a
# commercial publisher or a piracy host named in their own frontmatter.
DEFAULTS=(
	65-anarchism-in-the-united-states
	73-anarchist-education
	258-freedom
	489-post-industrial-and-digital-society
	676-the-iliad-or-the-poem-of-force
	742-the-psychological-structure-of-fascism
)

if [ "$#" -gt 0 ]; then DOCS=("$@"); else DOCS=("${DEFAULTS[@]}"); fi

command -v node >/dev/null || { echo "node not found on PATH" >&2; exit 1; }
[ -t 0 ] || { echo "this script is interactive; run it from a terminal" >&2; exit 1; }

echo "repo: $REPO"
echo "withdrawing ${#DOCS[@]} document(s) from the public surface to admin-only:"
echo
node scripts/encrypt-doc.mjs --dry-run "${DOCS[@]}"
echo
echo "This encrypts each body to static/docs/private/<name>.enc, DELETES the"
echo "plaintext in static/docs/public/, and sets doc.visibility='admin' in"
echo "books.json. The texts stay in your reading list and stay readable with"
echo "your admin key. Nothing is removed from library.db or bodies/."
echo
read -r -p "proceed? [y/N] " reply </dev/tty
case "$reply" in
	y|Y|yes|YES) ;;
	*) echo "aborted; nothing changed."; exit 0 ;;
esac

# -s: no echo. Read and use in one pipeline so the key is never written to disk
# and never survives this process.
printf 'content key: ' >/dev/tty
read -rs KEY </dev/tty
printf '\n' >/dev/tty
[ -n "$KEY" ] || { echo "empty key; aborted." >&2; exit 1; }

printf '%s' "$KEY" | node scripts/encrypt-doc.mjs --confirm "${DOCS[@]}"
status=$?
unset KEY

echo
if [ "$status" -eq 0 ]; then
	echo "done. Review and commit:"
	echo "  git -C \"$REPO\" status --short"
	echo "  git -C \"$REPO\" add -A static/docs src/lib/books.json"
	echo "  git -C \"$REPO\" commit -m 'chore(library): withdraw six commercially-sourced bodies to admin-only'"
	echo "  git -C \"$REPO\" push origin main"
	echo
	echo "Not live until pushed — GitHub Pages serves the pushed tree."
else
	echo "encrypt-doc.mjs exited $status — books.json may be unchanged; check status before committing." >&2
fi
exit "$status"
