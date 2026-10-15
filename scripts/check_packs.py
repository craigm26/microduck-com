#!/usr/bin/env python3
"""Duck Card packs: the site's copies are Studio's, and every pack page says what its pack says.

    python3 scripts/check_packs.py [DUCK_STUDIO]

A COPY IS A THING THAT DRIFTS. public/cards/packs/<id>.duckpack is served for a
teacher to download and is what every pack page is drawn from, and the same
file is bundled in StudioKit. So each site copy is compared byte for byte with
the duck-studio checkout's StudioKit/Sources/StudioKit/Resources/DuckPacks/,
a pack on one side only fails, and both are held to the sha256 the extractor
pinned in tools/kit-sentences.json against that checkout's commit.

THEN THE PAGES ARE READ THE WAY A STRANGER WOULD. build_packs.py is re-run in
check mode so a hand edit cannot survive, and then, separately, every
challenge card is read back off the committed page: its name, par, hint, its
finish card and its Find the bug row, and its board drawing turned back into
squares (the board's size from the viewBox, the start and its facing from the
marker's transform, the goal, every wall and every tunnel and its axis) and
compared with the pack file. A renderer that drew a wall on the wrong edge, or
a tunnel turned the wrong way, is caught by a reading that did not draw it.

THE CLAIMS ABOUT A DUCK ARE CHECKED AS CLAIMS, AND THE OFF SWITCH IS ONE. duck-studio
ships closed-loop Walk and Turn cards off for real ducks (duck-card-loop.json
`enabled_on_robot: false`) until they pass docs/PACKS.md "Acceptance". So every pack
page must say Studio's own sentence for that (`DuckCardLoop.offNote`, which the
extractor reads), that measured cards are being validated, and that the board is
played by people and in Studio; and no page may claim a measured bound about a duck
(no "Over N rows", no "ended within", no "never fell"). Every pack's duck_square_cm
must be the square the cards walk, with a duck_square_source. The pages print no
other centimetres than that square and the packs' floor squares. If the switch is
ever on, this gate fails until the pages are rewritten with the results.

The print arithmetic is read from the stylesheet that prints it: two activity
cards across and two down, on Letter and on A4.

PROVED ABLE TO FAIL: see the header of predeploy.sh.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tools/duckcards"))

import build_cards as bc  # noqa: E402
import build_packs as bp  # noqa: E402
from check_cards import css_mm, PAPER  # noqa: E402
from site_helpers import flatten, read_pages, section_markup  # noqa: E402

STUDIO_PACKS = "StudioKit/Sources/StudioKit/Resources/DuckPacks"
SITE_PACKS = pathlib.Path("public/cards/packs")
CSS = pathlib.Path("public/assets/site.css")
# Read on its own terms, not through the renderer's table: the marker's arrow
# points up the page before it is turned, so a turn of 90 degrees faces east.
FACING_OF = {0: "north", 90: "east", 180: "south", 270: "west"}
# The activity-set brand this format is modelled on is named in duck-studio's
# own notes and never on this site: the pages name the activity's shape.
NEVER = ("Learning Resources", "Code & Go", "Code &amp; Go", "Code and Go", "Code &amp;amp; Go")

fail: list[str] = []


def problem(text: str) -> None:
    fail.append(text)


def square(x: float, y: float) -> tuple[int, int]:
    return int((x - bp.M) // bp.S), int((y - bp.M) // bp.S)


def read_board(svg: str) -> dict:
    """The board a drawing shows, in the pack file's own terms."""
    box = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
    out: dict = {"walls": set(), "gates": set()}
    if box:
        out["columns"] = (int(box.group(1)) - 2 * bp.M) // bp.S
        out["rows"] = (int(box.group(2)) - 2 * bp.M) // bp.S
    start = re.findall(r'<g class="pk-start" transform="translate\((\d+) (\d+)\) rotate\((\d+)\)">', svg)
    if len(start) == 1:
        x, y, r = map(int, start[0])
        out["start"] = (square(x, y), FACING_OF.get(r))
    goal = re.findall(r'<circle class="pk-goal" cx="(\d+)" cy="(\d+)"', svg)
    if len(goal) == 1:
        out["goal"] = square(*map(int, goal[0]))
    for x1, y1, x2, y2 in re.findall(r'<path class="pk-wall" d="M(\d+) (\d+)L(\d+) (\d+)"/>', svg):
        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
        if x1 == x2:      # a vertical line: between the squares left and right of it
            a = square(x1 - 1, min(y1, y2) + 1)
            b = square(x1 + 1, min(y1, y2) + 1)
        else:             # a horizontal line: between the squares above and below it
            a = square(min(x1, x2) + 1, y1 - 1)
            b = square(min(x1, x2) + 1, y1 + 1)
        out["walls"].add(frozenset((a, b)))
    for x, y, r in re.findall(r'<g class="pk-gate" transform="translate\((\d+) (\d+)\) rotate\((\d+)\)">', svg):
        out["gates"].add((square(int(x), int(y)), {"0": "ew", "90": "ns"}.get(r)))
    out["wall_count"] = svg.count('class="pk-wall"')
    return out


def minis(markup: str) -> list[tuple[str, str]]:
    return re.findall(r'<span class="pk-mini dc-[a-z]+" data-code="([a-z_0-9]+)">.*?'
                      r'<span class="pk-mini-name">([^<]*)</span></span>', markup)


def text_of(markup: str) -> str:
    return flatten(markup)


def main() -> int:
    duck_studio = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                               os.environ.get("DUCK_STUDIO", pathlib.Path.home() / "projects/duck-studio"))
    kit = json.loads(bc.KIT.read_text(encoding="utf-8"))
    pinned = kit.get("packs") or {}

    # 1. The copies: the checkout's, the site's, and the extract's digests agree.
    theirs = {p.stem: p for p in (duck_studio / STUDIO_PACKS).glob("*.duckpack")}
    ours = {p.stem: p for p in SITE_PACKS.glob("*.duckpack")}
    if not theirs:
        problem(f"{duck_studio}/{STUDIO_PACKS} has no packs; check out duck-studio's duck-packs "
                "branch, or a main that has merged it")
    for stem in sorted(set(ours) - set(theirs)):
        problem(f"public/cards/packs/{stem}.duckpack has no twin in {STUDIO_PACKS}")
    for stem in sorted(set(theirs) - set(ours)):
        problem(f"{STUDIO_PACKS}/{stem}.duckpack is not on the site; copy it to public/cards/packs/")
    for stem in sorted(set(ours) & set(theirs)):
        if ours[stem].read_bytes() != theirs[stem].read_bytes():
            problem(f"public/cards/packs/{stem}.duckpack differs from the duck-studio checkout's; "
                    "copy it again, byte for byte")
    if "digests" not in pinned:
        problem("tools/kit-sentences.json pins no pack digests: "
                f"{pinned.get('missing', 'no packs section')}; run scripts/extract_kit_sentences.py")
    else:
        for stem, path in sorted(ours.items()):
            if pinned["digests"].get(stem) != hashlib.sha256(path.read_bytes()).hexdigest():
                problem(f"public/cards/packs/{stem}.duckpack is not the file the extract pinned at "
                        f"duck-studio {str(kit.get('duck_studio_commit'))[:7]}")
        for stem in sorted(set(pinned["digests"]) - set(ours)):
            problem(f"the extract pins {stem}.duckpack and the site does not serve it")
    if fail:
        return report()

    # 2. The packs themselves, played on the board, and no stale page.
    deck, _, tags = bc.load()
    try:
        packs = bp.load_packs()
        fm = bp.measurement()
    except bp.PackError as why:
        problem(str(why))
        return report()
    if fm["enabled_on_robot"]:
        problem(f"duck-studio turned measured cards on for a duck (validated: {fm.get('validated')!r}); "
                "these pages say they are timed, so rewrite them, and this gate, with the results")
        return report()
    for pack in packs:
        for text in bp.check_pack(pack, deck):
            problem(text)
    if fail:
        return report()
    for path in bp.stale(deck, *bc.load()[1:]):
        problem(f"{path} is not what build_packs.py draws today; run "
                "python3 tools/duckcards/build_packs.py")

    # 3. Every pack page, read back.
    cards = bc.by_code(deck)
    duck_cm = fm["duck_square_cm"]
    challenge_count = 0
    for pack in packs:
        pid = pack["id"]
        name = f"public/cards/packs/{pid}/index.html"
        page = pathlib.Path(name).read_text(encoding="utf-8")
        flat = flatten(page)
        h1 = re.findall(r"<h1[^>]*>([^<]*)</h1>", page)
        if h1 != [bp.esc(pack["name"])]:
            problem(f"{name} is headed {h1}, not {pack['name']!r}")
        if f"Grades {pack['grades']}" not in flat:
            problem(f"{name} does not say the pack is for grades {pack['grades']}")
        if f'href="/cards/packs/{pid}.duckpack" download' not in page:
            problem(f"{name} has no download link to its own pack file")
        if f'href="/cards/packs/{pid}/print/"' not in page:
            problem(f"{name} does not link its cut sheet")

        # The cards in play, as drawn cards.
        grid = section_markup({name: page}, "cards")
        drawn = re.findall(r'<article class="dc [^"]*" data-tag="\d+" data-code="([a-z_0-9]+)"', grid)
        playing = [c for c in deck["cards"] if c["code"] in pack["cards"]]
        blanks = [c["code"] for c in playing if c["kind"] == "yours"]
        want = [c["code"] for c in playing if c["kind"] != "yours" or c["code"] == (blanks or [None])[0]]
        if drawn != want:
            problem(f"{name} draws the cards {drawn} in play; the pack plays {want}")
        if blanks and f"stands for {bp.word(len(blanks))} blank cards" not in flatten(grid):
            problem(f"{name} does not say how many blank cards its one Your card stands for")
        for y in pack.get("yours", []):
            if y["name"] not in flatten(grid) or y["does"] not in flatten(grid):
                problem(f"{name} does not show the pack's Your card {y['name']!r} and what it does")

        # The score.
        rule = "Fewest steps wins." if pack["score"] == "steps" else "Fewest cards wins."
        if rule not in flat:
            problem(f"{name} does not say {rule!r}, and the pack scores by {pack['score']}")

        # Every challenge card.
        articles = re.findall(r'<article class="pk-card[^"]*" id="([a-z0-9-]+)">(.*?)</article>', page, flags=re.S)
        if [a for a, _ in articles] != [c["id"] for c in pack["challenges"]]:
            problem(f"{name} shows the challenges {[a for a, _ in articles]}, not the pack's, in order")
            continue
        for (cid, body), ch in zip(articles, pack["challenges"]):
            challenge_count += 1
            where = f"{name} #{cid}"
            got = text_of(body)
            title = re.search(r"<h3>([^<]*)</h3>", body)
            if not title or flatten(title.group(1)) != ch["name"]:
                problem(f"{where} is named {title and title.group(1)!r}, not {ch['name']!r}")
            par = re.search(r'<p class="pk-par">Par <b>(\d+)</b> (steps|cards)</p>', body)
            if not par or int(par.group(1)) != ch["par"] or par.group(2) != bp.unit(pack):
                problem(f"{where} prints par {par and par.groups()}, and the pack says "
                        f"{ch['par']} {bp.unit(pack)}")
            if ch["hint"] not in got:
                problem(f"{where} does not carry its hint word for word")
            notes = [flatten(n) for n in re.findall(r'<p class="pk-note">(.*?)</p>', body, flags=re.S)]
            if ch.get("note") and notes != [ch["note"]]:
                problem(f"{where} shows the note {notes}, not the challenge's {ch['note']!r}")
            elif not ch.get("note") and notes:
                problem(f"{where} shows a note {notes} the challenge does not carry")
            svg = re.search(r'<svg class="pk-board".*?</svg>', body, flags=re.S)
            if not svg:
                problem(f"{where} has no board drawing")
                continue
            board = read_board(svg.group(0))
            cols, rows = bp.size(pack, ch)
            if (board.get("columns"), board.get("rows")) != (cols, rows):
                problem(f"{where} draws a {board.get('columns')} by {board.get('rows')} board; "
                        f"the pack's is {cols} by {rows}")
            if board.get("start") != (tuple(ch["start"]["at"]), ch["start"]["facing"]):
                problem(f"{where} draws the start at {board.get('start')}; the pack says "
                        f"{ch['start']['at']} facing {ch['start']['facing']}")
            if board.get("goal") != tuple(ch["goal"]):
                problem(f"{where} draws the goal at {board.get('goal')}; the pack says {ch['goal']}")
            walls = {frozenset(map(tuple, w["between"])) for w in ch.get("walls", [])}
            if board["walls"] != walls or board["wall_count"] != len(walls):
                problem(f"{where} draws walls {sorted(map(sorted, board['walls']))}; the pack has "
                        f"{sorted(map(sorted, walls))}")
            gates = {(tuple(g["at"]), g["axis"]) for g in ch.get("gates", [])}
            if board["gates"] != gates:
                problem(f"{where} draws tunnels {sorted(board['gates'])}; the pack has {sorted(gates)}")
            finish = re.search(r'<div class="pk-finish">(.*?)</div>', body, flags=re.S)
            if ch.get("finish_with"):
                shown = minis(finish.group(1)) if finish else []
                if [c for c, _ in shown] != [ch["finish_with"]] or \
                        shown[0][1] != cards[ch["finish_with"]]["name"]:
                    problem(f"{where} shows the finish card {shown}, not {ch['finish_with']!r}")
            elif finish:
                problem(f"{where} shows a finish card the challenge does not name")
            bug = re.search(r'<div class="pk-bug">(.*?)</div>', body, flags=re.S)
            if ch.get("buggy") is not None:
                shown = minis(bug.group(1)) if bug else []
                want_row = []
                for entry in ch["buggy"]:
                    label = bp.yours_of(pack).get(entry["card"], {}).get("name") or cards[entry["card"]]["name"]
                    want_row.append((entry["card"], f"{label} {entry['times']}" if "times" in entry else label))
                    want_row += [(u, cards[u]["name"]) for u in entry.get("under", [])]
                if shown != want_row:
                    problem(f"{where} draws the Find the bug row {shown}; the pack's is {want_row}")
                if "Find the bug." not in got:
                    problem(f"{where} carries a buggy row and does not say Find the bug")
            elif bug:
                problem(f"{where} shows a Find the bug row the challenge does not have")

        # The lessons, word for word.
        for lesson in pack["lessons"]:
            for key in ("title", "skill", "body"):
                if lesson[key] not in flat:
                    problem(f"{name} does not carry the lesson {lesson['title']!r}'s {key} word for word")
            if lesson["ask"][1:] not in flat:
                problem(f"{name} does not ask {lesson['ask']!r}")

        # The cut sheet: the cards in play, every one, each ticked, nothing else.
        sheet_name = f"public/cards/packs/{pid}/print/index.html"
        sheet = pathlib.Path(sheet_name).read_text(encoding="utf-8")
        on_sheet = re.findall(r'<article class="dc [^"]*" data-tag="\d+" data-code="([a-z_0-9]+)"', sheet)
        if on_sheet != [c["code"] for c in playing]:
            problem(f"{sheet_name} prints {len(on_sheet)} cards; the pack plays {len(playing)}, "
                    "and the cut sheet is every one of them, in deck order, and no other")
        for card in playing:
            tick = re.search(rf'<input type="checkbox" id="pick-{card["tag"]}"([^>]*)>', sheet)
            if not tick or "checked" not in tick.group(1).split():
                problem(f"{sheet_name}: {card['code']} has no ticked box")
        if f"The {bp.word(len(playing))} cards this pack plays with" not in flatten(sheet):
            problem(f"{sheet_name} miscounts the cards it prints")

    # 4. What the pages say about a duck, against the measurement and the files.
    pages = read_pages()
    pack_pages = {n: t for n, t in pages.items() if n.startswith("public/cards/packs/")
                  and not n.endswith("/print/index.html")}
    squares = {p["board"]["square_cm"] for p in packs}
    for pack in packs:
        if pack["board"].get("duck_square_cm") != duck_cm or not pack["board"].get("duck_square_source"):
            problem(f"pack {pack['id']!r} says a duck square is {pack['board'].get('duck_square_cm')!r} cm "
                    f"from {pack['board'].get('duck_square_source')!r}; the cards walk {duck_cm:g} cm")
    allowed_cm = {f"{v:g}" for v in squares} | {f"{duck_cm:g}"}
    # Written here from the extract, not borrowed from the renderer: a page is held to what
    # duck-studio says, not to whatever build_packs.py printed.
    for name, text in pack_pages.items():
        flat = flatten(text)
        for sentence in ("One Walk card moves the duck one square.",
                         "One Turn card is a quarter turn, where it stands.",
                         fm["off_note"],
                         f"Measured cards walk until the duck's own odometry says one {duck_cm:g} cm square",
                         "They are being validated",
                         "So for now the board is played by people and in Studio"):
            if sentence not in flat:
                problem(f"{name} does not say {sentence!r}")
        for claim in re.findall(r"Over \d+ rows|ended within|never fell|within \d+(?:\.\d+)? degrees",
                                flat):
            problem(f"{name} claims {claim!r} about a duck, and measured cards are off for real ducks")
        for cm in re.findall(r"(\d+(?:\.\d+)?) ?cm\b", flat):
            if cm not in allowed_cm:
                problem(f"{name} prints {cm} cm, which is neither a pack's floor square nor the "
                        f"square the cards walk ({sorted(allowed_cm)})")
    for name, text in pages.items():
        for brand in NEVER:
            if brand in text:
                problem(f"{name} names {brand!r}; name the activity's shape, not the brand")
    index = pages.get(bp.INDEX, "")
    order = re.findall(r'<h3><a href="/cards/packs/([a-z0-9-]+)/">', index)
    youngest = [p["id"] for p in sorted(packs, key=lambda p: (p["grade_from"], p["grade_to"]))]
    if order != youngest:
        problem(f"{bp.INDEX} lists {order}; youngest first is {youngest}")
    if "modelled on floor-robot coding sets" not in flatten(index):
        problem(f"{bp.INDEX} no longer says what packs are modelled on")
    if 'href="/cards/packs/"' not in pages.get("public/cards/index.html", ""):
        problem("public/cards/index.html does not link the packs")

    # 5. The activity cards' print arithmetic, from the stylesheet.
    css = CSS.read_text(encoding="utf-8")
    width = css_mm(css, ".pk-pack-page .pk-cards > li", "width")
    height = css_mm(css, ".pk-pack-page .pk-cards > li", "height")
    row = css_mm(css, ".pk-pack-page .pk-cards", "width")
    margin = css_mm(css, "@page", "margin")
    if None in (width, height, row, margin):
        problem("site.css no longer sizes the activity cards in millimetres where this gate reads it")
    else:
        if row != 2 * width:
            problem(f"the activity cards print in a row {row} mm wide, which is not two cards")
        for paper, (pw, ph) in PAPER.items():
            if row > pw - 2 * margin:
                problem(f"two activity cards across do not fit on {paper} inside a {margin} mm margin")
            if int((ph - 2 * margin) // height) != 2:
                problem(f"{paper} holds {int((ph - 2 * margin) // height)} rows of activity cards, not two")
    for name in pack_pages:
        if name != bp.INDEX and "four to a sheet" not in flatten(pages[name]):
            problem(f"{name} no longer says how the challenges print; check what it says instead")

    if fail:
        return report()
    print(f"check_packs: {len(packs)} packs byte for byte with duck-studio "
          f"{str(kit.get('duck_studio_commit'))[:7]}, {challenge_count} challenge cards read back "
          f"square by square, every par played on the board, {len(pages)} pages free of the brand, "
          f"a {duck_cm:g} cm duck square with measured cards off for a duck, as duck-studio says, "
          f"and four activity cards to a sheet on Letter and A4")
    return 0


def report() -> int:
    for text in fail:
        print("check_packs: " + text, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
