#!/usr/bin/env bash
# The Evaluations copy matches what is actually available to a tester.
#
# THIS GATE FAILS IN BOTH DIRECTIONS. A page in the shipped state with no
# receipt is a capability asserted one tap from a TestFlight button. A receipt
# with no page in the shipped state is an orphan somebody will later assume
# licenses something. Both are exit 1.
#
# THE PARITY GATE IS RUN, NOT STAT'D. The strongest sentence on the page is
# "it is tested rather than promised", and a gate that is only checked for
# existence is a gate a three line stub satisfies.
#
# EVAL KEYS ARE OPTIONAL UNTIL THIS GATE SAYS OTHERWISE. The extractor records
# any StudioKit Eval constant it could not read in `eval_keys_missing` and does
# not fail on it, because the site has to stay deployable in the not-shipped
# state while the rail is still landing. Here, in the shipped state only, a
# non-empty list is a failure.
#
# PROVED ABLE TO FAIL: see the header of predeploy.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import datetime as dt
import json
import pathlib
import subprocess
import sys

fail = []
page = pathlib.Path("public/index.html").read_text(encoding="utf-8")
receipt_path = pathlib.Path("tools/evallog-shipped.json")

shipped = page.count('id="evallog-shipped"')
not_shipped = page.count('id="evallog-not-shipped"')
if shipped + not_shipped != 1:
    print(f"check_evallog_claims: the page carries {shipped} shipped and "
          f"{not_shipped} not-shipped markers; exactly one is allowed", file=sys.stderr)
    sys.exit(1)
is_shipped = shipped == 1
state = "shipped" if is_shipped else "not-shipped"

# The paired blocks: the card in "What it does", and the formats table row.
want = {
    'id="card-eval-shipped"': 1 if is_shipped else 0,
    'id="card-eval-not-shipped"': 0 if is_shipped else 1,
    'id="format-evallog"': 1 if is_shipped else 0,
}
for marker, expected in want.items():
    seen = page.count(marker)
    if seen != expected:
        fail.append(f"{marker} appears {seen} times in the {state} state, expected {expected}")

TESTED_SENTENCE = "That distinction matters enough that it is tested"
claims_tested = TESTED_SENTENCE in page
if claims_tested and not is_shipped:
    fail.append("the page claims the parity gate is tested while it is in the "
                "not-shipped state")

if is_shipped and not receipt_path.is_file():
    fail.append("the page is in the shipped state and tools/evallog-shipped.json is absent; "
                "run scripts/record_evallog_shipped.sh")
if receipt_path.is_file() and not is_shipped:
    fail.append("tools/evallog-shipped.json exists while the page is in the not-shipped "
                "state; an orphan receipt licenses nothing and will be assumed to license "
                "something")

if is_shipped and receipt_path.is_file():
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as why:
        print(f"check_evallog_claims: the receipt is not JSON: {why}", file=sys.stderr)
        sys.exit(1)

    gate = receipt.get("parity_gate", "")
    gate_path = pathlib.Path(gate) if gate else None
    if not gate_path or not gate_path.is_file():
        fail.append(f"the receipt names a parity gate that is not a file: {gate!r}")
    else:
        run = subprocess.run(["bash", str(gate_path)], capture_output=True, text=True)
        if run.returncode != 0:
            tail = (run.stderr or run.stdout).strip().splitlines()[-5:]
            fail.append(f"the parity gate {gate} exited {run.returncode}: "
                        + " / ".join(tail))

    if receipt.get("testflight_state") != "READY_FOR_TESTING":
        fail.append(f"the receipt's TestFlight state is "
                    f"{receipt.get('testflight_state')!r}, not READY_FOR_TESTING")
    build = receipt.get("testflight_build")
    if not isinstance(build, int) or build < 58:
        fail.append(f"the receipt's build is {build!r}; the Evaluations screen ships in 58")
    checked = receipt.get("checked", "")
    try:
        age = (dt.date.today() - dt.date.fromisoformat(checked)).days
    except ValueError:
        fail.append(f"the receipt's checked date is not an ISO date: {checked!r}")
    else:
        if age < 0 or age > 14:
            fail.append(f"the receipt was written {age} days ago; re-run "
                        "scripts/record_evallog_shipped.sh")

    sentences = pathlib.Path("tools/kit-sentences.json")
    if sentences.is_file():
        missing = json.loads(sentences.read_text(encoding="utf-8")).get("eval_keys_missing", [])
        if missing:
            fail.append("the shipped copy needs StudioKit constants that are not in the "
                        "tree: " + "; ".join(missing))

if fail:
    for problem in fail:
        print("check_evallog_claims: " + problem, file=sys.stderr)
    sys.exit(1)
print(f"check_evallog_claims: the page is in the {state} state and says nothing "
      "the receipt does not license")
PY
