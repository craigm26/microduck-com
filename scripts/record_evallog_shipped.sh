#!/usr/bin/env bash
# The only writer of tools/evallog-shipped.json, and the only way the page may
# switch to the present tense about Evaluations.
#
# IT PROVES TWO THINGS AND REFUSES ON EITHER.
#   1. The app's own cross-language parity gate runs green here, now. Not
#      "exists", not "ran once": it is executed and its exit code is the
#      evidence, because the sentence it licenses on the page is "it is tested
#      rather than promised".
#   2. Build 58 is on TestFlight and available to testers, read through the
#      operator's existing App Store Connect helper. NEVER a hand-rolled ASC
#      call: this project has one JWT implementation and it lives in
#      ios-certificates/skills/appstore-submit/.
#
# ONE EXTRA CONDITION BEYOND "VALID", AND WHY. The status line proves the build
# processed (VALID). It does not by itself prove a tester can install it, and
# that is the claim the page makes. So the same line has to show a beta state
# that means installable. If it does not, this script refuses and prints the
# line it read, rather than writing a receipt whose own field would be
# aspirational.
#
# IT ALSO FLIPS THE PAGE. A receipt without a page in the shipped state is an
# orphan and check_evallog_claims.sh treats it as a failure, so writing one and
# leaving the flip to a second command would leave the repo red between them.
#
# Usage: bash scripts/record_evallog_shipped.sh [DUCK_STUDIO]

set -euo pipefail
cd "$(dirname "$0")/.."

DUCK_STUDIO="${1:-${DUCK_STUDIO:-$HOME/projects/duck-studio}}"
BUNDLE="com.duckstudio.ios"
WANT_BUILD=58
TESTFLIGHT="$HOME/projects/ios-certificates/skills/appstore-submit/testflight.py"

export ASC_KEY_ID="${ASC_KEY_ID:-68T2S87K39}"
export ASC_ISSUER_ID="${ASC_ISSUER_ID:-0803ec59-b64d-4014-9519-d5e8c7079f0c}"
export ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_68T2S87K39.p8}"

[ -d "$DUCK_STUDIO" ] || { echo "record: $DUCK_STUDIO is not a directory" >&2; exit 1; }

PARITY="$DUCK_STUDIO/scripts/check_evallog_parity.sh"
[ -f "$PARITY" ] || {
  echo "record: $PARITY is missing. If the app track named its gate something else," >&2
  echo "        change PARITY here and nothing else." >&2
  exit 1
}

echo "record: running the app's EvalLog parity gate"
bash "$PARITY" || { echo "record: the parity gate failed; nothing written" >&2; exit 1; }

[ -f "$TESTFLIGHT" ] || { echo "record: $TESTFLIGHT is missing" >&2; exit 1; }

echo "record: reading TestFlight for $BUNDLE"
STATUS="$(python3 "$TESTFLIGHT" status --bundle "$BUNDLE")" || {
  echo "record: the TestFlight query failed; nothing written" >&2; exit 1; }
echo "$STATUS"

LINE="$(printf '%s\n' "$STATUS" | grep -E "^build ${WANT_BUILD}[[:space:]]" || true)"
[ -n "$LINE" ] || {
  echo "record: no line for build $WANT_BUILD in the TestFlight status; nothing written" >&2
  exit 1
}
printf '%s\n' "$LINE" | grep -qE "^build ${WANT_BUILD}[[:space:]]+VALID\b" || {
  echo "record: build $WANT_BUILD is not VALID yet. The line was:" >&2
  echo "        $LINE" >&2
  exit 1
}
printf '%s\n' "$LINE" | grep -qE "(internal|external)=(READY_FOR_BETA_TESTING|BETA_APPROVED)" || {
  echo "record: build $WANT_BUILD is VALID but no tester can install it yet. The line was:" >&2
  echo "        $LINE" >&2
  exit 1
}

mkdir -p tools
cat > tools/evallog-shipped.json <<JSON
{
  "parity_gate": "$PARITY",
  "testflight_build": $WANT_BUILD,
  "testflight_state": "READY_FOR_TESTING",
  "testflight_line": "$(printf '%s' "$LINE" | sed 's/"/\\"/g')",
  "checked": "$(date +%Y-%m-%d)"
}
JSON

bash scripts/set_evallog_state.sh shipped
echo "record: receipt written and the page is in the shipped state."
echo "record: next, run bash scripts/predeploy.sh"
