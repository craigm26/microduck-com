#!/usr/bin/env python3
"""Draw the Duck Cards into the pages, between their DUCKCARDS markers.

    python3 tools/duckcards/build_cards.py           # rewrite every region
    python3 tools/duckcards/build_cards.py --check   # exit 1 if any region is stale

THREE INPUTS AND NOTHING ELSE. The deck (public/cards/duck-cards.json) says
which cards exist. tools/kit-sentences.json, written by
scripts/extract_kit_sentences.py out of StudioKit, says what Studio calls each
one, what goes under what, and which pad buttons do what. tools/duckcards/
tag36h11.txt says what each code looks like. Run the extractor first; this
reads its output and never reads Swift.

THE CHIPS ARE DERIVED, NEVER TYPED. A card says "Studio" only where the bench
answers the pad binding that performs it, and "Pad: X" only where StudioKit's
transcription of padd binds a control to it. Typing those by hand is how a card
would come to promise a button the phone does not have.

The regions are committed, like the rest of public/. scripts/check_cards.py runs
this file's renderer and fails the deploy when a committed region differs, so a
hand edit inside a marker cannot survive, and neither can a stale one.
"""

from __future__ import annotations

import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from art import ART  # noqa: E402

DECK = ROOT / "public/cards/duck-cards.json"
KIT = ROOT / "tools/kit-sentences.json"
TAGS = HERE / "tag36h11.txt"

PAGES = {
    "public/cards/index.html": ("SPRITE", "HERO", "GALLERY"),
    "public/cards/print/index.html": ("SPRITE", "SHEETS"),
    "public/cards/spec/index.html": ("SPRITE", "ANATOMY", "RANGES", "EXAMPLE", "NFC", "TABLE"),
    "public/index.html": ("PROMO",),
}

MOVES = ("walk_forward", "walk_backward", "turn_left", "turn_right")
HEAD_WORD = {"speed": "Speed", "head": "Look"}

# What an NFC sticker holds, as the spec page says it. The page promises the
# smallest common sticker has room, so the byte count is a checked claim.
NFC_URI = "https://microduckstudio.com/cards/spec/#card-{tag}"
NFC_MIME = "application/vnd.duckcards+json"
NTAG213_BYTES = 144
NFC_EXAMPLE = "kick_right"


def nfc_payload(card: dict) -> str:
    return json.dumps({"format": "duck-cards/0", "tag": card["tag"], "code": card["code"]},
                      separators=(",", ":"))


def ndef_bytes(card: dict) -> int:
    """The NDEF message in a Type 2 tag's TLV, both records short records.

    URI record: header, type length, payload length, type "U", the 0x04
    "https://" prefix byte, then the rest of the address. MIME record: header,
    type length, payload length, the media type, then the payload. Around both,
    the 0x03 TLV tag, a one byte length, and the 0xFE terminator.
    """
    uri = NFC_URI.format(tag=card["tag"])[len("https://"):]
    return (4 + 1 + len(uri)) + (3 + len(NFC_MIME) + len(nfc_payload(card))) + 3


class DeckError(Exception):
    pass


# --------------------------------------------------------------------------
# inputs
# --------------------------------------------------------------------------

def load() -> tuple[dict, dict, dict[int, list[str]]]:
    deck = json.loads(DECK.read_text(encoding="utf-8"))
    kit = json.loads(KIT.read_text(encoding="utf-8")).get("cards")
    if not kit:
        raise DeckError("tools/kit-sentences.json has no cards section; "
                        "run scripts/extract_kit_sentences.py first")
    tags = {}
    for line in TAGS.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            number, *rows = line.split()
            tags[int(number)] = rows
    return deck, kit, tags


def by_code(deck: dict) -> dict[str, dict]:
    return {card["code"]: card for card in deck["cards"]}


# --------------------------------------------------------------------------
# what a card claims, derived from the kit
# --------------------------------------------------------------------------

def binding(kit: dict, *, robot_starts: str | None = None, robot_has: str | None = None,
            here: str | None = None, slot: str | None = None) -> dict | None:
    for row in kit["pad_bindings"]:
        if robot_starts is not None and not row["robot"].startswith(robot_starts):
            continue
        if robot_has is not None and robot_has not in row["robot"].lower():
            continue
        if here is not None and row["here"] != here:
            continue
        if slot is not None and row["slot"] != slot:
            continue
        return row
    return None


def require(row: dict | None, what: str) -> dict:
    if row is None:
        raise DeckError(f"no pad binding in the kit {what}; StudioKit's DuckPad changed "
                        "and build_cards.py has to learn what the new one means")
    return row


def derive(card: dict, kit: dict) -> dict:
    """Where a card runs, what goes under it, and what a robot is sent."""
    plan = card.get("plan") or {}
    action, speed, head, sound = (plan.get(k) for k in ("action", "speed", "head", "sound"))
    faces = kit["pad_faces"]
    out = {"studio": False, "pad": None, "takes": [], "goes_under": [], "robot": None}

    if action in MOVES:
        stick = require(binding(kit, robot_starts="Translate" if action.startswith("walk")
                                else "Heading"), f"for {action}")
        out.update(studio=stick["here"] == "drive", pad=faces[stick["control"]],
                   robot="robot.move")
    elif action == "stop":
        out.update(studio=binding(kit, here="stop") is not None, robot="robot.move at zero")
    elif action in kit["skills"]:
        slot = kit["skills"][action]
        row = require(binding(kit, here="loadSlot", slot=slot), f"loading {slot}")
        out.update(studio=True, pad=faces[row["control"]],
                   robot=f"robot.do {kit['robotd'][slot]}")
    elif action == "make_sound":
        row = binding(kit, robot_has=sound)
        out.update(studio=bool(row) and row["here"] != "unsupported",
                   pad=faces[row["control"]] if row else None, robot=f"robot.sound {sound}")
    elif speed:
        sticks = [require(binding(kit, robot_starts=s), "for a stick")
                  for s in ("Translate", "Heading")]
        out.update(studio=all(s["here"] == "drive" for s in sticks), robot="scales robot.move")
    elif head:
        row = require(binding(kit, robot_starts="Head mode"), "for head mode")
        out.update(studio=row["here"] != "unsupported", pad=faces[row["control"]],
                   robot="robot.head")

    if action:
        takes = kit["takes"].get(action, kit["takes"]["default"])
        out["takes"] = [h for h in takes if h in HEAD_WORD]
    kind = "speed" if speed else "head" if head else None
    if kind:
        out["goes_under"] = [label for label in kit["vocabulary"]["actions"]
                             if kind in kit["takes"].get(label, kit["takes"]["default"])]
    return out


def check_deck(deck: dict, kit: dict, tags: dict) -> list[str]:
    """The deck's own invariants. check_cards.py runs this too."""
    problems = []
    vocab = kit["vocabulary"]
    if deck.get("format") != "duck-cards/0":
        problems.append(f"the deck's format is {deck.get('format')!r}, not duck-cards/0")
    if deck.get("vocabulary") != vocab["id"]:
        problems.append(f"the deck says vocabulary {deck.get('vocabulary')!r}; "
                        f"Studio's is {vocab['id']!r}")
    if deck.get("plan_format") != kit["plan_format"]:
        problems.append(f"the deck names {deck.get('plan_format')!r}; Studio's plan format "
                        f"is {kit['plan_format']!r}")
    categories = {c["id"] for c in deck["categories"]}
    seen_tags, seen_codes = set(), set()
    allowed = {"action": vocab["actions"], "speed": vocab["speeds"],
               "head": vocab["heads"], "sound": vocab["sounds"]}
    for card in deck["cards"]:
        label = f"card {card.get('code')!r}"
        if card["tag"] in seen_tags:
            problems.append(f"{label} reuses code number {card['tag']}")
        if card["code"] in seen_codes:
            problems.append(f"{label} appears twice")
        seen_tags.add(card["tag"])
        seen_codes.add(card["code"])
        if card["tag"] not in tags:
            problems.append(f"{label} has code number {card['tag']}, which is not in tag36h11")
        span = {c["id"]: c.get("codes") for c in deck["categories"]}.get(card["category"])
        if not span or not span[0] <= card["tag"] <= span[1]:
            problems.append(f"{label} has code number {card['tag']}, outside its category's "
                            f"range {span}")
        if ndef_bytes(card) > NTAG213_BYTES:
            problems.append(f"{label} needs {ndef_bytes(card)} bytes of NFC; the spec page "
                            f"promises an NTAG213's {NTAG213_BYTES} hold every card")
        if card["category"] not in categories:
            problems.append(f"{label} is in an unknown category {card['category']!r}")
        if card.get("art") and card["art"] not in ART:
            problems.append(f"{label} names art {card['art']!r} that art.py does not draw")
        plan = card.get("plan") or {}
        for head, value in plan.items():
            if value not in allowed.get(head, []):
                problems.append(f"{label} puts {head} {value!r} in a plan, and {vocab['id']} "
                                f"has no such {head}")
        # Named in Studio's own words, or it is not a Studio card.
        word_of = plan.get("sound") or plan.get("speed") or plan.get("head") or plan.get("action")
        if word_of:
            said = kit["words"].get(word_of, word_of[:1].upper() + word_of[1:])
            if card["name"] != said:
                problems.append(f"{label} is printed {card['name']!r}; Studio calls it {said!r}")
            if card["code"] != word_of:
                problems.append(f"{label} has code word {card['code']!r}; its label is {word_of!r}")
    for step in deck["example"]["row"]:
        for code in [step["card"], *step.get("under", [])]:
            if code not in seen_codes:
                problems.append(f"the example row uses {code!r}, which is not a card")
    for code in deck.get("promo", []):
        if code not in seen_codes:
            problems.append(f"the homepage promo uses {code!r}, which is not a card")
    return problems


# --------------------------------------------------------------------------
# drawing
# --------------------------------------------------------------------------

def tag_svg(number: int, rows: list[str]) -> str:
    """The code as a 10 by 10 grid: white quiet zone, black border, data.

    Black cells are written as horizontal runs, one `M x y h n v1 h -n z` each,
    which is the one shape check_cards.py reads back.
    """
    grid = [[1] * 10 for _ in range(10)]
    for y in range(1, 9):
        for x in range(1, 9):
            grid[y][x] = 0
    for r, row in enumerate(rows):
        for c, bit in enumerate(row):
            grid[r + 2][c + 2] = int(bit)
    runs = []
    for y in range(10):
        x = 0
        while x < 10:
            if grid[y][x] == 0:
                start = x
                while x < 10 and grid[y][x] == 0:
                    x += 1
                runs.append(f"M{start} {y}h{x - start}v1h-{x - start}z")
            else:
                x += 1
    return (f'<svg class="dc-tag" viewBox="0 0 10 10" shape-rendering="crispEdges" role="img" '
            f'aria-label="Code {number}"><path fill="#fff" d="M0 0h10v10H0z"/>'
            f'<path fill="#000" d="{"".join(runs)}"/></svg>')


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def card_html(card: dict, deck: dict, kit: dict, tags: dict) -> str:
    cat = {c["id"]: c for c in deck["categories"]}[card["category"]]
    d = derive(card, kit)
    tag = (f'<span class="dc-tagbox">{tag_svg(card["tag"], tags[card["tag"]])}'
           f'<span class="dc-num">{card["tag"]}</span></span>')
    parts = [f'<article class="dc dc-{esc(card["category"])}" data-tag="{card["tag"]}" '
             f'data-code="{esc(card["code"])}">',
             f'<p class="dc-band">{esc(cat["name"])}</p>']
    if card["kind"] == "yours":
        parts += ['<div class="dc-art dc-blank"><span>Draw it here</span></div>',
                  '<p class="dc-name dc-line"><span>Name it</span></p>',
                  f'<p class="dc-code">{esc(card["code"])}</p>',
                  f'<div class="dc-foot"><p class="dc-does">It does</p>{tag}</div>']
    else:
        parts += [f'<div class="dc-art"><svg viewBox="0 0 48 48" aria-hidden="true" '
                  f'focusable="false"><use href="#dc-i-{esc(card["art"])}"></use></svg></div>',
                  f'<p class="dc-name">{esc(card["name"])}</p>']
        if card.get("write_in"):
            parts.append(f'<p class="dc-write"><span class="dc-box"></span> '
                         f'{esc(card["write_in"])}</p>')
        parts.append(f'<p class="dc-code">{esc(card["code"])}</p>')
        chips = []
        if d["studio"]:
            chips.append("<li>Studio</li>")
        if d["pad"]:
            chips.append(f"<li>Pad: {esc(d['pad'])}</li>")
        runs = f'<ul class="dc-runs">{"".join(chips)}</ul>' if chips else '<span></span>'
        parts.append(f'<div class="dc-foot">{runs}{tag}</div>')
    parts.append("</article>")
    return "".join(parts)


def sprite(keys: list[str]) -> str:
    symbols = "".join(
        f'<symbol id="dc-i-{key}" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" '
        f'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">{ART[key]}</g></symbol>'
        for key in keys)
    return (f'<svg class="dc-sprite" aria-hidden="true" focusable="false">'
            f'<defs>{symbols}</defs></svg>')


def used_art(cards: list[dict]) -> list[str]:
    keys = []
    for card in cards:
        if card.get("art") and card["art"] not in keys:
            keys.append(card["art"])
    return keys


def region_hero(deck, kit, tags) -> str:
    cards = by_code(deck)
    steps = []
    for step in deck["example"]["row"]:
        under = "".join(
            f'<div class="dc-under">{card_html(cards[code], deck, kit, tags)}</div>'
            for code in step.get("under", []))
        steps.append(f'<li class="dc-step">{card_html(cards[step["card"]], deck, kit, tags)}'
                     f'{under}</li>')
    said = esc(deck["example"]["said"])
    return (f'<ol class="dc-row" aria-label="An example row of cards">{"".join(steps)}</ol>'
            f'<figcaption>Read it left to right. {said}</figcaption>')


def goes_under_words(labels: list[str], kit: dict) -> str:
    said = [kit["words"].get(label, label) for label in labels]
    return ", ".join(said[:-1]) + " or " + said[-1] if len(said) > 1 else "".join(said)


def region_gallery(deck, kit, tags) -> str:
    groups = []
    for cat in deck["categories"]:
        members = [c for c in deck["cards"] if c["category"] == cat["id"] and c["printed"]]
        if cat["id"] == "yours":
            members = members[:1]
        extra = ""
        first = derive(members[0], kit)
        if first["goes_under"]:
            extra = (f'<p class="dc-goes">Goes under {esc(goes_under_words(first["goes_under"], kit))}.</p>')
        if cat["id"] == "yours":
            extra = ('<p class="dc-goes">The last sheet of the deck is these, each with its '
                     'own code.</p>')
        items = "".join(f"<li>{card_html(c, deck, kit, tags)}</li>" for c in members)
        groups.append(
            f'<section class="dc-group" aria-labelledby="dc-group-{cat["id"]}">'
            f'<div class="dc-group-text"><h3 id="dc-group-{cat["id"]}">{esc(cat["name"])}</h3>'
            f'<p>{esc(cat["about"])}</p>{extra}</div>'
            f'<ul class="dc-grid">{items}</ul></section>')
    return f'<div class="dc-groups">{"".join(groups)}</div>'


def region_sheets(deck, kit, tags) -> str:
    items = []
    for card in deck["cards"]:
        if not card["printed"]:
            continue
        name = card["name"] if card["kind"] != "yours" else f"{card['name']} {card['code'][5:]}"
        items.append(
            f'<li class="dc-pick"><input type="checkbox" id="pick-{card["tag"]}" '
            f'checked><label for="pick-{card["tag"]}">Print '
            f'<span class="dc-pick-name">{esc(name)}</span></label>'
            f'{card_html(card, deck, kit, tags)}</li>')
    return f'<ul class="dc-sheet">{"".join(items)}</ul>'


KIND_WORDS = {"action": "Action", "modifier": "Goes under", "control": "Control",
              "event": "When", "yours": "Yours"}
SHAPE_OF_ROW = {
    "start": "Marks where the row begins.",
    "end": "Marks where the row ends.",
    "repeat": "Opens a bracket. The count is written on the card.",
    "end_repeat": "Closes the nearest open Repeat.",
    "when_falls": "Starts a second row that runs after a fall.",
}


def region_table(deck, kit, tags) -> str:
    rows = []
    for card in sorted(deck["cards"], key=lambda c: c["tag"]):
        d = derive(card, kit)
        plan = card.get("plan") or {}
        step = ", ".join(f"{k} <code>{esc(v)}</code>" for k, v in plan.items()) \
            or "Not in Studio's plan"
        if d["takes"]:
            under = ", ".join(HEAD_WORD[h] for h in d["takes"])
        elif d["goes_under"]:
            under = "Goes under " + esc(goes_under_words(d["goes_under"], kit))
        elif card["kind"] == "yours":
            under = "Yours to decide, and to write down in the deck file."
        elif card["code"] in SHAPE_OF_ROW:
            under = SHAPE_OF_ROW[card["code"]]
        else:
            under = "Nothing"
        note = "" if card["printed"] else ", not in the starter deck"
        studio = "Yes" if d["studio"] else "No"
        pad = esc(d["pad"]) if d["pad"] else "None"
        robot = "<code>" + esc(d["robot"]) + "</code>" if d["robot"] else "None"
        rows.append(
            f'<tr id="card-{card["tag"]}"><td>{card["tag"]}</td>'
            f'<td>{esc(card["name"])}<br><span class="meta"><code>{esc(card["code"])}</code>'
            f' {KIND_WORDS[card["kind"]].lower()}{note}</span></td>'
            f'<td>{step}</td><td>{under}</td>'
            f'<td>{studio}</td><td>{pad}</td><td>{robot}</td></tr>')
    head = ('<tr><th scope="col">Code</th><th scope="col">Card</th>'
            '<th scope="col">Studio plan step</th><th scope="col">Under it</th>'
            '<th scope="col">Runs in Studio</th><th scope="col">Pad</th>'
            '<th scope="col">On a robot</th></tr>')
    return ('<div class="scroller" role="region" aria-label="Every card in the format" '
            f'tabindex="0"><table class="dc-table"><caption>Every card, by code number. '
            f'Vocabulary {esc(kit["vocabulary"]["id"])}.</caption>{head}{"".join(rows)}'
            '</table></div>')


def row_to_plan(deck: dict, kit: dict) -> dict:
    """The example row as the duck-intent-plan/0 file the spec page shows."""
    cards = by_code(deck)
    steps = []
    for step in deck["example"]["row"]:
        card = cards[step["card"]]
        if card["kind"] != "action":
            continue
        labels = dict(card["plan"])
        for code in step.get("under", []):
            for head, value in cards[code]["plan"].items():
                if head not in derive(card, kit)["takes"]:
                    raise DeckError(f"the example puts {code} under {card['code']}, "
                                    f"which takes no {head}")
                labels[head] = value
        steps.append({"clause": card["name"], "labels": labels})
    return {"format": kit["plan_format"], "request": deck["example"]["said"],
            "model": deck["format"], "steps": steps}


def region_example(deck, kit, tags) -> str:
    text = json.dumps(row_to_plan(deck, kit), indent=2)
    return ('<pre tabindex="0" role="region" aria-label="The example row as a Studio plan">'
            f'<code>{esc(text)}</code></pre>')


def region_nfc(deck, kit, tags) -> str:
    card = by_code(deck)[NFC_EXAMPLE]
    text = (f"Record 1, URI:\n{NFC_URI.format(tag=card['tag'])}\n\n"
            f"Record 2, MIME type {NFC_MIME}:\n{nfc_payload(card)}")
    return ('<pre tabindex="0" role="region" aria-label="What to write on the NFC sticker for '
            f'{esc(card["name"])}"><code>{esc(text)}</code></pre>')


def region_ranges(deck, kit, tags) -> str:
    parts = [f'{esc(c["name"])} {c["codes"][0]} to {c["codes"][1]}' for c in deck["categories"]]
    return ", ".join(parts[:-1]) + ", and " + parts[-1] + "."


def region_anatomy(deck, kit, tags) -> str:
    card = by_code(deck)["kick_right"]
    return f'<div class="dc-anatomy-card">{card_html(card, deck, kit, tags)}</div>'


def region_promo(deck, kit, tags) -> str:
    cards = by_code(deck)
    chosen = [cards[code] for code in deck["promo"]]
    items = "".join(f"<li>{card_html(c, deck, kit, tags)}</li>" for c in chosen)
    return f'{sprite(used_art(chosen))}<ul class="dc-fan" aria-hidden="true">{items}</ul>'


def regions(deck, kit, tags) -> dict[str, str]:
    printed_or_reserved = [c for c in deck["cards"] if c.get("art")]
    return {
        "SPRITE": sprite(used_art(printed_or_reserved)),
        "HERO": region_hero(deck, kit, tags),
        "GALLERY": region_gallery(deck, kit, tags),
        "SHEETS": region_sheets(deck, kit, tags),
        "ANATOMY": region_anatomy(deck, kit, tags),
        "RANGES": region_ranges(deck, kit, tags),
        "EXAMPLE": region_example(deck, kit, tags),
        "NFC": region_nfc(deck, kit, tags),
        "TABLE": region_table(deck, kit, tags),
        "PROMO": region_promo(deck, kit, tags),
    }


# --------------------------------------------------------------------------
# splicing
# --------------------------------------------------------------------------

def marker(name: str, edge: str) -> str:
    return f"<!-- DUCKCARDS:{name}:{edge} -->"


def splice(text: str, name: str, content: str, page: str) -> str:
    begin, end = marker(name, "BEGIN"), marker(name, "END")
    if text.count(begin) != 1 or text.count(end) != 1:
        raise DeckError(f"{page} must carry exactly one {begin} and one {end}")
    head, rest = text.split(begin)
    _, tail = rest.split(end)
    return f"{head}{begin}\n{content}\n{end}{tail}"


def current(text: str, name: str) -> str | None:
    begin, end = marker(name, "BEGIN"), marker(name, "END")
    if text.count(begin) != 1 or text.count(end) != 1:
        return None
    return text.split(begin)[1].split(end)[0].strip("\n")


def build(check: bool) -> int:
    deck, kit, tags = load()
    problems = check_deck(deck, kit, tags)
    if problems:
        for problem in problems:
            print("build_cards: " + problem, file=sys.stderr)
        return 1
    drawn = regions(deck, kit, tags)
    stale = []
    for page, names in PAGES.items():
        path = ROOT / page
        text = path.read_text(encoding="utf-8")
        new = text
        for name in names:
            if check and current(text, name) != drawn[name]:
                stale.append(f"{page} {name}")
            new = splice(new, name, drawn[name], page)
        if not check and new != text:
            path.write_text(new, encoding="utf-8")
            print(f"build_cards: wrote {page}")
    if stale:
        print("build_cards: stale regions, run python3 tools/duckcards/build_cards.py: "
              + ", ".join(stale), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(build(check="--check" in sys.argv[1:]))
    except DeckError as why:
        print(f"build_cards: {why}", file=sys.stderr)
        sys.exit(1)
