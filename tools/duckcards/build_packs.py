#!/usr/bin/env python3
"""Draw the Duck Card packs into their pages.

    python3 tools/duckcards/build_packs.py           # write every pack page
    python3 tools/duckcards/build_packs.py --check   # exit 1 if any page is stale

A PACK PAGE IS DRAWN, NEVER TYPED. public/cards/packs/<id>.duckpack is a byte
identical copy of a pack StudioKit bundles (scripts/check_packs.py holds it to
the duck-studio checkout). Everything a pack page says about that pack, its
grades, cards, board, pars, hints and lessons, is read out of that file here.
The cards are drawn by build_cards.py's own card_html, so a card on a pack page
is the card on the deck page.

FOUR INPUTS. The packs, the deck (public/cards/duck-cards.json), the extract
(tools/kit-sentences.json, for Studio's words, the pad, and the first card-size
measurement) and the AprilTag table. Run the extractor first.

WHAT IT WRITES. Two whole pages per pack, /cards/packs/<id>/ and its cut sheet
/cards/packs/<id>/print/, and two regions of /cards/packs/index.html, between
DUCKPACKS markers: the list of packs and the board rule. The pages are
committed, like the rest of public/; check_packs.py re-renders them and fails
the deploy when a committed page differs.

THE BOARD IS PLAYED HERE TOO. check_pack plays every solution and every buggy
row by the board rule and searches every steps par, so a pack whose printed par
is wrong cannot be drawn. It is a second reading of the rule in duck-studio's
docs/PACKS.md, written without looking at either reader there.
"""

from __future__ import annotations

import hashlib
import html
import json
import pathlib
import re
import sys
from collections import deque

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import build_cards as bc  # noqa: E402

PACKS = ROOT / "public/cards/packs"
INDEX = "public/cards/packs/index.html"
CSS = ROOT / "public/assets/site.css"
SITE = "https://microduckstudio.com"

FACINGS = ("north", "east", "south", "west")
AHEAD = {"north": (0, -1), "east": (1, 0), "south": (0, 1), "west": (-1, 0)}
MOVES = ("walk_forward", "walk_backward", "turn_left", "turn_right")
FACING_WORDS = {"north": "up the page", "east": "to the right", "south": "down the page",
                "west": "to the left"}
ROTATE = {"north": 0, "east": 90, "south": 180, "west": 270}
WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
         "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
         "eighteen", "nineteen", "twenty"]

# The board drawing, in SVG units: a square is S across, with M around the board.
S, M = 10, 4


class PackError(Exception):
    pass


def esc(text) -> str:
    return html.escape(str(text), quote=True)


def word(n: int) -> str:
    return WORDS[n] if 0 <= n < len(WORDS) else str(n)


# --------------------------------------------------------------------------
# inputs
# --------------------------------------------------------------------------

def load_packs() -> list[dict]:
    """Every pack on the site, youngest grade band first."""
    packs = []
    for path in sorted(PACKS.glob("*.duckpack")):
        try:
            pack = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as why:
            raise PackError(f"{path.name} is not JSON: {why}") from None
        pack["_file"] = path.name
        packs.append(pack)
    if not packs:
        raise PackError("public/cards/packs/ has no .duckpack files")
    return sorted(packs, key=lambda p: (p.get("grade_from", 99), p.get("grade_to", 99), p["id"]))


def measurement() -> dict:
    """The closed-loop cards' off switch the extractor read out of duck-studio
    (duck-card-loop.json and `DuckCardLoop.offNote`): whether measured cards are on for a duck,
    the square they walk, and the sentence said while they are off. The pack pages quote these
    and claim no measured bound about a duck."""
    kit = json.loads(bc.KIT.read_text(encoding="utf-8"))
    packs = kit.get("packs") or {}
    if "closed_loop" not in packs or "off_note" not in packs["closed_loop"]:
        raise PackError("tools/kit-sentences.json has no packs.closed_loop off switch; run "
                        "scripts/extract_kit_sentences.py against a duck-studio with packs "
                        f"({packs.get('missing', 'no packs section')})")
    return packs["closed_loop"]


def duck_sentences(fm: dict) -> list[str]:
    """What every pack page says about a duck, built from the off switch and nothing else.
    check_packs.py looks for each, word for word. Written for the switch OFF: if duck-studio
    turns measured cards on, these are rewritten with the results that turned them on."""
    if fm["enabled_on_robot"]:
        raise PackError("duck-studio says measured cards are on for a duck (validated: "
                        f"{fm.get('validated')!r}); the pack pages say they are timed, so rewrite them first")
    return [
        fm["off_note"],
        f"Measured cards walk until the duck's own odometry says one {fm['duck_square_cm']:g} cm "
        "square and turn until it says a quarter turn. They are being validated, in Pollen's "
        "simulator and then on testers' ducks, before they are switched on.",
        "So for now the board is played by people and in Studio, and a duck beside it is a trial.",
    ]


def css_version() -> str:
    return hashlib.sha256(CSS.read_bytes()).hexdigest()[:10]


# --------------------------------------------------------------------------
# the board rule
# --------------------------------------------------------------------------

def size(pack: dict, ch: dict) -> tuple[int, int]:
    return ch.get("columns", pack["board"]["columns"]), ch.get("rows", pack["board"]["rows"])


def yours_of(pack: dict) -> dict[str, dict]:
    return {y["code"]: y for y in pack.get("yours", [])}


def steps_of(row: list[dict], pack: dict, cards: dict[str, dict], depth: int = 0) -> tuple[list[str], int]:
    """The board steps a saved row makes, and how many Repeats it left open.

    A step is a card code. Repeat to End repeat runs `times` times; a Repeat
    never closed runs to the end of the row. A Your card is its own row. When
    it falls starts a row the board does not play. Start, End and a card that
    only goes under another make no step.
    """
    if depth > 4:
        raise PackError("a Your card opens itself")
    yours = yours_of(pack)
    root: list = []
    stack: list[tuple[list, int]] = [(root, 1)]
    for entry in row:
        code = entry["card"]
        if code == "when_falls":
            break
        if code == "repeat":
            stack.append(([], entry.get("times", 1)))
        elif code == "end_repeat":
            if len(stack) > 1:
                body, times = stack.pop()
                stack[-1][0].append(("loop", body, times))
        else:
            stack[-1][0].append(("card", entry))
    unclosed = len(stack) - 1
    while len(stack) > 1:
        body, times = stack.pop()
        stack[-1][0].append(("loop", body, times))

    out: list[str] = []

    def run(nodes: list) -> None:
        for node in nodes:
            if node[0] == "loop":
                for _ in range(node[2]):
                    run(node[1])
                continue
            code = node[1]["card"]
            if code in yours:
                inner, _ = steps_of(yours[code]["row"], pack, cards, depth + 1)
                out.extend(inner)
            elif cards.get(code, {}).get("kind") == "action":
                out.append(code)

    run(root)
    return out, unclosed


def card_count(row: list[dict]) -> int:
    return sum(1 + len(entry.get("under", [])) for entry in row)


def action_of(code: str, cards: dict[str, dict]) -> str | None:
    return (cards.get(code, {}).get("plan") or {}).get("action")


def walk(ch: dict, cols: int, rows: int, at: tuple, way: tuple) -> tuple | None:
    to = (at[0] + way[0], at[1] + way[1])
    if not (0 <= to[0] < cols and 0 <= to[1] < rows):
        return None
    walls = {frozenset(map(tuple, w["between"])) for w in ch.get("walls", [])}
    return None if frozenset((at, to)) in walls else to


def gates_at(ch: dict, to: tuple, way: tuple) -> set[int]:
    axis = "ns" if way[0] == 0 else "ew"
    return {k for k, g in enumerate(ch.get("gates", [])) if tuple(g["at"]) == to and g["axis"] == axis}


def play(pack: dict, ch: dict, row: list[dict], cards: dict[str, dict]) -> tuple[bool, int]:
    """(solved, score) for a row on a challenge, by the board rule."""
    cols, rows = size(pack, ch)
    steps, unclosed = steps_of(row, pack, cards)
    at, facing = tuple(ch["start"]["at"]), ch["start"]["facing"]
    passed: set[int] = set()
    for code in steps:
        action = action_of(code, cards)
        if action in ("walk_forward", "walk_backward"):
            dx, dy = AHEAD[facing]
            way = (dx, dy) if action == "walk_forward" else (-dx, -dy)
            to = walk(ch, cols, rows, at, way)
            if to is None:
                return False, 0
            at = to
            passed |= gates_at(ch, at, way)
        elif action in ("turn_left", "turn_right"):
            facing = FACINGS[(FACINGS.index(facing) + (1 if action == "turn_right" else -1)) % 4]
    finished = ch.get("finish_with") is None or (bool(steps) and steps[-1] == ch["finish_with"])
    solved = (bool(steps) and at == tuple(ch["goal"]) and len(passed) == len(ch.get("gates", []))
              and finished and not unclosed)
    return solved, len(steps) if pack["score"] == "steps" else card_count(row)


def search_par(pack: dict, ch: dict) -> int | None:
    """The fewest board steps, searching (square, facing, gates passed) breadth first."""
    cols, rows = size(pack, ch)
    moves = [m for m in MOVES if m in pack["cards"]]
    full = (1 << len(ch.get("gates", []))) - 1
    first = (tuple(ch["start"]["at"]), ch["start"]["facing"], 0)
    seen, todo = {first: 0}, deque([first])
    while todo:
        state = todo.popleft()
        at, facing, mask = state
        if at == tuple(ch["goal"]) and mask == full:
            return seen[state] + (0 if ch.get("finish_with") is None else 1)
        for move in moves:
            if move.startswith("turn"):
                turned = FACINGS[(FACINGS.index(facing) + (1 if move == "turn_right" else -1)) % 4]
                nxt = (at, turned, mask)
            else:
                dx, dy = AHEAD[facing]
                way = (dx, dy) if move == "walk_forward" else (-dx, -dy)
                to = walk(ch, cols, rows, at, way)
                if to is None:
                    continue
                nxt = (to, facing, mask | sum(1 << k for k in gates_at(ch, to, way)))
            if nxt not in seen:
                seen[nxt] = seen[state] + 1
                todo.append(nxt)
    return None


def check_pack(pack: dict, deck: dict) -> list[str]:
    """What a pack page relies on. check_packs.py runs this too."""
    problems = []
    cards = bc.by_code(deck)
    label = f"pack {pack.get('id')!r}"
    if pack.get("format") != "duck-pack/0":
        problems.append(f"{label} has format {pack.get('format')!r}, not duck-pack/0")
    if pack.get("_file") != f"{pack.get('id')}.duckpack":
        problems.append(f"{label} is in {pack.get('_file')}, not named for its id")
    if pack.get("vocabulary") != deck["vocabulary"]:
        problems.append(f"{label} says vocabulary {pack.get('vocabulary')!r}; the deck's is "
                        f"{deck['vocabulary']!r}")
    for code in pack.get("cards", []):
        if code not in cards:
            problems.append(f"{label} puts {code!r} in play, which is not a card")
        elif not cards[code]["printed"]:
            problems.append(f"{label} puts {code!r} in play, and the deck does not print it")
    if not {"start", "end"} <= set(pack.get("cards", [])):
        problems.append(f"{label} leaves Start or End out of play")
    if pack.get("score") not in ("steps", "cards"):
        problems.append(f"{label} is scored by {pack.get('score')!r}")
    board = pack.get("board", {})
    try:
        square = measurement()["duck_square_cm"]
    except PackError:
        square = None
    if board.get("duck_square_cm") != square:
        problems.append(f"{label} says a duck square is {board.get('duck_square_cm')!r} cm; the "
                        f"closed-loop measurement in docs/PACKS.md says {square!r}")
    source = board.get("duck_square_source")
    if square is not None and (not isinstance(source, str) or not source.strip()):
        problems.append(f"{label} carries a duck square with no duck_square_source saying where it "
                        "was measured")
    if not 3 <= len(pack.get("lessons", [])) <= 6:
        problems.append(f"{label} has {len(pack.get('lessons', []))} lessons, not 3 to 6")
    text = json.dumps(pack, ensure_ascii=False)
    if "\N{EM DASH}" in text or "\N{EN DASH}" in text:
        problems.append(f"{label} carries an em or en dash")
    seen = set()
    for n, ch in enumerate(pack.get("challenges", []), start=1):
        where = f"{label} challenge {ch.get('id')!r}"
        if ch.get("id") in seen:
            problems.append(f"{where} appears twice")
        seen.add(ch.get("id"))
        cols, rows = size(pack, ch)
        squares = [ch["start"]["at"], ch["goal"]] + [g["at"] for g in ch.get("gates", [])] + \
            [sq for w in ch.get("walls", []) for sq in w["between"]]
        if any(not (0 <= x < cols and 0 <= y < rows) for x, y in squares):
            problems.append(f"{where} has a square off its {cols} by {rows} board")
            continue
        for w in ch.get("walls", []):
            (ax, ay), (bx, by) = w["between"]
            if abs(ax - bx) + abs(ay - by) != 1:
                problems.append(f"{where} has a wall between squares that share no edge")
        used = [e["card"] for r in (ch["solution"], ch.get("buggy") or []) for e in r] + \
            [u for r in (ch["solution"], ch.get("buggy") or []) for e in r for u in e.get("under", [])]
        for code in used:
            if code not in pack["cards"]:
                problems.append(f"{where} lays {code!r}, which is not in play")
        if ch.get("finish_with") and ch["finish_with"] not in pack["cards"]:
            problems.append(f"{where} finishes with {ch['finish_with']!r}, not in play")
        try:
            solved, score = play(pack, ch, ch["solution"], cards)
        except PackError as why:
            problems.append(f"{where}: {why}")
            continue
        if not solved:
            problems.append(f"{where}: its own solution does not solve it on the board")
        elif score != ch["par"]:
            problems.append(f"{where}: its solution scores {score} {pack['score']} and par says "
                            f"{ch['par']}")
        if pack["score"] == "steps":
            best = search_par(pack, ch)
            if best != ch["par"]:
                problems.append(f"{where}: par is {ch['par']} and the fewest steps on the board "
                                f"is {best}")
        if ch.get("buggy") is not None and play(pack, ch, ch["buggy"], cards)[0]:
            problems.append(f"{where}: its Find the bug row solves it")
    return problems


# --------------------------------------------------------------------------
# drawing a board
# --------------------------------------------------------------------------

def centre(sq) -> tuple[int, int]:
    return M + sq[0] * S + S // 2, M + sq[1] * S + S // 2


def place_words(sq) -> str:
    return f"column {sq[0] + 1}, row {sq[1] + 1}"


def board_words(pack: dict, ch: dict, cards: dict[str, dict]) -> str:
    cols, rows = size(pack, ch)
    start, goal = ch["start"], ch["goal"]
    said = [f"A {cols} by {rows} board, columns counted from the left and rows from the top.",
            f"The duck starts in {place_words(start['at'])}, facing {FACING_WORDS[start['facing']]}."]
    said.append("The goal is the start square: the duck comes home." if goal == start["at"]
                else f"The goal is in {place_words(goal)}.")
    walls = ch.get("walls", [])
    if walls:
        said.append("Walls between " + "; ".join(
            f"{place_words(a)} and {place_words(b)}" for a, b in (w["between"] for w in walls)) + ".")
    else:
        said.append("No walls.")
    for g in ch.get("gates", []):
        way = "across the board" if g["axis"] == "ew" else "up or down the board"
        said.append(f"A tunnel in {place_words(g['at'])}, walked through {way}.")
    return " ".join(said)


def board_svg(pack: dict, ch: dict, cards: dict[str, dict]) -> str:
    cols, rows = size(pack, ch)
    w, h = cols * S + 2 * M, rows * S + 2 * M
    parts = [f'<svg class="pk-board" viewBox="0 0 {w} {h}" role="img" '
             f'aria-label="{esc(board_words(pack, ch, cards))}">',
             f'<rect class="pk-ground" x="{M}" y="{M}" width="{cols * S}" height="{rows * S}"/>']
    grid = "".join(f"M{M + x * S} {M}V{M + rows * S}" for x in range(1, cols)) + \
        "".join(f"M{M} {M + y * S}H{M + cols * S}" for y in range(1, rows))
    if grid:
        parts.append(f'<path class="pk-grid" d="{grid}"/>')
    for g in ch.get("gates", []):
        x, y = centre(g["at"])
        parts.append(f'<g class="pk-gate" transform="translate({x} {y}) rotate({0 if g["axis"] == "ew" else 90})">'
                     '<rect x="-4.6" y="-3.2" width="9.2" height="6.4"/>'
                     '<path d="M-4.6 -3.2H4.6M-4.6 3.2H4.6"/></g>')
    gx, gy = centre(ch["goal"])
    parts.append(f'<circle class="pk-goal" cx="{gx}" cy="{gy}" r="3.9"/>')
    sx, sy = centre(ch["start"]["at"])
    parts.append(f'<g class="pk-start" transform="translate({sx} {sy}) rotate({ROTATE[ch["start"]["facing"]]})">'
                 '<circle r="2.6"/><path d="M-2 -1.7 0 -4.6 2 -1.7z"/></g>')
    for wall in ch.get("walls", []):
        (ax, ay), (bx, by) = wall["between"]
        if ay == by:
            x = M + max(ax, bx) * S
            d = f"M{x} {M + ay * S}L{x} {M + ay * S + S}"
        else:
            y = M + max(ay, by) * S
            d = f"M{M + ax * S} {y}L{M + ax * S + S} {y}"
        parts.append(f'<path class="pk-wall" d="{d}"/>')
    parts.append(f'<rect class="pk-edge" x="{M}" y="{M}" width="{cols * S}" height="{rows * S}"/>')
    parts.append("</svg>")
    return "".join(parts)


KEY = ('<p class="pk-key" aria-hidden="true">'
       '<span><svg viewBox="-5 -5 10 10"><g class="pk-start"><circle r="2.6"/>'
       '<path d="M-2 -1.7 0 -4.6 2 -1.7z"/></g></svg>Start, facing the arrow</span>'
       '<span><svg viewBox="-5 -5 10 10"><circle class="pk-goal" r="3.9"/></svg>Goal</span>'
       '<span><svg viewBox="-5 -5 10 10"><path class="pk-wall" d="M0 -4.5V4.5"/></svg>Wall</span>'
       '<span><svg viewBox="-5 -5 10 10"><g class="pk-gate"><rect x="-4.6" y="-3.2" width="9.2" '
       'height="6.4"/><path d="M-4.6 -3.2H4.6M-4.6 3.2H4.6"/></g></svg>Tunnel, walk it the '
       'long way</span></p>')


# --------------------------------------------------------------------------
# small cards, for a row on an activity card
# --------------------------------------------------------------------------

def mini(code: str, pack: dict, deck: dict, times: int | None = None) -> str:
    card = bc.by_code(deck)[code]
    yours = yours_of(pack).get(code)
    name = yours["name"] if yours else card["name"]
    if times is not None:
        name = f"{name} {times}"
    art = (f'<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
           f'<use href="#dc-i-{esc(card["art"])}"></use></svg>') if card.get("art") else \
        f'<span class="pk-mini-num" aria-hidden="true">{card["tag"]}</span>'
    return (f'<span class="pk-mini dc-{esc(card["category"])}" data-code="{esc(code)}">'
            f'{art}<span class="pk-mini-name">{esc(name)}</span></span>')


def mini_row(row: list[dict], pack: dict, deck: dict, label: str) -> str:
    items = []
    for entry in row:
        under = "".join(mini(u, pack, deck) for u in entry.get("under", []))
        items.append(f'<li>{mini(entry["card"], pack, deck, entry.get("times"))}{under}</li>')
    return f'<ol class="pk-row" aria-label="{esc(label)}">{"".join(items)}</ol>'


# --------------------------------------------------------------------------
# the words a pack page says
# --------------------------------------------------------------------------

def grades(pack: dict) -> str:
    return f"Grades {pack['grades']}"


def unit(pack: dict) -> str:
    return "steps" if pack["score"] == "steps" else "cards"


def most_laid(pack: dict, deck: dict) -> tuple[int, str, str]:
    """The most of one card any of the pack's own rows lays: (count, card name, challenge)."""
    names = {c["code"]: c["name"] for c in deck["cards"]}
    best = (0, "", "")
    for ch in pack["challenges"]:
        for row in (ch["solution"], ch.get("buggy") or []):
            laid: dict[str, int] = {}
            for entry in row:
                for code in [entry["card"], *entry.get("under", [])]:
                    laid[code] = laid.get(code, 0) + 1
            for code, n in laid.items():
                if n > best[0]:
                    best = (n, names[code], ch["name"])
    return best


def in_play(pack: dict, deck: dict) -> list[dict]:
    """The pack's cards in deck order, the order the cut sheet prints them."""
    return [c for c in deck["cards"] if c["code"] in pack["cards"]]


def board_line(pack: dict) -> str:
    b = pack["board"]
    sizes = {size(pack, ch) for ch in pack["challenges"]}
    if sizes == {(b["columns"], b["rows"])}:
        return f'{b["columns"]} by {b["rows"]} board'
    return f'boards up to {max(c for c, _ in sizes)} by {max(r for _, r in sizes)}'


def copies_html(pack: dict, deck: dict) -> str:
    most, card, where = most_laid(pack, deck)
    sheet = f'<a href="/cards/packs/{pack["id"]}/print/">this pack\'s cut sheet</a>'
    if most > 1:
        stop = "" if where[-1:] in "?!." else "."
        return (f"Only these. The pack's own rows lay up to {word(most)} of one card: "
                f"{word(most)} {esc(card)} cards in {esc(where)}{stop} Print {sheet} once for "
                f"each group, then untick every card but {esc(card)} and print it again until "
                f"each group has {word(most)}.")
    return (f"Only these. The pack's own rows never lay the same card twice, so one copy of "
            f"{sheet} for each group covers them.")


def score_html(pack: dict, deck: dict) -> str:
    repeat = "repeat" in pack["cards"]
    if pack["score"] == "steps":
        lead = ("<p><strong>Fewest steps wins.</strong> Every card the duck does is one step: "
                "each Walk card, each Turn card, and a card like Hello at the end."
                + (" A card inside a Repeat counts every time round." if repeat else "")
                + "</p><p>Par is the fewest steps any row can take. It is worked out by trying "
                "every path on the board, so nobody can beat it.</p>")
    else:
        lead = ("<p><strong>Fewest cards wins.</strong> Count every card between Start and End: "
                "Repeat and End repeat, and every card under another. A Your card is one card. "
                "This is where a loop pays off.</p><p>Par is the shortest row the pack's author "
                "found. If your class finds a shorter one, the par was wrong, not the class.</p>")
    rule = ("<p>A row solves a challenge when the duck ends on the goal, has walked through every "
            "tunnel the long way, and has not bumped into a wall or the edge of the board. When a "
            "challenge names a card to finish with, that card is last."
            + (" Every Repeat needs its End repeat." if repeat else "") + "</p>")
    return lead + rule


def sizing_html(packs: list[dict], fm: dict) -> str:
    squares = sorted({p["board"]["square_cm"] for p in packs})
    cm = " or ".join(f"{s:g} cm" for s in squares)
    timed, measured, trial = duck_sentences(fm)
    return (
        '<div class="feature-grid pk-sizing">'
        '<div class="card"><h3>The board rule</h3><p>One Walk card moves the duck one square. '
        'One Turn card is a quarter turn, where it stands. That is the rule on paper and in '
        'Studio, and every par is counted by it.</p></div>'
        f'<div class="card"><h3>A real duck</h3><p>{esc(timed)} {esc(trial)}</p></div>'
        f'<div class="card"><h3>Measured cards</h3><p>{esc(measured)}</p></div>'
        f'<div class="card"><h3>Squares for people</h3><p>Tape the board on the floor in {cm} '
        'squares, so a student playing the duck can stand in one. Or draw it on squared paper and '
        'walk a finger.</p></div></div>')


def activity_card(pack: dict, ch: dict, n: int, deck: dict) -> str:
    cards = bc.by_code(deck)
    total = len(pack["challenges"])
    extra = " pk-card-row" if ch.get("buggy") is not None else ""
    parts = [f'<li><article class="pk-card{extra}" id="{esc(ch["id"])}">',
             '<header class="pk-card-head">',
             f'<p class="pk-num">{esc(pack["name"])} {n} of {total}</p>',
             f'<h3>{esc(ch["name"])}</h3>',
             f'<p class="pk-par">Par <b>{ch["par"]}</b> {unit(pack)}</p></header>',
             f'<div class="pk-board-box">{board_svg(pack, ch, cards)}</div>',
             f'<p class="pk-hint">{esc(ch["hint"])}</p>']
    if ch.get("note"):
        parts.append(f'<p class="pk-note">{esc(ch["note"])}</p>')
    if ch.get("finish_with"):
        parts.append(f'<div class="pk-finish"><p>Finish with</p>'
                     f'{mini(ch["finish_with"], pack, deck)}</div>')
    if ch.get("buggy") is not None:
        parts.append('<div class="pk-bug"><p><strong>Find the bug.</strong> This row, between '
                     'Start and End, does not solve it. Swap one card to fix it.</p>'
                     f'{mini_row(ch["buggy"], pack, deck, "The row with a bug in it")}</div>')
    parts.append(KEY)
    parts.append(f'<p class="pk-credit">{esc(grades(pack))}. Duck Cards, CC BY 4.0, '
                 'microduckstudio.com</p>')
    parts.append("</article></li>")
    return "".join(parts)


def lessons_html(pack: dict) -> str:
    items = []
    for lesson in pack["lessons"]:
        items.append(f'<div class="card"><p class="eyebrow">{esc(lesson["skill"])}</p>'
                     f'<h3>{esc(lesson["title"])}</h3><p>{esc(lesson["body"])}</p>'
                     f'<p class="dc-ask">Ask: {esc(lesson["ask"][:1].lower() + lesson["ask"][1:])}</p></div>')
    return f'<div class="feature-grid dc-lessons">{"".join(items)}</div>'


def cards_in_play_html(pack: dict, deck: dict, kit: dict, tags: dict) -> str:
    shown, blanks = [], [c for c in in_play(pack, deck) if c["kind"] == "yours"]
    for card in in_play(pack, deck):
        if card["kind"] == "yours" and card is not blanks[0]:
            continue
        shown.append(f"<li>{bc.card_html(card, deck, kit, tags)}</li>")
    note = ""
    if blanks:
        note = (f'<p class="pk-subtext pk-blanks">The one Your card drawn here stands for '
                f'{word(len(blanks))} blank cards, each with its own code.</p>')
    return f'<ul class="dc-grid">{"".join(shown)}</ul>{note}'


def yours_html(pack: dict, deck: dict) -> str:
    if not pack.get("yours"):
        return ""
    cards = bc.by_code(deck)
    items = []
    for y in pack["yours"]:
        items.append(f'<div class="card pk-yours-card"><p class="eyebrow">Your card '
                     f'{cards[y["code"]]["tag"]}</p><h3>{esc(y["name"])}</h3>'
                     f'<p>{esc(y["does"])}</p>'
                     f'{mini_row(y["row"], pack, deck, "The cards " + y["name"] + " stands for")}</div>')
    return ('<h3 class="pk-sub">Your cards this pack uses</h3><p class="pk-subtext">Write the name '
            'on the blank card with that number. In the pack file, the card carries the row it '
            'stands for.</p>'
            f'<div class="feature-grid pk-yours">{"".join(items)}</div>')


# --------------------------------------------------------------------------
# pages
# --------------------------------------------------------------------------

HEADER = """<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="header-inner wrap">
    <a class="brand" href="/">
      <img src="/assets/studio-icon.png" width="36" height="36" alt="">
      <span>Microduck Studio<small>Independent project</small></span>
    </a>
    <nav class="site-nav" aria-label="Main">
      <a href="/#what">Studio</a>
      <a href="/docs/">Docs</a>
      <a href="/cards/" aria-current="page">Cards</a>
      <a href="/books/">Books</a>
      <a href="/#links">Downloads</a>
      <a class="nav-source" href="https://github.com/craigm26/duck-studio" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>"""

FOOTER = """<footer class="site-footer">
  <div class="footer-inner wrap">
    <div>
      <p class="footer-title">Microduck Studio</p>
      <p class="meta">A little robot. Plenty to discover.</p>
    </div>
    <div class="footer-copy">
      <p><strong>This is not the official Microduck app.</strong> Pollen Robotics make the robot: <a href="https://pollen-robotics.com/microduck/" rel="noopener">Microduck, by Pollen Robotics</a> · <a href="https://pollen-robotics.com/" rel="noopener">Pollen Robotics</a>.</p>
      <p>Microduck Studio is an independent project. It is not made by, endorsed by, or affiliated with Pollen Robotics. Microduck is their robot; this is an independent owner's app for it.</p>
      <p>Duck Cards, their packs, pictures and lessons are CC BY 4.0. Microduck Studio, duckkit and the bench are Apache-2.0.</p>
      <nav class="footer-links" aria-label="Footer">
        <a href="/">Studio</a>
        <a href="/docs/">Documentation</a>
        <a href="/cards/">Duck Cards</a>
        <a href="/books/">Books</a>
        <a href="/privacy/">Privacy</a>
        <a href="https://github.com/craigm26/microduck-com" rel="noopener">Website source</a>
        <a href="/feedback/">Feedback</a>
      </nav>
    </div>
  </div>
</footer>"""


def head(title: str, description: str, path: str, og_title: str, og_description: str) -> str:
    url = f"{SITE}{path}"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101018" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(og_title)}">
<meta property="og:description" content="{esc(og_description)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="/assets/studio-icon.png">
<link rel="stylesheet" href="/assets/site.css?v={css_version()}">
</head>"""


def art_used(pack: dict, deck: dict) -> list[str]:
    cards = bc.by_code(deck)
    codes = list(pack["cards"])
    for ch in pack["challenges"]:
        codes += [e["card"] for e in ch.get("buggy") or []] + ([ch["finish_with"]] if ch.get("finish_with") else [])
    for y in pack.get("yours", []):
        codes += [e["card"] for e in y["row"]]
    return bc.used_art([c for c in deck["cards"] if c["code"] in set(codes)])


def pack_page(pack: dict, packs: list[dict], deck: dict, kit: dict, tags: dict, fm: dict) -> str:
    pid, name = pack["id"], pack["name"]
    n = len(pack["challenges"])
    playing = in_play(pack, deck)
    most, most_card, most_where = most_laid(pack, deck)
    challenges = "".join(activity_card(pack, ch, i, deck)
                         for i, ch in enumerate(pack["challenges"], start=1))
    description = (f"{name}, a Duck Cards pack for grades {pack['grades']}: {word(n)} challenges "
                   f"on a {board_line(pack)}, the cards in play, and lessons. Free to print, CC BY 4.0.")
    return f"""{head(f"{name}, a Duck Cards pack | Microduck Studio", description,
                     f"/cards/packs/{pid}/", f"{name}, a Duck Cards pack", pack["about"])}
<body class="dc-page pk-page pk-pack-page">
{HEADER}

{bc.sprite(art_used(pack, deck))}

<main id="main" tabindex="-1">
  <section class="wrap pk-intro" aria-labelledby="pack-title">
    <p class="eyebrow"><a href="/cards/">Duck Cards</a> <span aria-hidden="true">›</span> <a href="/cards/packs/">Packs</a></p>
    <h1 id="pack-title">{esc(name)}</h1>
    <p class="lede">{esc(pack["about"])}</p>
    <ul class="pk-facts">
      <li><strong>{esc(grades(pack))}</strong></li>
      <li>{word(n).capitalize()} challenges</li>
      <li>A {esc(board_line(pack))}</li>
      <li>Fewest {unit(pack)} wins</li>
      <li>{word(len(playing)).capitalize()} cards in play</li>
    </ul>
    <div class="ctas">
      <a class="cta" href="/cards/packs/{pid}/print/">Print this pack's cards</a>
      <a class="cta secondary" href="#challenges">See the challenges</a>
      <a class="text-link" href="/cards/packs/{pid}.duckpack" download>Download the pack file <span aria-hidden="true">›</span></a>
    </div>
  </section>

  <div class="wrap">
    <section class="section" aria-labelledby="cards">
      <div class="section-heading">
        <h2 id="cards">Cards in play.</h2>
        <p>{copies_html(pack, deck)}</p>
      </div>
{cards_in_play_html(pack, deck, kit, tags)}
{yours_html(pack, deck)}
    </section>

    <section class="section" aria-labelledby="score">
      <div class="section-heading">
        <h2 id="score">How it is scored.</h2>
      </div>
      <div class="pk-prose">{score_html(pack, deck)}</div>
    </section>

    <section class="section" aria-labelledby="board">
      <div class="section-heading">
        <h2 id="board">The board.</h2>
        <p>Every challenge card below draws its own board. Here is how big a square is.</p>
      </div>
{sizing_html([pack], fm)}
    </section>

    <section class="section pk-print-area" aria-labelledby="challenges">
      <div class="section-heading">
        <h2 id="challenges">The challenges.</h2>
        <p>Easiest first. Print this page and it prints these cards and nothing else, four to a sheet, ready to cut. Choose Actual size or 100%.</p>
      </div>
      <ol class="pk-cards">{challenges}</ol>
    </section>

    <section class="section" aria-labelledby="lessons">
      <div class="section-heading">
        <h2 id="lessons">Lessons.</h2>
        <p>Each one fits a class period with paper only.</p>
      </div>
{lessons_html(pack)}
    </section>

    <section class="section download-section" aria-labelledby="get">
      <div>
        <h2 id="get">Take the pack.</h2>
        <p>The whole pack is one file in the open <code>{esc(pack["format"])}</code> format. {esc(pack["credit"])}, CC BY 4.0.</p>
      </div>
      <ul class="download-links">
        <li><a href="/cards/packs/{pid}/print/">Print this pack's cards <span>Letter or A4</span></a></li>
        <li><a href="/cards/packs/{pid}.duckpack" download>Download the pack file <span>.duckpack, JSON</span></a></li>
        <li><a href="/cards/packs/">Every pack <span>By grade</span></a></li>
        <li><a href="/cards/">Duck Cards <span>The whole deck</span></a></li>
      </ul>
    </section>
  </div>
</main>

{FOOTER}
</body>
</html>
"""


def print_page(pack: dict, deck: dict, kit: dict, tags: dict) -> str:
    pid, name = pack["id"], pack["name"]
    playing = in_play(pack, deck)
    sheet = bc.region_sheets({**deck, "cards": playing}, kit, tags)
    sheets = -(-len(playing) // 9)
    description = (f"Print the {word(len(playing))} Duck Cards that {name} plays with, on Letter or "
                   "A4, laid out for cutting. Free, CC BY 4.0.")
    return f"""{head(f"Print the {name} cards | Microduck Studio", description,
                     f"/cards/packs/{pid}/print/", f"Print the {name} cards",
                     f"The Duck Cards {name} plays with, ready to print and cut.")}
<body class="dc-page dc-print-page">
{HEADER}

{bc.sprite(bc.used_art(playing))}

<main id="main" tabindex="-1">
  <div class="wrap dc-print-intro">
    <p class="eyebrow"><a href="/cards/">Duck Cards</a> <span aria-hidden="true">›</span> <a href="/cards/packs/{pid}/">{esc(name)}</a></p>
    <h1>Print the {esc(name)} cards.</h1>
    <p class="lede">The {word(len(playing))} cards this pack plays with and no others, on {word(sheets)} sheet{"s" if sheets > 1 else ""}. Untick any card you do not want, and it will not print.</p>
    <ol class="guide-steps">
      <li><strong>Print from your browser.</strong> Press Ctrl+P, or Command+P on a Mac. On an iPad or iPhone, use Share, then Print.</li>
      <li><strong>Print at actual size, one side only.</strong> Choose Actual size or 100%, not Fit to page.</li>
      <li><strong>Use card stock if your printer takes it.</strong> Plain paper works too. Sleeves made for ordinary playing cards fit, and make cards last a whole term.</li>
      <li><strong>Cut on the grey lines.</strong> Each sheet holds up to three rows of three.</li>
    </ol>
  </div>

  <form class="wrap dc-pickform" aria-label="Choose the cards to print">
{sheet}
    <div class="dc-printbar">
      <p class="dc-count" aria-hidden="true"></p>
      <button type="reset" class="cta secondary">Tick every card again</button>
    </div>
  </form>

  <div class="wrap dc-print-notes">
    <h2>Before you cut.</h2>
    <div class="feature-grid">
      <div class="card">
        <h3>Print enough</h3>
        <p>A row can say Walk forward more than once. <a href="/cards/packs/{pid}/#cards">The pack page</a> says how many copies each group needs.</p>
      </div>
      <div class="card">
        <h3>The challenges</h3>
        <p>The activity cards print from <a href="/cards/packs/{pid}/#challenges">the pack page</a>, four to a sheet.</p>
      </div>
      <div class="card">
        <h3>The whole deck</h3>
        <p>Every card, for every pack, is on <a href="/cards/print/">the full cut sheet</a>.</p>
      </div>
    </div>
  </div>
</main>

{FOOTER}
</body>
</html>
"""


def region_list(packs: list[dict], deck: dict) -> str:
    items = []
    for pack in packs:
        n = len(pack["challenges"])
        items.append(
            f'<div class="card pk-list-card"><p class="eyebrow">{esc(grades(pack))}</p>'
            f'<h3><a href="/cards/packs/{pack["id"]}/">{esc(pack["name"])}</a></h3>'
            f'<p>{esc(pack["about"])}</p>'
            f'<p class="meta">{word(n).capitalize()} challenges on a {esc(board_line(pack))}. '
            f'Fewest {unit(pack)} wins. {word(len(in_play(pack, deck))).capitalize()} cards in '
            'play.</p></div>')
    return f'<div class="feature-grid pk-list">{"".join(items)}</div>'


def pages(deck: dict, kit: dict, tags: dict) -> tuple[dict[str, str], dict[str, str]]:
    """(whole pages by path, index regions by name)."""
    packs = load_packs()
    fm = measurement()
    whole = {}
    for pack in packs:
        whole[f"public/cards/packs/{pack['id']}/index.html"] = pack_page(pack, packs, deck, kit, tags, fm)
        whole[f"public/cards/packs/{pack['id']}/print/index.html"] = print_page(pack, deck, kit, tags)
    regions = {"LIST": region_list(packs, deck), "SIZING": sizing_html(packs, fm)}
    return whole, regions


def marker(name: str, edge: str) -> str:
    return f"<!-- DUCKPACKS:{name}:{edge} -->"


def current(text: str, name: str) -> str | None:
    begin, end = marker(name, "BEGIN"), marker(name, "END")
    if text.count(begin) != 1 or text.count(end) != 1:
        return None
    return text.split(begin)[1].split(end)[0].strip("\n")


def splice(text: str, name: str, content: str) -> str:
    begin, end = marker(name, "BEGIN"), marker(name, "END")
    if text.count(begin) != 1 or text.count(end) != 1:
        raise PackError(f"{INDEX} must carry exactly one {begin} and one {end}")
    head_, rest = text.split(begin)
    _, tail = rest.split(end)
    return f"{head_}{begin}\n{content}\n{end}{tail}"


def stale(deck: dict, kit: dict, tags: dict) -> list[str]:
    """Every committed pack page or region that is not what this file draws today."""
    whole, regions = pages(deck, kit, tags)
    out = []
    for path, text in whole.items():
        file = ROOT / path
        if not file.is_file() or file.read_text(encoding="utf-8") != text:
            out.append(path)
    on_disk = {str(p.relative_to(ROOT)) for p in PACKS.glob("*/index.html")} | \
        {str(p.relative_to(ROOT)) for p in PACKS.glob("*/print/index.html")}
    out += sorted(f"{p} (no pack draws it)" for p in on_disk - set(whole))
    index = (ROOT / INDEX).read_text(encoding="utf-8") if (ROOT / INDEX).is_file() else ""
    out += [f"{INDEX} {name}" for name, content in regions.items() if current(index, name) != content]
    return out


def build(check: bool) -> int:
    deck, kit, tags = bc.load()
    problems = bc.check_deck(deck, kit, tags)
    for pack in load_packs():
        problems += check_pack(pack, deck)
    if problems:
        for problem in problems:
            print("build_packs: " + problem, file=sys.stderr)
        return 1
    if check:
        late = stale(deck, kit, tags)
        if late:
            print("build_packs: stale, run python3 tools/duckcards/build_packs.py: "
                  + ", ".join(late), file=sys.stderr)
            return 1
        return 0
    whole, regions = pages(deck, kit, tags)
    for path, text in whole.items():
        file = ROOT / path
        file.parent.mkdir(parents=True, exist_ok=True)
        if not file.is_file() or file.read_text(encoding="utf-8") != text:
            file.write_text(text, encoding="utf-8")
            print(f"build_packs: wrote {path}")
    index = ROOT / INDEX
    text = index.read_text(encoding="utf-8")
    new = text
    for name, content in regions.items():
        new = splice(new, name, content)
    if new != text:
        index.write_text(new, encoding="utf-8")
        print(f"build_packs: wrote {INDEX}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(build(check="--check" in sys.argv[1:]))
    except PackError as why:
        print(f"build_packs: {why}", file=sys.stderr)
        sys.exit(1)
