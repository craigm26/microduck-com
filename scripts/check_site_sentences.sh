#!/usr/bin/env bash
# Every sentence this page quotes from StudioKit is on the page, word for word.
#
# THE FAILURE THIS EXISTS TO CATCH is a kit sentence that changed while the page
# kept the old wording, so two surfaces of one project say two different things
# about the same measurement. The site is public marketing copy and the kit
# string is under test, so the kit wins and the page has to follow it.
#
# IT COMPARES FLATTENED TEXT, NOT SOURCE. Tags are stripped, entities are
# unescaped and whitespace is collapsed before the comparison, so the HTML may
# wrap a sentence across lines (it must) and may write `>` as `&gt;` (it must,
# inside the stairs criterion) without either counting as a difference.
#
# THE SHIPPED NUMBERS ARE CHECKED AS VALUES, NOT AS PRESENCE. The extractor
# reads the reducer cases and the EvalLog schema version out of StudioKit, and
# the shipped copy prints both. Reading them and never comparing them would
# leave two numbers on a public page with nothing behind them, which is the one
# rule this site has about numbers.
#
# BOTH PAGES ARE READ, NOT ONE. The independence paragraph is quoted from
# StudioKit on the front page AND on the privacy page, and the privacy page is
# the URL the App Store listing points at. A gate that pinned it on one of them
# would let the other drift, on the copy that matters most.
#
# THE SHIPPED SET IS CHECKED BOTH WAYS. A sentence in `quoted_when_shipped`
# must be on the page in the shipped state and must NOT be on it in the
# not-shipped state, because those sentences describe controls that a tester
# cannot open yet.
#
# PROVED ABLE TO FAIL: see the header of predeploy.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

test -f tools/kit-sentences.json || {
  echo "check_site_sentences: no tools/kit-sentences.json; run extract_kit_sentences.py first" >&2
  exit 1
}

python3 - <<'PY'
import html, json, pathlib, re, sys

pages = {p: pathlib.Path(p).read_text(encoding="utf-8")
         for p in ("public/index.html", "public/privacy/index.html")}
page = pages["public/index.html"]
# The stylesheet is not something a person reads, so it is stripped before
# the page is flattened. Otherwise a CSS length can satisfy a copy check.
def flatten(markup: str) -> str:
    body = re.sub(r"<style\b.*?</style>", " ", markup, flags=re.DOTALL)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body)))


flat = flatten(page)
flat_pages = {name: flatten(text) for name, text in pages.items()}
data = json.loads(pathlib.Path("tools/kit-sentences.json").read_text(encoding="utf-8"))


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


quoted = data["quoted"]
missing = [k for k, v in quoted.items() if norm(v) not in flat]
if missing:
    print("check_site_sentences: not found verbatim on the page: "
          + ", ".join(sorted(missing)), file=sys.stderr)
    sys.exit(1)

# The independence paragraph is on both pages word for word, so it is held on
# both. Naming the page in the failure is the whole point: the two files drift
# one at a time.
BOTH_PAGES = ("independence",)
for key in BOTH_PAGES:
    for name, text in flat_pages.items():
        if norm(quoted[key]) not in text:
            print(f"check_site_sentences: {name} does not carry {key} verbatim",
                  file=sys.stderr)
            sys.exit(1)

shipped = 'id="evallog-shipped"' in page
when_shipped = data.get("quoted_when_shipped", {})
if shipped:
    absent = [k for k, v in when_shipped.items() if norm(v) not in flat]
    if absent:
        print("check_site_sentences: the shipped page is missing "
              + ", ".join(sorted(absent)), file=sys.stderr)
        sys.exit(1)
    # The two numbers the shipped copy prints, as values read out of StudioKit.
    numbers_wrong = []
    shipped_numbers = data.get("shipped_numbers", {})
    reducers = shipped_numbers.get("reducers")
    if reducers:
        phrase = ", ".join(reducers[:-1]) + " or " + reducers[-1]
        if phrase not in flat:
            numbers_wrong.append(f"the reducer list reads {phrase!r} in "
                                 "EvalEpochs.Reducer and not on the page")
    version = shipped_numbers.get("evallog_schema_version")
    if version is not None and f"Version {version}" not in flat:
        numbers_wrong.append(f"EvalLog.schemaVersion is {version} and the page does "
                             f"not say 'Version {version}'")
    if numbers_wrong:
        for problem in numbers_wrong:
            print("check_site_sentences: " + problem, file=sys.stderr)
        sys.exit(1)
else:
    leaked = [k for k, v in when_shipped.items() if norm(v) in flat]
    if leaked:
        print("check_site_sentences: the not-shipped page describes controls "
              "nobody can open: " + ", ".join(sorted(leaked)), file=sys.stderr)
        sys.exit(1)

# The restated paragraphs. Every number the page prints beside a challenge has
# to be in the constant the paragraph was restated from, or in the grid
# constant it names. A restatement is allowed to drop a number; it is not
# allowed to invent one.
restated = data["restated"]
numbers = data["numbers"]


def in_constant(needle: str, key: str) -> str | None:
    value = restated[key].replace("°", " degrees").replace("−", "-")
    return None if needle in value else f"{needle!r} is not in {key}"


def is_value(needle: str, actual: float, printed: float) -> str | None:
    return None if abs(actual - printed) < 1e-9 else \
        f"{needle!r} does not match the constant, which is {actual}"


problems = [p for p in [
    in_constant("fifty ticks", "stairs_one_sentence_raw"),
    in_constant("both feet", "stairs_one_sentence_raw"),
    in_constant("1.2 m", "ball_one_sentence_raw"),
    in_constant("40 degrees", "ball_one_sentence_raw"),
    in_constant("70 mm", "ball_caveat_raw"),
    in_constant("15 g", "ball_caveat_raw"),
    in_constant("100 mm", "ball_caveat_raw"),
    in_constant("30 g", "ball_caveat_raw"),
    in_constant("3 mm", "ball_criterion_raw"),
    in_constant("100 mm", "ball_criterion_raw"),
    in_constant("45 of the 50 tail ticks", "ball_criterion_raw"),
    is_value("450 mm", numbers["ball_ranges_m"][0] * 1000, 450.0),
    is_value("1.2 m", numbers["ball_extended_range_m"], 1.2),
    is_value("40 degrees", max(numbers["ball_extended_bearings_deg"]), 40.0),
    # The stairs paragraph says "fourteen cells of which nine are the core",
    # so it is pinned to the STAIRS grid even though the ball grid happens
    # to carry the same two numbers today.
    is_value("fourteen cells", numbers["stairs_cell_count"], 14),
    is_value("nine are the core", numbers["stairs_core_count"], 9),
    is_value("the ball grid's fourteen", numbers["ball_cell_count"], 14),
    is_value("the ball grid's nine core", numbers["ball_core_count"], 9),
] if p]
if problems:
    for problem in problems:
        print("check_site_sentences: " + problem, file=sys.stderr)
    sys.exit(1)

# And the restated numbers are actually printed, so deleting a paragraph does
# not quietly turn this half of the gate into a check of nothing.
for needle in ("fifty ticks", "both feet", "450 mm", "1.2 m", "40 degrees",
               "70 mm", "15 g", "100 mm", "30 g", "3 mm",
               "45 of the 50 tail ticks", "fourteen cells",
               "nine are the core"):
    if needle not in flat:
        print(f"check_site_sentences: the page no longer prints {needle!r}, so the "
              "restated check covers nothing", file=sys.stderr)
        sys.exit(1)

state = "shipped" if shipped else "not-shipped"
print(f"check_site_sentences: {len(quoted)} pinned sentences present, "
      f"{len(when_shipped)} shipped-only handled, restated numbers match ({state})")
PY
