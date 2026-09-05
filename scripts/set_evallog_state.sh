#!/usr/bin/env bash
# Put public/index.html into the shipped or the not-shipped Evaluations state.
#
# BOTH STATES ARE AUTHORED AND ONLY ONE IS SERVED. Build 58 carries the
# Evaluations screen; until it is available to testers, present tense copy about
# it is a capability asserted one tap from a TestFlight button, where a stranger
# cannot check it. So the copy for both states lives in tools/evalstate/ and this
# script splices the chosen one between the three marker pairs in the page.
#
# DETERMINISTIC AND IDEMPOTENT. Running it twice with the same argument produces
# the same bytes, and running it with the other argument gets you back exactly
# where you were. The markers survive every splice because only what is BETWEEN
# them is replaced. Nothing else in the page is touched.
#
# This script writes the page. It does not write the receipt: only
# record_evallog_shipped.sh does that, and check_evallog_claims.sh fails when a
# state and a receipt disagree in either direction.
#
# Usage: bash scripts/set_evallog_state.sh shipped|not-shipped

set -euo pipefail
cd "$(dirname "$0")/.."

STATE="${1:-}"
if [ "$STATE" != "shipped" ] && [ "$STATE" != "not-shipped" ]; then
  echo "usage: bash scripts/set_evallog_state.sh shipped|not-shipped" >&2
  exit 2
fi

STATE="$STATE" python3 - <<'PY'
import os, pathlib, re, sys

state = os.environ["STATE"]
page = pathlib.Path("public/index.html")
text = page.read_text(encoding="utf-8")

regions = {"CARD": "card.html", "SECTION": "section.html", "FORMATROW": "formatrow.html"}
for marker, filename in regions.items():
    source = pathlib.Path("tools/evalstate") / state / filename
    if not source.is_file():
        print(f"set_evallog_state: {source} is missing", file=sys.stderr)
        sys.exit(1)
    begin = f"<!-- EVALSTATE:{marker}:BEGIN -->"
    end = f"<!-- EVALSTATE:{marker}:END -->"
    if text.count(begin) != 1 or text.count(end) != 1:
        print(f"set_evallog_state: {marker} markers are not a single pair in the page",
              file=sys.stderr)
        sys.exit(1)
    body = source.read_text(encoding="utf-8")
    if not body.endswith("\n"):
        body += "\n"
    pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.DOTALL)
    text = pattern.sub(lambda _: begin + "\n" + body + end, text, count=1)

page.write_text(text, encoding="utf-8")

# Self-check, so a bad splice cannot be discovered later by a reader.
shipped = text.count('id="evallog-shipped"')
not_shipped = text.count('id="evallog-not-shipped"')
if shipped + not_shipped != 1:
    print(f"set_evallog_state: the page now claims {shipped} shipped and "
          f"{not_shipped} not-shipped markers", file=sys.stderr)
    sys.exit(1)
want = 1 if state == "shipped" else 0
if shipped != want or text.count('id="format-evallog"') != want:
    print(f"set_evallog_state: the page is not in the {state} state after the splice",
          file=sys.stderr)
    sys.exit(1)
print(f"set_evallog_state: public/index.html is now in the {state} state")
PY
