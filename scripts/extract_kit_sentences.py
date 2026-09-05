#!/usr/bin/env python3
"""Read the VALUES of pinned StudioKit constants into tools/kit-sentences.json.

WHY A VALUE READ AND NOT A GREP. A grep for a substring passes when the
substring survives in a doc comment above a constant that no longer says it.
This operator has already paid for that once: a completeness check greped for
"Theme." and was satisfied by "SoccerTheme.". Every reader below binds to
`public static let NAME`, consumes the literal, and fails loudly when the name
is absent. A doc comment cannot satisfy any of them.

WHY THIS LIVES IN THE SITE REPO AND NOT THE APP REPO. The site has to be
deployable without a Swift toolchain and without running the app's tests. When
`tools/site-sentences.json` exists (written by an opt-in test on the app side)
this script requires the two files to agree on every shared key, so two
extractors that disagree stop the deploy instead of shipping the luckier one.

EVAL KEYS ARE OPTIONAL, ON PURPOSE. The evaluation rail lands in the app on its
own schedule. Every key derived from a StudioKit `Eval*` file is read if it is
there and recorded in `eval_keys_missing` if it is not. Only the SHIPPED state
of the page requires them, and `check_evallog_claims.sh` is what enforces that.

Usage: python3 scripts/extract_kit_sentences.py [DUCK_STUDIO]
       DUCK_STUDIO defaults to $DUCK_STUDIO, then to ~/projects/duck-studio.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

EM_DASH = "—"
EN_DASH = "–"


class Missing(Exception):
    """A constant this site quotes is not in the tree it was quoted from."""


# --------------------------------------------------------------------------
# readers
# --------------------------------------------------------------------------


def _lines(root: pathlib.Path, rel: str) -> list[str]:
    path = root / rel
    if not path.is_file():
        raise Missing(f"{rel} is not in {root}")
    return path.read_text(encoding="utf-8").splitlines()


def _unescape(literal: str) -> str:
    return literal.replace('\\"', '"').replace("\\\\", "\\")


def _take_literal(line: str) -> str | None:
    """The contents of the first double-quoted literal on a line, or None."""
    match = re.search(r'"((?:[^"\\]|\\.)*)"', line)
    return _unescape(match.group(1)) if match else None


def read_string(root: pathlib.Path, rel: str, name: str) -> str:
    """`public static let NAME = "a"` plus every `+ "b"` continuation."""
    lines = _lines(root, rel)
    head = re.compile(r"^\s*public static let " + re.escape(name) + r"\s*(?::[^=]+)?=\s*(.*)$")
    for index, line in enumerate(lines):
        match = head.match(line)
        if not match:
            continue
        parts: list[str] = []
        first = _take_literal(match.group(1))
        if first is not None:
            parts.append(first)
        cursor = index + 1
        while cursor < len(lines):
            stripped = lines[cursor].strip()
            if stripped.startswith('"') and not parts:
                parts.append(_take_literal(stripped) or "")
            elif stripped.startswith('+ "'):
                parts.append(_take_literal(stripped) or "")
            else:
                break
            cursor += 1
        value = "".join(parts)
        if not value:
            raise Missing(f"{rel}: {name} bound to an empty string")
        return value
    raise Missing(f"{rel}: no `public static let {name}` binding a string")


def read_url(root: pathlib.Path, rel: str, name: str) -> str:
    """`public static let NAME =` then `URL(string: "...")!`, same or next line.

    B19: the two dataset URLs and the harness URL are written across two lines
    and the second line begins with `URL(`, not with `+ "`, so the string
    reader above cannot see them and would have reported them as absent.
    """
    lines = _lines(root, rel)
    head = re.compile(r"^\s*public static let " + re.escape(name) + r"\s*(?::[^=]+)?=\s*(.*)$")
    for index, line in enumerate(lines):
        match = head.match(line)
        if not match:
            continue
        window = [match.group(1)]
        if index + 1 < len(lines):
            window.append(lines[index + 1])
        for candidate in window:
            found = re.search(r'URL\(string:\s*"([^"]+)"\)', candidate)
            if found:
                return found.group(1)
        raise Missing(f"{rel}: {name} is not a URL(string:) literal")
    raise Missing(f"{rel}: no `public static let {name}`")


def read_string_set(root: pathlib.Path, rel: str, name: str) -> list[str]:
    """`public static let NAME: Set<String> = [ ... ]`, comment lines skipped.

    B20: `DuckBench.routes` is fifteen lines with three interleaved comment
    blocks, so a naive literal scan would count a route named in a comment.
    Lines whose first non-space characters are `//` are dropped before the
    literals are collected.
    """
    lines = _lines(root, rel)
    head = re.compile(
        r"^\s*public static let " + re.escape(name) + r"\s*:\s*Set<String>\s*=\s*\[\s*$"
    )
    for index, line in enumerate(lines):
        if not head.match(line):
            continue
        found: list[str] = []
        for row in lines[index + 1 :]:
            stripped = row.strip()
            if stripped.startswith("]"):
                if not found:
                    raise Missing(f"{rel}: {name} is an empty Set<String>")
                return found
            if stripped.startswith("//"):
                continue
            found.extend(_unescape(item) for item in re.findall(r'"((?:[^"\\]|\\.)*)"', row))
        raise Missing(f"{rel}: {name} has no closing bracket")
    raise Missing(f"{rel}: no `public static let {name}: Set<String>`")


def read_number(root: pathlib.Path, rel: str, name: str) -> float:
    lines = _lines(root, rel)
    head = re.compile(
        r"^\s*public static let " + re.escape(name) + r"\s*(?::\s*\w+\s*)?=\s*(-?[\d.]+)\s*$"
    )
    for line in lines:
        match = head.match(line)
        if match:
            return float(match.group(1))
    raise Missing(f"{rel}: no `public static let {name}` binding a number")


def read_number_array(root: pathlib.Path, rel: str, name: str) -> list[float]:
    lines = _lines(root, rel)
    head = re.compile(
        r"^\s*public static let " + re.escape(name) + r"\s*:\s*\[Double\]\s*=\s*\[([^\]]*)\]"
    )
    for line in lines:
        match = head.match(line)
        if match:
            values = [v.strip() for v in match.group(1).split(",") if v.strip()]
            if not values:
                raise Missing(f"{rel}: {name} is an empty array")
            return [float(v) for v in values]
    raise Missing(f"{rel}: no `public static let {name}: [Double]`")


def read_enum_cases(root: pathlib.Path, rel: str, name: str) -> list[str]:
    """The `case a, b, c` line inside `public enum NAME`."""
    lines = _lines(root, rel)
    head = re.compile(r"^\s*public enum " + re.escape(name) + r"\b")
    for index, line in enumerate(lines):
        if not head.match(line):
            continue
        for row in lines[index + 1 : index + 8]:
            stripped = row.strip()
            if stripped.startswith("case "):
                return [c.strip() for c in stripped[5:].split(",") if c.strip()]
        raise Missing(f"{rel}: {name} has no `case` line")
    raise Missing(f"{rel}: no `public enum {name}`")


def read_leaderboard(root: pathlib.Path, rel: str) -> dict[str, int]:
    """Counts inside `public static let leaderboard: [Row] = [ ... ]`."""
    lines = _lines(root, rel)
    head = re.compile(r"^\s*public static let leaderboard\s*:\s*\[Row\]\s*=\s*\[\s*$")
    for index, line in enumerate(lines):
        if not head.match(line):
            continue
        body: list[str] = []
        for row in lines[index + 1 :]:
            if re.match(r"^    \]\s*$", row):
                break
            body.append(row)
        text = "\n".join(body)
        rows = len(re.findall(r"\bRow\(", text))
        if rows == 0:
            raise Missing(f"{rel}: leaderboard has no rows")
        controls = len(re.findall(r"isControl:\s*true", text))
        oracles = len(re.findall(r"isOracle:\s*true", text))
        return {"rows": rows, "controls": controls, "oracles": oracles,
                "entries": rows - controls}
    raise Missing(f"{rel}: no `public static let leaderboard: [Row]`")


def optional(reader, *args):
    """An Eval-derived read. Returns (value, None) or (None, reason)."""
    try:
        return reader(*args), None
    except Missing as why:
        return None, str(why)


# --------------------------------------------------------------------------
# number words
# --------------------------------------------------------------------------

WORDS = [
    "no", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
]


def word(n: int) -> str:
    """Spell a count, and REFUSE anything the table does not cover.

    A twenty-first leaderboard row must fail this script rather than print a
    digit into a sentence written for words. The stale-leaderboard failure is
    the one this whole extractor exists to make impossible.
    """
    if not 0 <= n < len(WORDS):
        raise Missing(f"no word for {n}; extend the table deliberately")
    return WORDS[n]


def capitalise(text: str) -> str:
    return text[0].upper() + text[1:]


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

STAIRS = "StudioKit/Sources/StudioKit/StairsChallenge.swift"
BALL = "StudioKit/Sources/StudioKit/BallChallenge.swift"
BALL_GRID = "StudioKit/Sources/StudioKit/BallGrid.swift"
STAIRS_GRID = "StudioKit/Sources/StudioKit/StairsGrid.swift"
SUBMISSION = "StudioKit/Sources/StudioKit/StairsSubmission.swift"
PROVENANCE = "StudioKit/Sources/StudioKit/Provenance.swift"
PIPELINE = "StudioKit/Sources/StudioKit/Pipeline.swift"
BENCH = "StudioKit/Sources/StudioKit/DuckBench.swift"
INTENT = "StudioKit/Sources/StudioKit/IntentExport.swift"
PLAN = "StudioKit/Sources/StudioKit/DuckPlanFile.swift"
EPOCHS = "StudioKit/Sources/StudioKit/EvalEpochs.swift"
EVALLOG = "StudioKit/Sources/StudioKit/EvalLog.swift"

BALL_CONTROLS_CLAUSE = (
    "Standing still and both of Pollen's kick policies chase nothing at all; "
    "walking straight ahead takes 4 of the 9 core cells and 1 of the 5 extended"
)
EIGHT_ROLLOUTS_CLAUSE = (
    "the four authored stair motions in this app get up their flight 0 times in 16"
)


def main() -> int:
    here = pathlib.Path(__file__).resolve().parent.parent
    default = os.environ.get("DUCK_STUDIO") or str(pathlib.Path.home() / "projects/duck-studio")
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else default).expanduser()
    if not root.is_dir():
        print(f"extract: DUCK_STUDIO {root} is not a directory", file=sys.stderr)
        return 1

    try:
        quoted = {
            "independence": read_string(root, PROVENANCE, "independence"),
            "stairs_criterion": read_string(root, STAIRS, "criterionSentence"),
            "stairs_bar": read_string(root, STAIRS, "barSaid"),
            "ball_why_not_the_reward": read_string(root, BALL, "whyNotTheReward"),
            "submission_what_is_sent": read_string(root, SUBMISSION, "whatIsSent"),
            "plant_digest": read_string(root, STAIRS, "plantDigest"),
        }
        restated = {
            "stairs_one_sentence_raw": read_string(root, STAIRS, "oneSentence"),
            "ball_one_sentence_raw": read_string(root, BALL, "oneSentence"),
            "ball_criterion_raw": read_string(root, BALL, "criterionSentence"),
            "ball_caveat_raw": read_string(root, BALL, "ballCaveat"),
            "ball_leaderboard_raw": read_string(root, BALL, "leaderboardSaid"),
            "eight_rollouts_raw": read_string(root, PIPELINE, "eightRolloutsSaid"),
        }
        urls = {
            "stairs_dataset": read_url(root, STAIRS, "datasetURL"),
            "ball_dataset": read_url(root, BALL, "datasetURL"),
            "harness": read_url(root, STAIRS, "harnessURL"),
        }
        formats = {
            "intent": read_string(root, INTENT, "format"),
            "plan": read_string(root, PLAN, "format"),
        }
        routes = sorted(read_string_set(root, BENCH, "routes"))
        stairs_rows = read_leaderboard(root, STAIRS)
        ball_rows = read_leaderboard(root, BALL)
        numbers = {
            "ball_ranges_m": read_number_array(root, BALL_GRID, "ranges"),
            "ball_extended_bearings_deg": read_number_array(
                root, BALL_GRID, "extendedBearings"),
            "ball_extended_range_m": read_number(root, BALL_GRID, "extendedRange"),
            "ball_core_count": int(read_number(root, BALL_GRID, "coreCount")),
            "ball_cell_count": int(read_number(root, BALL_GRID, "count")),
            "ball_touch_mm": read_number(root, BALL, "touchMillimetres"),
            "ball_travel_min_mm": read_number(root, BALL, "travelMinimumMillimetres"),
            "ball_tail_ticks": int(read_number(root, BALL, "tailTicks")),
            "ball_upright_tail_min": int(read_number(root, BALL, "uprightTailMinimum")),
            "stairs_core_count": int(read_number(root, STAIRS_GRID, "coreCount")),
            "stairs_cell_count": int(read_number(root, STAIRS_GRID, "count")),
        }
    except Missing as why:
        print(f"extract: {why}", file=sys.stderr)
        return 1

    # Eval-derived, optional until the rail is in the kit. Only the SHIPPED
    # state of the page needs any of these; check_evallog_claims.sh is what
    # turns a miss into a red gate, and only there.
    eval_missing: list[str] = []
    quoted_when_shipped: dict[str, str] = {}
    shipped_numbers: dict[str, object] = {}

    no_seed, why = optional(read_string, root, EPOCHS, "noSeedSaid")
    if no_seed is None:
        eval_missing.append(f"no_seed_said: {why}")
    else:
        quoted_when_shipped["no_seed_said"] = no_seed

    no_pass_at_k, why = optional(read_string, root, EPOCHS, "noPassAtK")
    if no_pass_at_k is None:
        eval_missing.append(f"no_pass_at_k: {why}")
    else:
        quoted_when_shipped["no_pass_at_k"] = no_pass_at_k

    version, why = optional(read_number, root, EVALLOG, "schemaVersion")
    if version is None:
        eval_missing.append(f"evallog_schema_version: {why}")
    else:
        shipped_numbers["evallog_schema_version"] = int(version)

    reducers, why = optional(read_enum_cases, root, EPOCHS, "Reducer")
    if reducers is None:
        eval_missing.append(f"reducers: {why}")
    else:
        shipped_numbers["reducers"] = reducers

    # ---- always-on assertions, each fatal ---------------------------------
    try:
        for key, value in list(quoted.items()) + list(quoted_when_shipped.items()):
            if EM_DASH in value or EN_DASH in value:
                raise Missing(
                    f"{key} now carries a dash this site cannot quote; "
                    "fix the kit constant and the page copy in one commit")
        digest = quoted["plant_digest"]
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise Missing(f"plant_digest is not 64 lowercase hex characters: {digest!r}")
        if len(routes) != 16:
            raise Missing(f"DuckBench.routes has {len(routes)} entries, the page says sixteen")
        if BALL_CONTROLS_CLAUSE not in restated["ball_leaderboard_raw"]:
            raise Missing("ball_controls_clause is no longer a substring of "
                          "BallChallenge.leaderboardSaid")
        if EIGHT_ROLLOUTS_CLAUSE not in restated["eight_rollouts_raw"]:
            raise Missing("eight_rollouts_clause is no longer a substring of "
                          "Pipeline.eightRolloutsSaid")
        if stairs_rows["entries"] != stairs_rows["rows"] - stairs_rows["controls"]:
            raise Missing("stairs entry count does not reconcile")

        # The two counted sentences. Composed, never typed, so a new row or a
        # first ball entry fails the deploy instead of leaving a stale number
        # on a public page.
        stairs_said = (
            f"{capitalise(word(stairs_rows['rows']))} rows are published: "
            f"{word(stairs_rows['entries'])} entries, "
            f"{word(stairs_rows['oracles'])} of them reference oracles, and "
            f"{word(stairs_rows['controls'])} reference controls, with the intent files "
            "they name, byte for byte as the audit ran them."
        )
        ball_said = (
            f"{capitalise(word(ball_rows['controls']))} control rows and "
            f"{word(ball_rows['entries'])} entries."
        )
    except Missing as why:
        print(f"extract: {why}", file=sys.stderr)
        return 1

    quoted["stairs_rows_said"] = stairs_said
    quoted["ball_rows_said"] = ball_said
    quoted["ball_controls_clause"] = BALL_CONTROLS_CLAUSE
    quoted["eight_rollouts_clause"] = EIGHT_ROLLOUTS_CLAUSE

    # The commit, not the path. This file is committed to a public repository
    # and an absolute home directory is noise there; the commit is the thing a
    # reader would actually want to check a sentence against.
    try:
        commit = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None

    payload = {
        "generated_by": "scripts/extract_kit_sentences.py",
        "duck_studio_commit": commit,
        "quoted": quoted,
        "quoted_when_shipped": quoted_when_shipped,
        "restated": restated,
        "urls": urls,
        "formats": formats,
        "routes": routes,
        "counts": {"stairs": stairs_rows, "ball": ball_rows},
        "numbers": numbers,
        "shipped_numbers": shipped_numbers,
        "eval_keys_missing": eval_missing,
    }

    mirror = here / "tools/site-sentences.json"
    if mirror.is_file():
        theirs = json.loads(mirror.read_text(encoding="utf-8")).get("quoted", {})
        disagree = [k for k, v in theirs.items() if k in quoted and quoted[k] != v]
        if disagree:
            print("extract: tools/site-sentences.json disagrees on "
                  + ", ".join(sorted(disagree)), file=sys.stderr)
            return 1

    out = here / "tools/kit-sentences.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"extract: {len(quoted)} quoted, {len(restated)} restated, "
          f"{len(routes)} routes, stairs {stairs_rows['rows']} rows, "
          f"ball {ball_rows['rows']} rows -> tools/kit-sentences.json")
    if eval_missing:
        print("extract: not yet in the kit: " + "; ".join(eval_missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
