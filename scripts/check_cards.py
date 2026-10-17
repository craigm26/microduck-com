#!/usr/bin/env python3
"""Duck Cards agree with the deck, with StudioKit, with the code table, and with the beta.

    python3 scripts/check_cards.py [DUCK_STUDIO]

A PRINTED CARD CANNOT BE RECALLED. Once a class has cut out a deck, a card that
names the wrong button, a code that reads as another card, or a Studio control
the beta does not have is on a table for a whole term. So this gate reads the
committed pages the way a stranger would, not the renderer's intentions, and
holds every card on them to four sources:

  * the deck file, public/cards/duck-cards.json, for what each card is;
  * tools/kit-sentences.json, which the extractor read out of StudioKit, for
    what Studio calls each card, what goes under what, and which pad button
    does what;
  * tools/duckcards/tag36h11.txt, the AprilTag family's own table, for what
    each code must look like, cell by cell;
  * the StudioKit the TestFlight beta was built from, for "every control named
    here is already in the beta". The build number comes from the receipt
    (tools/evallog-shipped.json); its commit is found in DUCK_STUDIO's history,
    and that commit's StudioKit is read with the extractor's own readers.

IT ALSO RE-RUNS THE RENDERER, in check mode, so a hand edit between two
DUCKCARDS markers fails here rather than surviving until the next rebuild.

The pages' own arithmetic is checked as arithmetic: three rows of three on
Letter and on A4, the last sheet all blank cards, the code's black square a
little over a centimetre, read from the stylesheet that prints them.

PROVED ABLE TO FAIL: see the header of predeploy.sh.
"""

from __future__ import annotations

import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tools/duckcards"))

import build_cards as bc  # noqa: E402
import extract_kit_sentences as ex  # noqa: E402
from site_helpers import flatten  # noqa: E402

CARD_PAGES = ("public/cards/index.html", "public/cards/print/index.html",
              "public/cards/spec/index.html", "public/index.html")
# Every pack page and pack cut sheet draws its cards with the same card_html, and
# a card on a pack page is printed and cut like any other, so each is read back
# here too. Their own arithmetic and boards are scripts/check_packs.py's.
CARD_PAGES += tuple(sorted(str(p) for p in pathlib.Path("public/cards/packs").glob("*/index.html"))
                    + sorted(str(p) for p in pathlib.Path("public/cards/packs").glob("*/print/index.html")))
CARDS, PRINT, SPEC = CARD_PAGES[:3]
RECEIPT = pathlib.Path("tools/evallog-shipped.json")
CSS = pathlib.Path("public/assets/site.css")
# Paper, in millimetres, as the print page promises it: Letter or A4.
PAPER = {"Letter": (215.9, 279.4), "A4": (210.0, 297.0)}

fail: list[str] = []


def problem(text: str) -> None:
    fail.append(text)


# --------------------------------------------------------------------------
# reading a card off a page
# --------------------------------------------------------------------------

class Card(HTMLParser):
    """One <article class="dc">: its text by class, its chips, and its code."""

    def __init__(self, markup: str) -> None:
        super().__init__(convert_charrefs=True)
        self.open: list[list[str]] = []
        self.text: dict[str, str] = {}
        self.chips: list[str] = []
        self.label: str | None = None
        self.black: list[str] = []
        self.white: list[str] = []
        self.uses: list[str] = []
        self.attrs: dict[str, str] = {}
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        a = {k: v or "" for k, v in attrs}
        if tag == "article" and not self.attrs:
            self.attrs = a
        classes = a.get("class", "").split()
        if tag == "svg" and "dc-tag" in classes:
            self.label = a.get("aria-label")
        self.leaf(tag, a)
        self.open.append(classes + [f"<{tag}>"])

    def handle_startendtag(self, tag, attrs):
        self.leaf(tag, {k: v or "" for k, v in attrs})

    def leaf(self, tag: str, a: dict[str, str]) -> None:
        """A code's cells and a picture's symbol, written either way SVG allows."""
        if tag == "path" and any("dc-tag" in classes for classes in self.open):
            (self.black if a.get("fill") == "#000" else self.white).append(a.get("d", ""))
        if tag == "use":
            self.uses.append(a.get("href", ""))

    def handle_endtag(self, tag):
        if self.open:
            self.open.pop()

    def handle_data(self, data):
        for classes in self.open:
            for name in classes:
                if name.startswith("dc-"):
                    self.text[name] = self.text.get(name, "") + data
        if self.open and "<li>" in self.open[-1] and any("dc-runs" in c for c in self.open):
            self.chips.append(data.strip())

    def get(self, name: str) -> str:
        return re.sub(r"\s+", " ", self.text.get(name, "")).strip()


def cards_on(page: str, text: str) -> list[Card]:
    blocks = re.findall(r'<article class="dc [^"]*".*?</article>', text, flags=re.S)
    if text.count('<article class="dc ') != len(blocks):
        problem(f"{page}: a card's <article> never closes")
    return [Card(block) for block in blocks]


def grid_of(paths: list[str]) -> list[list[int]] | None:
    """The 10 by 10 cells a code's black runs cover. 1 is white, as in the table."""
    grid = [[1] * 10 for _ in range(10)]
    for d in paths:
        rest = re.sub(r"M(\d+) (\d+)h(\d+)v1h-\3z", "", d)
        if rest:
            return None
        for x, y, n in re.findall(r"M(\d+) (\d+)h(\d+)v1h-\3z", d):
            x, y, n = int(x), int(y), int(n)
            if y > 9 or x + n > 10:
                return None
            for cell in range(x, x + n):
                grid[y][cell] = 0
    return grid


def expected_grid(rows: list[str]) -> list[list[int]]:
    grid = [[1] * 10 for _ in range(10)]
    for y in range(1, 9):
        for x in range(1, 9):
            grid[y][x] = 0
    for r, row in enumerate(rows):
        for c, bit in enumerate(row):
            grid[r + 2][c + 2] = int(bit)
    return grid


# --------------------------------------------------------------------------
# what a card should claim, worked out here and not by the renderer
# --------------------------------------------------------------------------

def expect(card: dict, kit: dict) -> tuple[bool, str | None]:
    """(says Studio, pad face) for a card, straight from the pad table.

    Deliberately not build_cards.derive: this reads the bindings by what each
    one is FOR, so a renderer that swapped two sticks or two bumpers is caught
    by a reading that did not make the same mistake.
    """
    plan = card.get("plan") or {}
    action, sound = plan.get("action"), plan.get("sound")
    faces, rows = kit["pad_faces"], kit["pad_bindings"]
    by_slot = {row["slot"]: row for row in rows if row["here"] == "loadSlot"}
    sticks = {row["robot"].split()[0]: row for row in rows if row["control"].endswith("Stick")}
    if action in ("walk_forward", "walk_backward", "turn_left", "turn_right"):
        row = sticks.get("Translate" if action.startswith("walk") else "Heading")
        if row is None:
            return False, None
        return row["here"] == "drive", faces[row["control"]]
    if action == "stop":
        return any(row["here"] == "stop" for row in rows), None
    if action in kit["skills"]:
        row = by_slot.get(kit["skills"][action])
        return (True, faces[row["control"]]) if row else (False, None)
    if action == "make_sound":
        row = next((r for r in rows if re.search(rf"\b{re.escape(sound)}\b", r["robot"].lower())),
                   None)
        return (row is not None and row["here"] != "unsupported",
                faces[row["control"]] if row else None)
    if "speed" in plan:
        return all(r["here"] == "drive" for r in sticks.values()) and len(sticks) == 2, None
    if "head" in plan:
        row = next((r for r in rows if r["robot"].startswith("Head mode")), None)
        return (row is not None and row["here"] != "unsupported",
                faces[row["control"]] if row else None)
    return False, None


# --------------------------------------------------------------------------
# the stylesheet's print arithmetic
# --------------------------------------------------------------------------

def css_mm(css: str, selector: str, prop: str) -> float | None:
    block = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", css)
    if not block:
        return None
    value = re.search(r"(?:^|;)\s*" + re.escape(prop) + r"\s*:\s*([\d.]+)mm", block.group(1))
    return float(value.group(1)) if value else None


def css_cqi(css: str, selector: str, prop: str) -> float | None:
    block = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", css)
    if not block:
        return None
    value = re.search(r"(?:^|;)\s*" + re.escape(prop) + r"\s*:\s*([\d.]+)cqi", block.group(1))
    return float(value.group(1)) if value else None


# --------------------------------------------------------------------------
# the beta
# --------------------------------------------------------------------------

def beta_tree(duck_studio: pathlib.Path, build: int, into: pathlib.Path) -> str | None:
    """Unpack StudioKit as it was when the beta's build number was set. Its commit."""
    pin = f'CURRENT_PROJECT_VERSION: "{build}"'
    log = subprocess.run(["git", "-C", str(duck_studio), "log", "--format=%H", "-S", pin,
                          "--", "DuckStudio/project.yml"], capture_output=True, text=True)
    commits = log.stdout.split()
    if log.returncode or not commits:
        problem(f"no commit in {duck_studio} ever set build {build}, the build the receipt "
                "names; is it a full clone of duck-studio?")
        return None
    first = commits[-1]  # -S lists the commits that add or remove it; the oldest adds it
    show = subprocess.run(["git", "-C", str(duck_studio), "show", f"{first}:DuckStudio/project.yml"],
                          capture_output=True, text=True)
    if pin not in show.stdout:
        problem(f"{first[:7]} is where build {build} should begin, and its project.yml "
                "does not say so")
        return None
    archive = subprocess.run(["git", "-C", str(duck_studio), "archive", first, "StudioKit/Sources"],
                             capture_output=True)
    if archive.returncode:
        problem(f"could not read StudioKit at {first[:7]}: {archive.stderr.decode()[:200]}")
        return None
    with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
        names = tar.getnames()
        if any(name.startswith("/") or ".." in pathlib.PurePosixPath(name).parts for name in names):
            problem(f"git archive of {first[:7]} names a path outside StudioKit/Sources")
            return None
        try:
            tar.extractall(into, filter="data")
        except TypeError:  # a Python older than the extraction filters
            tar.extractall(into)
    return first


# --------------------------------------------------------------------------
# the checks
# --------------------------------------------------------------------------

def main() -> int:
    duck_studio = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                               os.environ.get("DUCK_STUDIO", pathlib.Path.home() / "projects/duck-studio"))
    try:
        deck, kit, tags = bc.load()
    except bc.DeckError as why:
        print(f"check_cards: {why}", file=sys.stderr)
        return 1
    cards = {c["tag"]: c for c in deck["cards"]}
    by_code = {c["code"]: c for c in deck["cards"]}
    printed = [c for c in deck["cards"] if c["printed"]]
    categories = {c["id"]: c for c in deck["categories"]}
    pages = {name: pathlib.Path(name).read_text(encoding="utf-8") for name in CARD_PAGES}
    flat = {name: flatten(text) for name, text in pages.items()}
    css = CSS.read_text(encoding="utf-8")

    # 1. The deck's own invariants, and no hand edit between the markers.
    for text in bc.check_deck(deck, kit, tags):
        problem(text)
    if not fail:
        drawn = bc.regions(deck, kit, tags)
        for page, names in bc.PAGES.items():
            for name in names:
                if bc.current(pages.get(page) or pathlib.Path(page).read_text(), name) != drawn[name]:
                    problem(f"{page}: the {name} region is not what build_cards.py draws today; "
                            "run python3 tools/duckcards/build_cards.py")

    # 2. Every card on every page, read back off the page.
    seen = 0
    for page, text in pages.items():
        for card in cards_on(page, text):
            seen += 1
            where = f"{page}: card {card.attrs.get('data-code')!r}"
            try:
                tag = int(card.attrs.get("data-tag", ""))
            except ValueError:
                problem(f"{where} has no code number")
                continue
            truth = cards.get(tag)
            if truth is None or truth["code"] != card.attrs.get("data-code"):
                problem(f"{where} carries code number {tag}, which the deck gives "
                        f"{truth and truth['code']!r}")
                continue
            category = categories[truth["category"]]
            if f"dc-{truth['category']}" not in card.attrs.get("class", "").split():
                problem(f"{where} is coloured as another category")
            if card.get("dc-band") != category["name"]:
                problem(f"{where} has the band {card.get('dc-band')!r}, not {category['name']!r}")
            if card.get("dc-code") != truth["code"] or card.get("dc-num") != str(tag):
                problem(f"{where} prints {card.get('dc-code')!r} and {card.get('dc-num')!r}")
            if truth["kind"] == "yours":
                if card.get("dc-name") != "Name it" or card.uses:
                    problem(f"{where} is a blank card with a name or a picture already on it")
            else:
                plan = truth.get("plan") or {}
                label = plan.get("sound") or plan.get("speed") or plan.get("head") or plan.get("action")
                studio_word = kit["words"].get(label, label[:1].upper() + label[1:]) if label else None
                if card.get("dc-name") != truth["name"]:
                    problem(f"{where} is printed {card.get('dc-name')!r}; the deck says {truth['name']!r}")
                if studio_word and card.get("dc-name") != studio_word:
                    problem(f"{where} is printed {card.get('dc-name')!r}; Studio calls it {studio_word!r}")
                if card.uses != [f"#dc-i-{truth['art']}"]:
                    problem(f"{where} shows the picture {card.uses}, not {truth['art']!r}")
                studio, pad = expect(truth, kit)
                want = (["Studio"] if studio else []) + ([f"Pad: {pad}"] if pad else [])
                got = [chip for chip in card.chips if chip]
                if got != want:
                    problem(f"{where} says it runs on {got}; the pad table says {want}")
            # The code itself, cell by cell, against the family's table.
            if card.label != f"Code {tag}":
                problem(f"{where} labels its code {card.label!r}")
            grid = grid_of(card.black)
            if card.white != ["M0 0h10v10H0z"] or grid is None:
                problem(f"{where} draws its code in a shape this gate cannot read back")
            elif grid != expected_grid(tags[tag]):
                problem(f"{where} draws a code that is not tag36h11 number {tag}")
    if seen == 0:
        problem("no card was read off any page")

    # 3. The cut sheet: every printed card once, ticked, in deck order.
    sheet = cards_on(PRINT, pages[PRINT])
    if [int(c.attrs["data-tag"]) for c in sheet] != [c["tag"] for c in printed]:
        problem(f"{PRINT} does not carry every printed card exactly once, in deck order")
    for card in printed:
        tick = re.search(rf'<input type="checkbox" id="pick-{card["tag"]}"([^>]*)>', pages[PRINT])
        if not tick or "checked" not in tick.group(1).split():
            problem(f"{PRINT}: {card['code']} has no ticked box")
        if pages[PRINT].count(f'<label for="pick-{card["tag"]}">') != 1:
            problem(f"{PRINT}: {card['code']} has no label for its box")

    # The sheet arithmetic: the page says three rows of three, Letter or A4, and
    # that the last sheet is blank cards.
    width = css_mm(css, ".dc-print-page .dc-pick", "width")
    height = css_mm(css, ".dc-print-page .dc-pick", "height")
    form = css_mm(css, ".dc-print-page .dc-pickform", "width")
    margin = css_mm(css, "@page", "margin")
    if None in (width, height, form, margin):
        problem("site.css no longer sizes the cut sheet in millimetres where this gate reads it")
    else:
        if (width, height) != (63.5, 88.9):
            problem(f"a printed card is {width} by {height} mm, not a playing card's 63.5 by 88.9")
        if form != 3 * width:
            problem(f"the cut sheet is {form} mm wide, which is not three cards")
        for paper, (pw, ph) in PAPER.items():
            if form > pw - 2 * margin:
                problem(f"three cards across do not fit on {paper} inside a {margin} mm margin")
            if int((ph - 2 * margin) // height) != 3:
                problem(f"{paper} holds {int((ph - 2 * margin) // height)} rows, not three")
    if "three rows of three" not in flat[PRINT]:
        problem(f"{PRINT} no longer says three rows of three; check what it says instead")
    blanks = [c for c in printed if c["kind"] == "yours"]
    others = len(printed) - len(blanks)
    if others % 9 or not 0 < len(blanks) <= 9 or printed[-len(blanks):] != blanks:
        problem(f"{others} printed cards then {len(blanks)} blank ones: the last sheet is not "
                "all blank cards, as the print page and the gallery say")

    # 4. The format page: a row for every card, and its claims about the code.
    for card in deck["cards"]:
        row = re.search(rf'<tr id="card-{card["tag"]}"><td>(\d+)</td><td>([^<]*)<', pages[SPEC])
        if not row or row.group(1) != str(card["tag"]) or row.group(2) != card["name"]:
            problem(f"{SPEC} has no row for {card['code']}, or a wrong one")
    if len(re.findall(r'<tr id="card-\d+">', pages[SPEC])) != len(deck["cards"]):
        problem(f"{SPEC} has a table row for a card the deck does not have")
    tag_cqi = css_cqi(css, ".dc-tag", "width")
    black_mm = None if tag_cqi is None else tag_cqi / 100 * 63.5 * 0.8
    if black_mm is None or not 10 < black_mm < 13:
        size = "at no size this gate can read" if black_mm is None else f"{black_mm:.1f} mm across"
        problem(f"the code's black square prints {size}; the format page says a little over "
                "a centimetre")
    if "a little over a centimetre" not in flat[SPEC]:
        problem(f"{SPEC} no longer says how big the code is; check what it says instead")

    # The plan rules the format page states, against StudioKit's own refusals.
    plans = kit.get("plans", {})
    bench, robot, beats = (set(plans.get(k, [])) for k in
                           ("bench_refusals", "robot_refusals", "robot_beats"))
    if "one trick at most, and only as its last step" in flat[SPEC] and \
            not {"skillNotLast", "twoSkills"} <= bench:
        problem("the format page says the bench runs one trick, last; DuckIntentPlan.RunRefusal "
                f"no longer refuses that: {sorted(bench)}")
    if "a row can hold more than one" in flat[SPEC] and \
            ({"skillNotLast", "twoSkills"} & robot or not beats):
        problem("the format page says a robot runs a trick anywhere, and RobotPlan refuses "
                f"some: {sorted(robot)}")
    if "does not send one to a robot yet" in flat[SPEC] and ({"head", "look"} & beats):
        problem(f"the format page says no head pose goes to a robot; RobotPlan.Beat has {sorted(beats)}")
    sounds = [r for r in kit["pad_bindings"] if r["robot"].startswith("Mouth")]
    head = [r for r in kit["pad_bindings"] if r["robot"].startswith("Head mode")]
    if "the bench plays no sound and sends no head pose" in flat[SPEC] and (
            not sounds or not head or any(r["here"] != "unsupported" for r in sounds + head)):
        problem("the format page says the bench plays no sound and poses no head; the pad "
                "table now answers one of them here")
    example = bc.row_to_plan(deck, kit)
    skills = [i for i, s in enumerate(example["steps"]) if s["labels"]["action"] in kit["skills"]]
    if len(skills) > 1 or (skills and skills[-1] != len(example["steps"]) - 1):
        problem("the example row has a trick that is not its last step; Studio's bench would "
                "refuse the plan the format page shows")

    # 5. The Duck Cards page: Studio's own words, and the lessons' claims.
    said = kit["said"]
    for key in ("record_chip", "name_it_chip", "say_it_chip", "say_it_placeholder",
                "not_a_model", "pick_two", "mimic", "detail_everything"):
        if said[key] not in flat[CARDS]:
            problem(f"{CARDS} does not carry Studio's {key} word for word: {said[key]!r}")
    if "Learn's last lesson" in flat[CARDS] and "Learn's last lesson" not in said["detail_switch"]:
        problem(f"{CARDS} sends teachers to Learn's last lesson, and Simple no longer does")
    takes = kit["takes"]
    walk, stop = set(takes.get("walk_forward", [])), set(takes.get("stop", []))
    kicks = [set(takes.get(k, takes["default"])) for k in ("kick_left", "kick_right")]
    if "a walk can carry both, a stop can carry a Look, and a kick carries neither" in flat[CARDS]:
        if not ({"speed", "head"} <= walk and "head" in stop and "speed" not in stop
                and all(not {"speed", "head"} & k for k in kicks)):
            problem("the What goes under lesson no longer matches Node.heads")
    else:
        problem(f"{CARDS} no longer states what goes under what; check what it says instead")
    if "Should a Look card go under a kick? Studio's plan says no." in flat[CARDS] and \
            any("head" in k for k in kicks):
        problem("the Change the rules card says a kick takes no Look; Node.heads now lets it")
    words = kit["vocabulary"]
    for word, label, kind in (("Normal", "normal", "speeds"), ("Inquire", "inquire", "sounds")):
        if label not in words[kind] or by_code.get(label, {}).get("printed", True):
            problem(f"{CARDS} names {word} as a word Studio has and the deck skips; it is not")
    rows = kit["pad_bindings"]
    if "The bench in Studio takes walking and the tricks, but no head pose, and it moves no beak." \
            in flat[CARDS]:
        loads = {r["slot"] for r in rows if r["here"] == "loadSlot"}
        if not (set(kit["skills"].values()) <= loads and head and sounds
                and all(r["here"] == "unsupported" for r in head + sounds)):
            problem("the note on the bench no longer matches the pad table")
    wheee = [r for r in rows if "wheee" in r["robot"].lower()]
    other = [s for s in words["sounds"] if s != "wheee" and by_code.get(s, {}).get("printed")
             and any(re.search(rf"\b{s}\b", r["robot"].lower()) for r in rows)]
    if not wheee or not head or other:
        problem("the note says the Look cards and Wheee have buttons on a real duck and the "
                f"other sounds do not; the pad table says wheee={bool(wheee)}, head={bool(head)}, "
                f"others={other}")

    # 6. "Every control named here is already in the beta."
    if "Every control named here is already in the beta." in flat[CARDS]:
        if not RECEIPT.is_file():
            problem(f"{CARDS} says every control it names is in the beta, and there is no "
                    f"{RECEIPT} naming the beta's build")
        else:
            build = json.loads(RECEIPT.read_text(encoding="utf-8")).get("testflight_build")
            with tempfile.TemporaryDirectory() as tmp:
                commit = beta_tree(duck_studio, int(build), pathlib.Path(tmp))
                if commit:
                    try:
                        beta_said = ex.read_said(pathlib.Path(tmp))
                        beta_faces, beta_rows = ex.read_pad(pathlib.Path(tmp))
                    except ex.Missing as why:
                        problem(f"build {build} ({commit[:7]}) does not have what the cards page "
                                f"names: {why}")
                    else:
                        for key, value in said.items():
                            if beta_said.get(key) != value:
                                problem(f"Studio's {key} is {value!r} today and "
                                        f"{beta_said.get(key)!r} in build {build}, the beta")
                        if (beta_faces, beta_rows) != (kit["pad_faces"], kit["pad_bindings"]):
                            problem(f"the pad in build {build}, the beta, is not the pad the "
                                    "cards print")
                    print(f"check_cards: the beta is build {build}, {commit[:7]}")

    if fail:
        for text in fail:
            print("check_cards: " + text, file=sys.stderr)
        return 1
    print(f"check_cards: {seen} cards on {len(CARD_PAGES)} pages read back against the deck, "
          "Studio's words and the pad, every code tag36h11 cell for cell, and three rows of "
          "three on Letter and A4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
