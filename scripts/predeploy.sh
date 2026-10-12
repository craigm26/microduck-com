#!/usr/bin/env bash
# Every gate, in order, stopping at the first failure. Run this before deploying.
#
# THE ORDER IS LOAD BEARING. The extractor writes tools/kit-sentences.json and
# everything after it reads that file, so a stale extract cannot license a page.
# The link check runs late because it is the only step that needs the network.
#
# PROVED ABLE TO FAIL, 2026-09-05, sixteen times, one at a time and each
# restored to a byte identical file before the next. The first seven were run in
# this tree; the last nine in a throwaway copy of the whole repository, because
# they need a receipt and a shipped page and neither belongs in a commit:
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
#   * the microduck-com list item deleted from the links section, leaving the
#     page saying four repositories above three: check_site_claims exited 1,
#     "the links section lists 3 of our repositories". Before the slice was made
#     to stop at the footer, this same edit passed, because the footer's own
#     link to this repository supplied the fourth.
#   * the shipped paragraph's "That distinction / matters enough that it is
#     tested" pasted, with its line wrap intact, into the not-shipped page:
#     check_evallog_claims exited 1, "the page claims the parity gate is tested
#     while it is in the not-shipped state". Before the probe was flattened, the
#     wrapped form, which is the only form this repository authors, passed.
#   * "evaluating" put back into the head's meta description while the body was
#     in the not-shipped state: check_evallog_claims exited 1, "the head's
#     description promises evaluating while the page is in the not-shipped
#     state".
#   * the not-shipped wording left in the head while the page was flipped to
#     shipped: check_evallog_claims exited 1, "neither description meta mentions
#     evaluating, so the two states of the head are the same text".
#   * the privacy page's independence paragraph changed to say the opposite:
#     check_site_sentences exited 1, "public/privacy/index.html does not carry
#     independence verbatim". Before both pages were read, only the front page
#     was held to it.
#   * a receipt carrying "READY_FOR_TESTING", the state this repository used to
#     invent and then assert back to itself: check_evallog_claims exited 1,
#     "which is not one of IN_BETA_TESTING, READY_FOR_BETA_TESTING,
#     BETA_APPROVED, READY_FOR_BETA_SUBMISSION".
#   * that same receipt changed to BETA_APPROVED, which App Store Connect does
#     emit but which the line it stored did not say: check_evallog_claims exited
#     1, "the receipt says BETA_APPROVED and its stored App Store Connect line
#     does not contain it".
#   * a sixth reducer printed on the shipped page: check_site_sentences exited 1,
#     "the reducer list reads 'mean, median, max, min or mode' in
#     EvalEpochs.Reducer and not on the page".
#   * the schema version changed to 7 on the shipped page: check_site_sentences
#     exited 1, "EvalLog.schemaVersion is 1 and the page does not say 'Version
#     1'". Before shipped_numbers was read by anything, both of these passed.
# PROVED ABLE TO FAIL, 2026-10-12, check_cards fourteen times, in a throwaway
# copy of the repository, one defect at a time and each file restored before the
# next; the copy passed again at the end:
#   * one card renamed by hand inside the print page's markers: "card
#     'walk_forward' is printed 'Walk forwards'; the deck says 'Walk forward'".
#   * Kick, right given the left bumper in the gallery: "says it runs on
#     ['Studio', 'Pad: LB']; the pad table says ['Studio', 'Pad: RB']".
#   * one cell of Roll's code flipped: "draws a code that is not tag36h11
#     number 63".
#   * Kick, right renamed without its comma in the deck file: "is printed 'Kick
#     right'; Studio calls it 'Kick, right'".
#   * the bumpers swapped in the extract, as a StudioKit change would: "the HERO
#     region is not what build_cards.py draws today".
#   * the code drawn at 30cqi: "the code's black square prints 15.2 mm across;
#     the format page says a little over a centimetre".
#   * a 15 mm print margin: "Letter holds 2 rows, not three".
#   * one box on the print page unticked: "look_right has no ticked box".
#   * Fast dropped from the starter deck: "26 printed cards then 9 blank ones:
#     the last sheet is not all blank cards".
#   * a kick that takes a Look, in the extract: "the What goes under lesson no
#     longer matches Node.heads".
#   * a head beat added to RobotPlan, in the extract: "the format page says no
#     head pose goes to a robot".
#   * a bench that runs a trick anywhere, in the extract: "the format page says
#     the bench runs one trick, last".
#   * a receipt for build 40: "build 40 (6bcf5d6) does not have what the cards
#     page names".
#   * the Say it placeholder reworded on the page: "does not carry Studio's
#     say_it_placeholder word for word".
# A gate nobody has watched fail is not a gate.
#
# Usage: bash scripts/predeploy.sh [DUCK_STUDIO]

set -euo pipefail
cd "$(dirname "$0")/.."

DUCK_STUDIO="${1:-${DUCK_STUDIO:-$HOME/projects/duck-studio}}"

step() { printf '\n== %s\n' "$1"; }

step "1/7 extract the pinned StudioKit values"
python3 scripts/extract_kit_sentences.py "$DUCK_STUDIO"

step "2/7 every pinned sentence is on the site"
bash scripts/check_site_sentences.sh

step "3/7 dashes, third parties, the bundle, the shared stylesheet"
bash scripts/check_site_claims.sh

step "4/7 the Evaluations copy matches what a tester can open"
bash scripts/check_evallog_claims.sh

step "5/7 every Duck Card matches the deck, StudioKit, its code and the beta"
python3 scripts/check_cards.py "$DUCK_STUDIO"

step "6/7 every link resolves"
bash scripts/check_links.sh

step "7/7 every page is well formed"
if command -v xmllint >/dev/null 2>&1; then
  mapfile -d '' html_pages < <(find public -type f -name '*.html' -print0)
  xmllint --html --noout "${html_pages[@]}"
  echo "check_wellformed: xmllint is installed and it is quiet"
fi
python3 scripts/check_wellformed.py

printf '\npredeploy: all seven gates passed. Deploy with\n'
printf '  npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main\n'
