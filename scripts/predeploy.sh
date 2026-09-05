#!/usr/bin/env bash
# Every gate, in order, stopping at the first failure. Run this before deploying.
#
# THE ORDER IS LOAD BEARING. The extractor writes tools/kit-sentences.json and
# everything after it reads that file, so a stale extract cannot license a page.
# The link check runs late because it is the only step that needs the network.
#
# PROVED ABLE TO FAIL, 2026-09-05, six times, one at a time and each restored
# to a byte identical file before the next:
#   * a wrong digest in public/duckbench-bundle.zip.sha256: check_site_claims
#     exited 1, "does not match its sha256".
#   * a wrong byte size. Done in a throwaway copy of the whole repo with the zip
#     truncated by one byte and its sidecar refreshed, so the real bundle was
#     never written to: check_site_claims exited 1, "is 11666885 bytes, not
#     11666886; the page's 11.7 MB was measured against the old file".
#   * an em dash planted in one paragraph of public/index.html:
#     check_site_claims exited 1, "public/index.html contains an em dash".
#   * one digit changed inside the quoted stairs bar sentence:
#     check_site_sentences exited 1, "not found verbatim on the page: stairs_bar".
#   * the page put into the shipped state with no receipt:
#     check_evallog_claims exited 1, "run scripts/record_evallog_shipped.sh".
#   * a receipt written while the page was in the not-shipped state:
#     check_evallog_claims exited 1, "an orphan receipt licenses nothing".
#   * a sixth step added to the reproduce list while the standfirst still said
#     five: check_site_claims exited 1, "the reproduce section has 6 steps and
#     calls itself five".
# A gate nobody has watched fail is not a gate.
#
# Usage: bash scripts/predeploy.sh [DUCK_STUDIO]

set -euo pipefail
cd "$(dirname "$0")/.."

DUCK_STUDIO="${1:-${DUCK_STUDIO:-$HOME/projects/duck-studio}}"

step() { printf '\n== %s\n' "$1"; }

step "1/6 extract the pinned StudioKit values"
python3 scripts/extract_kit_sentences.py "$DUCK_STUDIO"

step "2/6 every pinned sentence is on the page"
bash scripts/check_site_sentences.sh

step "3/6 dashes, third parties, the bundle, the shared tokens"
bash scripts/check_site_claims.sh

step "4/6 the Evaluations copy matches what a tester can open"
bash scripts/check_evallog_claims.sh

step "5/6 every link resolves"
bash scripts/check_links.sh

step "6/6 both pages are well formed"
if command -v xmllint >/dev/null 2>&1; then
  xmllint --html --noout public/index.html public/privacy/index.html
  echo "check_wellformed: xmllint is installed and it is quiet"
fi
python3 scripts/check_wellformed.py

printf '\npredeploy: all six gates passed. Deploy with\n'
printf '  npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main\n'
