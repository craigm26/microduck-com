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
# PROVED ABLE TO FAIL, 2026-10-15, check_packs nineteen times and check_cards
# once more, in a throwaway copy of the repository run against a copy of
# duck-studio's StudioKit/Sources and docs/PACKS.md, one defect at a time and
# each restored before the next; the copy passed before the first and after
# the last. The first pass of these proved nothing: the harness handed the gate
# a relative duck-studio path, so every case "failed" on "has no packs", which is
# a failure for the wrong reason. They were all run again with an absolute path:
#   * one byte changed in the site's get-to-the-pond.duckpack: "differs from the
#     duck-studio checkout's; copy it again, byte for byte".
#   * a pack on the site only: "extra.duckpack has no twin in
#     StudioKit/Sources/StudioKit/Resources/DuckPacks".
#   * a pack in duck-studio only, extract rerun: "is not on the site; copy it to
#     public/cards/packs/" and "the extract pins extra.duckpack and the site
#     does not serve it".
#   * duck-studio's copy changed and the extract not rerun: "differs from the
#     duck-studio checkout's".
#   * Corner pond's par made 6 in both copies: "its solution scores 5 steps and
#     par says 6" and "par is 6 and the fewest steps on the board is 5".
#   * duck_square_cm set to 14 in both copies of duck-maze: "carries a measured
#     duck square; the pack pages say one card has not been measured".
#   * the first measurement changed to 16 cm in docs/PACKS.md, extract rerun:
#     "does not say 'a Walk forward card carried the duck about 16 cm'" and
#     "prints 14 cm, which is neither a pack's floor square nor the first
#     measurement".
#   * the renderer turning every tunnel: "#pond-6 draws tunnels [((1, 2),
#     'ns')]; the pack has [((1, 2), 'ew')]".
#   * the renderer drawing walls on the near edge: "#maze-3 draws walls [[(0,
#     3), (1, 3)]]; the pack has [[(1, 3), (2, 3)]]".
#   * the renderer facing east the wrong way: "#pond-6 draws the start at ((0,
#     0), 'west'); the pack says [0, 0] facing east". Before the gate read the
#     marker's turn with its own table, it read it through the renderer's, and
#     this case could not have failed.
#   * a hint hand-edited on a page: "#pond-1 does not carry its hint word for
#     word".
#   * "like Code & Go" planted on the packs page: "names 'Code &amp; Go'; name
#     the activity's shape, not the brand".
#   * activity cards printed 140 mm tall: "Letter holds 1 rows of activity
#     cards, not two".
#   * the renderer dropping a card from the cut sheet: "prints 4 cards; the
#     pack plays 5".
#   * the renderer printing the solution as the Find the bug row: "#loop-3
#     draws the Find the bug row [...]".
#   * the renderer finishing with Stop: "#maze-7 shows the finish card
#     [('stop', 'Stop')], not 'greet'".
#   * a 20 cm square planted in the renderer: "prints 20 cm, which is neither a
#     pack's floor square nor the first measurement".
#   * the renderer listing the packs oldest first: "lists ['design-a-level',
#     ...]; youngest first is ['get-to-the-pond', ...]". This one PASSED on the
#     first try, because the gate took youngest-first from the renderer's own
#     sort; it now sorts by the files' grade_from itself.
#   * the renderer leaving Start out of play: "draws the cards [...] in play;
#     the pack plays [... 'start', 'end']" and "prints 4 cards".
#   * and check_cards: one Walk forward card on a pack page given the right
#     stick: "public/cards/packs/get-to-the-pond/index.html: card
#     'walk_forward' says it runs on ['Studio', 'Pad: R stick']".
# PROVED ABLE TO FAIL, 2026-10-15, after the pages took the closed-loop card
# measurement (duck-studio docs/PACKS.md, "Closed-loop cards"), each restored:
#   * duck-maze's page made to say "within 3 cm of the board": "does not say
#     'Over 140 rows, the duck ended within 4.6 cm ...'" and "prints 3 cm, which
#     is neither a pack's floor square nor a number in docs/PACKS.md's
#     closed-loop table".
#   * a note planted on #maze-1, which carries none: "#maze-1 shows a note
#     ['Room 12 drew this.'] the challenge does not carry".
#   * the extract's error bound changed 4.6 -> 3.9: every pack page "is not what
#     build_packs.py draws today".
# PROVED ABLE TO FAIL, 2026-10-15, after duck-studio shipped closed-loop cards
# OFF for real ducks (duck-card-loop.json enabled_on_robot: false) and the pages
# took Studio's own sentence for it, each restored:
#   * duck-maze's page made to say "Over 140 rows, the duck ended within 4.6 cm":
#     "claims 'Over 140 rows' about a duck, and measured cards are off for real
#     ducks", "claims 'ended within'", "prints 4.6 cm, which is neither a pack's
#     floor square nor the square the cards walk", and "is not what
#     build_packs.py draws today".
#   * the extract's enabled_on_robot set true: "duck-studio turned measured
#     cards on for a duck (validated: None); these pages say they are timed, so
#     rewrite them, and this gate, with the results".
#   * the extractor's read_closed_loop on a copy of duck-studio with the switch
#     taken out of duck-card-loop.json: "has no enabled_on_robot switch"; and
#     with DuckCardLoop.offNote renamed: "has no offNote".
# PROVED ABLE TO FAIL, 2026-10-24, check_books thirty-one times, by
# tools/books/mutate.py in a throwaway copy of the repository, one defect at a
# time and every touched file restored byte for byte before the next; the copy
# passed before the first and after the last:
#   * a number with no entry in a lesson's words: "beginner lesson-2: prints
#     '999' and the ledger does not say where it comes from".
#   * a quote changed to words its source does not say: "'61': rl-readme does
#     not say "61 numbers from the duck's dreams"".
#   * 98,304 derived as 4096 * 23: "is 94208, which does not print as 98,304".
#   * a second script on a book page: "must carry exactly <script ...>".
#   * the books' script on the docs page: "public/docs/index.html carries a
#     script tag; only the three book pages may". And again with the gate run
#     from another directory. Before the gate read the pages from the
#     repository root, run from anywhere else it read no pages and passed.
#   * script-src added to the docs policy: "only the books may run scripts".
#   * the books' policy deleted from _headers: "/books/beginner/ is under 0
#     security policies in _headers, not exactly one".
#   * 'unsafe-inline' added to the books' script-src: "the books' policy must
#     allow the site's own scripts and nothing else".
#   * a "! Content-Security-Policy" line: "_headers detaches
#     Content-Security-Policy".
#   * an https address in a comment in figure code: "names a remote address".
#   * an em dash in a figure's label: "contains an em dash".
#   * eval in kit.js: "evaluates code or opens a connection".
#   * an import of a file that is not there: "imports ./nope.js, which does
#     not exist".
#   * "a reward model" in a comment in figure code: "claims a reward model".
#   * one byte of the vendored three.js changed: "is not the vendored file
#     tools/books/vendor.sha256 records".
#   * a prediction whose answer is none of its choices: "must match exactly
#     one of ['a', 'b', 'c']".
#   * a prediction's details removed: "needs its answer in a details".
#   * a lesson naming a figure the engine lacks: "figure 'nosuch' is not in
#     figures-beginner.js".
#   * one contents entry renamed: "the contents list does not match".
#   * lesson-10's id broken: "not lesson-1 to lesson-10".
#   * a seventh step: "a figure has 2 to 6 steps, not 7".
#   * '77 feathers' in a figure's label: "figure parts prints '77' with no
#     ledger entry".
#   * the training chart's ticks made [0, 750, 1500]: "figure training prints
#     '750' with no ledger entry".
#   * a figure entry for a number no figure prints: "the ledger lists '42'
#     under figure and figure training no longer prints it".
#   * the "means" taken off "bipedal", which vouches for two: "the quote does
#     not contain two".
#   * 500 derived as 50 * 20 / 2: "is derived from 20, which this lesson does
#     not ledger".
#   * an entry both derived and a toy: "needs exactly one of source, derived,
#     toy, count or editorial".
#   * "eleven" put in a book's meta description: "the head prints 'eleven'".
#   * 12 put on the shelf: "the shelf prints '12'".
#   * the books' script put on the shelf: "carries a script tag".
# Six of these PASSED the gate as it stood before that day's last rules: the
# run from another directory, the tick, the stale figure entry, the quote
# without its number, the loose operand and the number in the head. Each rule
# was written for one of them.
# PROVED ABLE TO FAIL, 2026-10-25, check_books six more times, on the training
# guide at /train/, by the same harness, each restored; the copy passed before
# the first and after the last:
#   * a number with no entry: "the training guide prints '999' and
#     tools/books/claims-train.json does not say where it comes from".
#   * an entry the page no longer prints: "claims-train.json lists '250' and
#     the training guide no longer prints it".
#   * a quote the pinned challenges file does not contain: "ch-sprint does not
#     say ...".
#   * a quote a web page does not contain, read through its markup: "ms-wsl
#     does not say ...".
#   * a number in its title: "the training guide's head prints '9'".
#   * a script on the page: "the training guide carries a script".
# A gate nobody has watched fail is not a gate.
#
# Usage: bash scripts/predeploy.sh [DUCK_STUDIO]

set -euo pipefail
cd "$(dirname "$0")/.."

DUCK_STUDIO="${1:-${DUCK_STUDIO:-$HOME/projects/duck-studio}}"

step() { printf '\n== %s\n' "$1"; }

step "1/9 extract the pinned StudioKit values"
python3 scripts/extract_kit_sentences.py "$DUCK_STUDIO"

step "2/9 every pinned sentence is on the site"
bash scripts/check_site_sentences.sh

step "3/9 dashes, third parties, the bundle, the shared stylesheet"
bash scripts/check_site_claims.sh

step "4/9 the Evaluations copy matches what a tester can open"
bash scripts/check_evallog_claims.sh

step "5/9 every Duck Card matches the deck, StudioKit, its code and the beta"
python3 scripts/check_cards.py "$DUCK_STUDIO"

step "6/9 every Duck Card pack is Studio's, and its pages say what it says"
python3 scripts/check_packs.py "$DUCK_STUDIO"

step "7/9 every link resolves"
bash scripts/check_links.sh

step "8/9 every page is well formed"
if command -v xmllint >/dev/null 2>&1; then
  mapfile -d '' html_pages < <(find public -type f -name '*.html' -print0)
  xmllint --html --noout "${html_pages[@]}"
  echo "check_wellformed: xmllint is installed and it is quiet"
fi
python3 scripts/check_wellformed.py

step "9/9 the books: their structure, their one script, and every number's source"
python3 scripts/check_books.py

printf '\npredeploy: all nine gates passed. Deploy with\n'
printf '  npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main\n'
