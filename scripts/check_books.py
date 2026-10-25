#!/usr/bin/env python3
"""The books under /books/: their structure, their scripts, and every number in them.

    python3 scripts/check_books.py            # all of it (fetches the pinned sources)
    python3 scripts/check_books.py --list     # print each lesson's numbers and stop

WHY A SEPARATE GATE. Rule 1 of this site is that every number is read out of a
StudioKit constant. The books teach how Pollen Robotics trains the robot, so
their numbers come from Pollen's training code, its robot code, this site's own
evidence page and Kith. They cannot be StudioKit constants, so the books keep a
ledger instead: tools/books/claims-<book>.json names, for every number a
lesson prints, the pinned source it was quoted from, the arithmetic that
derives it, or the reason it is a toy. This gate reads every lesson, finds
every number in it, and fails on a number with no entry, an entry with no
number, a quote its source does not contain, or arithmetic that does not come
out to what is printed. The quotes are checked against the sources at the
commits the links pin, so a source that moves on cannot make a quote stale
without the gate noticing. Like check_links.sh it needs the network.

THE TRAINING GUIDE IS HELD THE SAME WAY. /train/ walks a beginner through
Pollen's own tools on a home PC, so its numbers come from Pollen's challenges
and training code, pinned, and from the Microsoft and NVIDIA pages it leans
on; tools/books/claims-train.json ledgers them as a lesson's are, and the shelf
and the guide go through the same plain-page check. A source that is a web
page is read for its words, not its markup, so a tag cannot split a quote.

THE ONE PLACE SCRIPTS RUN. The rest of the site has no JavaScript and a policy
that forbids it. The books are the exception, so this gate also holds the
exception to its edges: one module script tag on each book page and nowhere
else, no inline script or handler, a policy in _headers that lets /books/* run
the site's own scripts and nothing more, every other page under a policy with
no script-src, the vendored three.js byte for byte, and no remote host, dash
or banned phrase in the books' own code.

A FIGURE'S NUMBERS COUNT TOO. A number a figure prints, in a label, a sound
word, a chip or a chart's ticks, is read out of that figure's source and must
be in the lesson's ledger under "figure", and a figure entry the figure no
longer prints is as stale as a lesson entry the lesson no longer prints.

A QUOTE CARRIES ITS NUMBER. A source entry's quote must contain the number it
vouches for, as digits or as a word ("fifteen" vouches for 15), or say in
"means" how the quote yields it ("bipedal" is two legs). Otherwise any true
sentence from the source could license any number.

ARITHMETIC STARTS FROM THE LEDGER. Every operand of a derived number must be
another number the same lesson ledgers, a unit constant (1, 60, 100, 1000,
3600), or be explained under "with". Otherwise any expression that happens to
come out right could license a number.

THE HEAD COUNTS. A number in a page's title or descriptions, which is what a
search result or a shared link shows, must be ledgered in that book.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import subprocess
import sys
from html.parser import HTMLParser

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from site_helpers import flatten  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BOOKS = ("beginner", "intermediate", "advanced")
TOOLS = ROOT / "tools/books"
SCRIPT_TAG = '<script type="module" src="/books/engine/book.js"></script>'

SOURCES = {
    "rl-readme": "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/README.md",
    "rl-agents": "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/AGENTS.md",
    "rl-velocity": "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/src/mjlab_microduck/tasks/microduck_velocity_env_cfg.py",
    "rl-ballkick": "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/src/mjlab_microduck/tasks/microduck_ball_kick_env_cfg.py",
    "md-readme": "https://raw.githubusercontent.com/pollen-robotics/microduck/942e58e3aa6dbb28e7037203fff11866122c7567/README.md",
    "md-robotd": "https://raw.githubusercontent.com/pollen-robotics/microduck/942e58e3aa6dbb28e7037203fff11866122c7567/docs/design/robotd-design.md",
    "md-robotd-toml": "https://raw.githubusercontent.com/pollen-robotics/microduck/942e58e3aa6dbb28e7037203fff11866122c7567/deploy/robotd.toml",
    "rl-infer": "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/b02fdea4902c2b93b7d34a83a6f05da4ececb7d3/scripts/infer_policy.py",
    "kith-llms": "https://kithgame.com/llms.txt",
    "kith-rewards": "https://kithgame.com/api/rewards",
    "site-docs": "public/docs/index.html",
    "site-science": "public/science/index.html",
    "site-cards": "public/cards/index.html",
    "site-packs": "public/cards/packs/index.html",
    "site-pond": "public/cards/packs/get-to-the-pond/index.html",
    "site-maze": "public/cards/packs/duck-maze/index.html",
    "site-loop": "public/cards/packs/loop-the-course/index.html",
    "site-home": "public/index.html",
    # the training guide, /train/: Pollen's challenges, pinned, and the platform pages it leans on
    "ch-sprint": "https://raw.githubusercontent.com/pollen-robotics/microduck-challenges/6ff40704a1b086618b52173c4ea3851bb21ee4f6/src/microduck_challenges/sprint_2m/AGENTS.md",
    "ms-wsl": "https://learn.microsoft.com/en-us/windows/wsl/install",
    "ms-wslg": "https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps",
    "nvidia-wsl": "https://docs.nvidia.com/cuda/archive/13.2.2/wsl-user-guide/index.html",
}

# Plain pages: no lessons and no figures, but every number ledgered all the same.
# (page under public/, its ledger under tools/books/, the ledger's key, what messages call it)
PLAIN = (
    ("books/index.html", "claims-shelf.json", "shelf", "the shelf"),
    ("train/index.html", "claims-train.json", "train", "the training guide"),
)

WORDS = ("two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
         "sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety "
         "hundred thousand million half third quarter dozen").split()
NUM = re.compile(r"(?<![A-Za-z0-9_.@/#\-])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![A-Za-z0-9_@/])")
WORD = re.compile(r"\b(" + "|".join(WORDS) + r")\b", re.IGNORECASE)
# cross references to other lessons and books are structure, not claims
XREF = re.compile(r"\b[Bb]ook \d+(?: of \d+)?(?:, lessons? \d+)?|\b[Ll]essons? \d+")
WORD_VALUE = dict(zip(WORDS[:27], ("2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 "
                                    "30 40 50 60 70 80 90 100").split())) | {
    "thousand": "1000", "million": "1000000", "dozen": "12"}
UNIT_CONSTANTS = {"1", "60", "100", "1000", "3600"}

fail: list[str] = []


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ------------------------------------------------------------------ parsing

class Tree(HTMLParser):
    """A small element tree: enough to find lessons, their parts and their text."""

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, text: str):
        super().__init__(convert_charrefs=False)
        self.root = {"tag": "#root", "attrs": {}, "kids": [], "start": 0, "end": len(text)}
        self.stack = [self.root]
        self.text = text
        self.lines = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self.lines.append(i + 1)
        self.feed(text)
        self.close()

    def _offset(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "kids": [], "start": self._offset(), "end": None}
        self.stack[-1]["kids"].append(node)
        if tag not in self.VOID:
            self.stack.append(node)
        else:
            node["end"] = self._offset() + len(self.get_starttag_text() or "")

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                node = self.stack[i]
                rest = self.text.find(">", self._offset())
                node["end"] = rest + 1
                del self.stack[i:]
                return


def walk(node):
    yield node
    for k in node["kids"]:
        yield from walk(k)


def find(node, pred):
    return [n for n in walk(node) if pred(n)]


def cls(node, name):
    return name in node["attrs"].get("class", "").split()


def html_of(text, node):
    return text[node["start"]:node["end"]]


# ------------------------------------------------------------------ numbers

def numbers_in(text: str) -> set[str]:
    text = XREF.sub(" ", text)
    out = {m.group(1) for m in NUM.finditer(text)}
    out |= {m.group(1).lower() for m in WORD.finditer(text)}
    return out


def lesson_text(page: str, node) -> str:
    """The lesson's words, without its kicker and without the wrong answers."""
    raw = html_of(page, node)
    t = Tree(raw)
    cut = []
    for n in walk(t.root):
        if n["tag"] == "p" and cls(n, "kicker"):
            cut.append((n["start"], n["end"]))
        if n["tag"] == "fieldset" and cls(n, "predict"):
            answer = n["attrs"].get("data-answer")
            for lab in find(n, lambda x: x["tag"] == "label"):
                inputs = find(lab, lambda x: x["tag"] == "input")
                if inputs and inputs[0]["attrs"].get("value") != answer:
                    cut.append((lab["start"], lab["end"]))
    for a, b in sorted(cut, reverse=True):
        raw = raw[:a] + raw[b:]
    return flatten(raw)


def figure_strings(src: str, name: str) -> str:
    """The text a figure prints: the string and template literals in its code."""
    m = re.search(r"^  " + re.escape(name) + r"\(ctx\) \{", src, flags=re.M)
    if not m:
        return ""
    nxt = re.search(r"^  [a-zA-Z0-9_]+\(ctx\) \{", src[m.end():], flags=re.M)
    body = src[m.start(): m.end() + (nxt.start() if nxt else len(src) - m.end())]
    body = re.sub(r"^\s*//.*$", "", body, flags=re.M)
    texts = []
    for q in ("'", '"'):
        texts += re.findall(q + r"((?:[^" + q + r"\\\n]|\\.)*)" + q, body)
    for t in re.findall(r"`((?:[^`\\]|\\.)*)`", body):
        texts.append(re.sub(r"\$\{[^}]*\}", " ", t))
    # colours, CSS classes, fonts, sound names and keys are not printed text
    texts = [t for t in texts if not re.fullmatch(r"#?[0-9a-fA-F]{3,8}|is-[a-z -]+|[a-z_]+|\s*\d{3}\s+px\s*|.*\d+px.*|rgba?\(.*\)", t)]
    # numbers printed from number literals: a chart's ticks (kit.js prints them
    # with toLocaleString, so 1000 prints 1,000) and String(literal)
    for arr in re.findall(r"\b[xy]Ticks\s*=\s*\[([^\]]*)\]", body):
        for n in re.findall(r"\d+(?:\.\d+)?", arr):
            v = float(n)
            texts.append(f"{int(v):,}" if v.is_integer() else f"{v:,.6f}".rstrip("0"))
    texts += re.findall(r"\bString\(\s*(\d+(?:\.\d+)?)\s*\)", body)
    return " ".join(texts)


def head_numbers(page: str) -> set[str]:
    head = page[: page.find("</head>")]
    texts = re.findall(r"<title>(.*?)</title>", head, flags=re.S)
    texts += re.findall(r'<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)" content="([^"]*)"', head)
    return numbers_in(" ".join(texts))


def evaluate(expr: str) -> float:
    if not re.fullmatch(r"[0-9.+\-*/() \t]+", expr):
        raise ValueError(f"not plain arithmetic: {expr}")
    return eval(expr, {"__builtins__": {}}, {})  # noqa: S307 (digits and operators only)


def printed_value(key: str) -> tuple[float, int] | None:
    if not re.fullmatch(r"[\d,]+(?:\.\d+)?", key):
        return None
    clean = key.replace(",", "")
    decimals = len(clean.split(".")[1]) if "." in clean else 0
    return float(clean), decimals


def forms(key: str) -> set[str]:
    """The ways a ledger key can be written: 15, 1,500, fifteen."""
    k = key.replace(",", "").lower()
    out = {k}
    if k in WORD_VALUE:
        out.add(WORD_VALUE[k])
    out |= {w for w, v in WORD_VALUE.items() if v == k}
    return out


def carries(quote: str, key: str) -> bool:
    q = re.sub(r"(?<=\d)[,_](?=\d{3}(?!\d))", "", quote)
    for f in forms(key):
        if f.isalpha():
            if re.search(r"\b" + re.escape(f) + r"\b", q, flags=re.I):
                return True
        elif re.search(r"(?<![\d.])" + re.escape(f) + r"(?!\d)", q):
            return True
    return False


_cache: dict[str, str] = {}


def source_text(key: str) -> str | None:
    if key in _cache:
        return _cache[key]
    where = SOURCES.get(key)
    if where is None:
        return None
    if where.startswith("http"):
        got = subprocess.run(["curl", "-s", "-L", "--max-time", "30", where], capture_output=True, text=True)
        text = got.stdout if got.returncode == 0 else ""
        if re.search(r"<html\b", text[:4000], flags=re.I):
            # a web page: read its words, not its markup, so a tag cannot split a quote
            text = flatten(text)
        if where.endswith(".py"):
            # a quote from a comment may run across lines; read the comment, not its markers
            text = re.sub(r"(?m)^\s*#\s?", "", text)
    else:
        text = flatten((ROOT / where).read_text(encoding="utf-8"))
    _cache[key] = norm(text)
    return _cache[key]


def check_entry(where: str, key: str, entry: dict, ledgered: set[str] | None = None) -> None:
    kinds = [k for k in ("source", "derived", "toy", "count", "editorial") if k in entry]
    if len(kinds) != 1:
        fail.append(f"{where}: {key!r} needs exactly one of source, derived, toy, count or editorial")
        return
    kind = kinds[0]
    if kind == "source":
        text = source_text(entry["source"])
        if text is None:
            fail.append(f"{where}: {key!r} cites an unknown source {entry['source']!r}")
        elif not text:
            fail.append(f"{where}: {key!r}: could not read {entry['source']}")
        elif norm(entry.get("quote", "")) not in text:
            fail.append(f"{where}: {key!r}: {entry['source']} does not say {entry.get('quote')!r}")
        elif not entry.get("quote"):
            fail.append(f"{where}: {key!r} has an empty quote")
        elif not carries(entry["quote"], key) and not str(entry.get("means", "")).strip():
            fail.append(f"{where}: {key!r}: the quote does not contain {key}; say in \"means\" how it yields it")
    elif kind == "derived":
        pv = printed_value(key)
        try:
            value = evaluate(entry["derived"])
        except Exception as why:  # noqa: BLE001
            fail.append(f"{where}: {key!r}: {why}")
            return
        if pv is None:
            fail.append(f"{where}: {key!r} is a word; a word cannot be derived, cite or count it")
            return
        explained = set((entry.get("with") or {}).keys())
        for op in re.findall(r"\d+(?:\.\d+)?", entry["derived"]):
            if ledgered is not None and op not in ledgered | UNIT_CONSTANTS | explained:
                fail.append(f"{where}: {key!r} is derived from {op}, which this lesson does not ledger; "
                            "ledger it or explain it under \"with\"")
        target, decimals = pv
        if entry.get("about"):
            if abs(value - target) > 0.012 * max(abs(target), 1e-9):
                fail.append(f"{where}: {key!r} is about {target} and {entry['derived']} is {value}")
        elif round(value, decimals) != target:
            fail.append(f"{where}: {key!r}: {entry['derived']} is {value}, which does not print as {key}")
    else:
        if not str(entry[kind]).strip():
            fail.append(f"{where}: {key!r}: a {kind} needs a reason")


# ------------------------------------------------------------------ the gate

def check_book(book: str, list_only: bool) -> None:
    path = PUBLIC / "books" / book / "index.html"
    page = path.read_text(encoding="utf-8")
    tree = Tree(page)
    body = find(tree.root, lambda n: n["tag"] == "body")
    if not body or body[0]["attrs"].get("data-book") != book:
        fail.append(f"{path}: body data-book is not {book}")
    if page.count("<script") != 1 or SCRIPT_TAG not in page:
        fail.append(f"{path}: must carry exactly {SCRIPT_TAG}")
    head_end = page.find("</head>")
    if page.find(SCRIPT_TAG) > head_end:
        fail.append(f"{path}: the module script belongs in the head")

    intro = find(tree.root, lambda n: n["tag"] == "section" and cls(n, "book-intro"))
    lessons = find(tree.root, lambda n: n["tag"] == "article" and cls(n, "lesson"))
    if len(intro) != 1 or not intro[0]["attrs"].get("data-figure"):
        fail.append(f"{path}: needs one section.book-intro with data-figure")
    ids = [n["attrs"].get("id") for n in lessons]
    if ids != [f"lesson-{i}" for i in range(1, 11)]:
        fail.append(f"{path}: lessons are {ids}, not lesson-1 to lesson-10")

    figs_path = PUBLIC / "books/engine" / f"figures-{book}.js"
    figs_src = figs_path.read_text(encoding="utf-8") if figs_path.is_file() else ""
    declared = set(re.findall(r"^  ([a-zA-Z0-9_]+)\(ctx\) \{", figs_src, flags=re.M))
    if not figs_src:
        fail.append(f"{figs_path} is missing")
    if intro and intro[0]["attrs"].get("data-figure") not in declared:
        fail.append(f"{path}: the title page's figure {intro[0]['attrs'].get('data-figure')} is not in {figs_path.name}")

    ledger_path = TOOLS / f"claims-{book}.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))["lessons"] if ledger_path.is_file() else {}
    if not ledger_path.is_file():
        fail.append(f"{ledger_path} is missing")

    titles = []
    for node in lessons:
        lid = node["attrs"].get("id", "?")
        where = f"{book} {lid}"
        name = node["attrs"].get("data-figure")
        if name not in declared:
            fail.append(f"{where}: figure {name!r} is not in {figs_path.name}")
        h2 = find(node, lambda n: n["tag"] == "h2")
        titles.append(flatten(html_of(page, h2[0])) if h2 else "")
        lp = find(node, lambda n: cls(n, "lesson-page"))
        if len(lp) != 1:
            fail.append(f"{where}: needs one .lesson-page")
            continue
        for part, pred in (("kicker", lambda n: cls(n, "kicker")), ("h2", lambda n: n["tag"] == "h2"),
                           ("rule", lambda n: cls(n, "rule"))):
            if len(find(lp[0], pred)) != 1:
                fail.append(f"{where}: the left page needs exactly one {part}")
        fs = find(lp[0], lambda n: n["tag"] == "fieldset" and cls(n, "predict"))
        if len(fs) != 1:
            fail.append(f"{where}: needs one fieldset.predict")
        else:
            answer = fs[0]["attrs"].get("data-answer")
            values = [i["attrs"].get("value") for i in find(fs[0], lambda n: n["tag"] == "input")]
            if values.count(answer) != 1 or len(values) < 2 or len(set(values)) != len(values):
                fail.append(f"{where}: the prediction's answer {answer!r} must match exactly one of {values}")
            if not find(fs[0], lambda n: n["tag"] == "details"):
                fail.append(f"{where}: the prediction needs its answer in a details")
        fig = find(node, lambda n: n["tag"] == "figure" and cls(n, "lesson-figure"))
        if len(fig) != 1:
            fail.append(f"{where}: needs one figure.lesson-figure")
        else:
            f = fig[0]
            if f["attrs"].get("data-badge") not in ("real", "toy"):
                fail.append(f"{where}: the figure's data-badge must be real or toy")
            steps = find(f, lambda n: n["tag"] == "ol" and cls(n, "figure-steps"))
            items = find(steps[0], lambda n: n["tag"] == "li") if steps else []
            if not 2 <= len(items) <= 6:
                fail.append(f"{where}: a figure has 2 to 6 steps, not {len(items)}")
            for li in items:
                if not li["kids"] or li["kids"][0]["tag"] != "strong":
                    fail.append(f"{where}: every step starts with its label in <strong>")
            for part, pred in (("figcaption", lambda n: n["tag"] == "figcaption"), ("big idea", lambda n: cls(n, "big-idea"))):
                if len(find(f, pred)) != 1:
                    fail.append(f"{where}: the figure needs exactly one {part}")
        notes = find(node, lambda n: n["tag"] == "aside" and cls(n, "lesson-notes"))
        if len(notes) != 1 or len([k for k in notes[0]["kids"] if k["tag"] == "section"]) != 3:
            fail.append(f"{where}: needs aside.lesson-notes with three sections")

        # the numbers
        found = numbers_in(lesson_text(page, node))
        fig_found = numbers_in(figure_strings(figs_src, name or ""))
        entry = ledger.get(lid, {})
        figure_entry = entry.get("figure", {})
        if list_only:
            print(f"{where}: {sorted(found)}   figure: {sorted(fig_found)}")
            continue
        claims = {k: v for k, v in entry.items() if k != "figure"}
        for key in sorted(found - set(claims)):
            fail.append(f"{where}: prints {key!r} and the ledger does not say where it comes from")
        for key in sorted(set(claims) - found):
            fail.append(f"{where}: the ledger lists {key!r} and the lesson no longer prints it")
        for key in sorted(fig_found - set(figure_entry) - set(claims)):
            fail.append(f"{where}: figure {name} prints {key!r} with no ledger entry")
        for key in sorted(set(figure_entry) - fig_found):
            fail.append(f"{where}: the ledger lists {key!r} under figure and figure {name} no longer prints it")
        ledgered = set().union(*(forms(k) for k in {**claims, **figure_entry})) if (claims or figure_entry) else set()
        for key, value in {**claims, **figure_entry}.items():
            check_entry(where, key, value, ledgered)

    if intro:
        toc = find(intro[0], lambda n: n["tag"] == "ol" and cls(n, "book-toc"))
        links = find(toc[0], lambda n: n["tag"] == "a") if toc else []
        got = [(a["attrs"].get("href"), flatten(html_of(page, a))) for a in links]
        want = [(f"#lesson-{i + 1}", t) for i, t in enumerate(titles)]
        if got != want:
            fail.append(f"{path}: the contents list does not match the lessons' titles")
        if len(find(intro[0], lambda n: n["tag"] == "h1")) != 1:
            fail.append(f"{path}: the title page carries the one h1")
        # the title page's own claims: everything but its eyebrow and its contents list
        raw = html_of(page, intro[0])
        t = Tree(raw)
        cut = [(n["start"], n["end"]) for n in walk(t.root)
               if (n["tag"] == "p" and cls(n, "book-eyebrow")) or (n["tag"] == "ol" and cls(n, "book-toc"))]
        for a, b in sorted(cut, reverse=True):
            raw = raw[:a] + raw[b:]
        intro_numbers = numbers_in(flatten(raw))
        claims = ledger.get("intro", {})
        if list_only:
            print(f"{book} intro: {sorted(intro_numbers)}")
        else:
            for key in sorted(intro_numbers - set(claims)):
                fail.append(f"{book} intro: prints {key!r} and the ledger does not say where it comes from")
            for key in sorted(set(claims) - intro_numbers):
                fail.append(f"{book} intro: the ledger lists {key!r} and the title page no longer prints it")
            ledgered = set().union(*(forms(k) for k in claims)) if claims else set()
            for key, value in claims.items():
                check_entry(f"{book} intro", key, value, ledgered)

    # the head: what a search result or a shared link shows
    every = set().union(*(forms(k) for entry in ledger.values() for k in
                          (list(entry) + list(entry.get("figure", {}))) if k != "figure")) if ledger else set()
    for key in sorted(head_numbers(page)):
        if not forms(key) & every:
            fail.append(f"{path}: the head prints {key!r} and the book's ledger does not say where it comes from")


def check_scripts() -> None:
    # keyed from the repository root, so the gate reads the same pages from any directory
    pages = {p.relative_to(ROOT).as_posix(): p.read_text(encoding="utf-8") for p in sorted(PUBLIC.rglob("*.html"))}
    for name, text in pages.items():
        is_book = re.match(r"public/books/(beginner|intermediate|advanced)/index\.html$", name)
        tags = re.findall(r"<script\b[^>]*>", text, flags=re.I)
        if is_book:
            continue
        if tags:
            fail.append(f"{name} carries a script tag; only the three book pages may")
    engine = PUBLIC / "books/engine"
    for js in sorted(engine.glob("*.js")):
        src = js.read_text(encoding="utf-8")
        for ch, what in (("—", "an em dash"), ("–", "an en dash")):
            if ch in src:
                fail.append(f"{js.relative_to(ROOT)} contains {what}")
        if "reward model" in src:
            fail.append(f"{js.relative_to(ROOT)} claims a reward model")
        if "Duck Studio" in src:
            fail.append(f"{js.relative_to(ROOT)} uses the app's old name")
        if "RLHF" in src:
            fail.append(f"{js.relative_to(ROOT)} says RLHF; the pages say it, with what it means")
        if re.search(r"https?://", src):
            fail.append(f"{js.relative_to(ROOT)} names a remote address; the books load nothing from anywhere else")
        if re.search(r"\beval\s*\(|new Function\b|fetch\s*\(|XMLHttpRequest|WebSocket", src):
            fail.append(f"{js.relative_to(ROOT)} evaluates code or opens a connection")
        for imp in re.findall(r"""(?:from|import)\s*\(?\s*['"`]([^'"`]+)['"`]""", src):
            if "${" in imp:
                continue
            if not (js.parent / imp).resolve().is_file():
                fail.append(f"{js.relative_to(ROOT)} imports {imp}, which does not exist")
    for book in BOOKS:
        if not (engine / f"figures-{book}.js").is_file():
            fail.append(f"public/books/engine/figures-{book}.js is missing; book.js imports it")
    # the vendored library, byte for byte
    sums = (TOOLS / "vendor.sha256").read_text(encoding="utf-8").split("\n")
    for line in filter(None, sums):
        digest, rel = line.split(maxsplit=1)
        f = ROOT / rel.strip()
        if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest() != digest:
            fail.append(f"{rel.strip()} is not the vendored file tools/books/vendor.sha256 records")
    if not (PUBLIC / "books/vendor/LICENSE-three.txt").is_file():
        fail.append("three.js's licence is not beside it")


def check_headers() -> None:
    rules = []
    current = None
    for raw in (PUBLIC / "_headers").read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw[0].isspace():
            current = {"pattern": raw.strip(), "headers": {}}
            rules.append(current)
        else:
            name, _, value = raw.strip().partition(":")
            if name.startswith("!"):
                fail.append(f"_headers detaches {name[1:].strip()}; this site sets each policy once instead")
            current["headers"][name.strip().lower()] = value.strip()

    def matches(pattern: str, path: str) -> bool:
        rx = "^" + re.escape(pattern).replace(r"\*", ".*") + "$"
        return re.match(rx, path) is not None

    for page in sorted(PUBLIC.rglob("*.html")):
        rel = "/" + page.relative_to(PUBLIC).as_posix()
        url = rel[: -len("index.html")] if rel.endswith("/index.html") or rel == "/index.html" else rel
        csps = [r for r in rules if "content-security-policy" in r["headers"] and matches(r["pattern"], url)]
        if len(csps) != 1:
            fail.append(f"{url} is under {len(csps)} security policies in _headers, not exactly one")
            continue
        csp = csps[0]["headers"]["content-security-policy"]
        if url.startswith("/books/"):
            if "script-src 'self'" not in csp or re.search(r"script-src[^;]*(unsafe|https?:|\*)", csp):
                fail.append(f"{url}: the books' policy must allow the site's own scripts and nothing else")
        elif "script-src" in csp:
            fail.append(f"{url}: only the books may run scripts, and its policy names script-src")
        if "default-src 'none'" not in csp:
            fail.append(f"{url}: its policy must start from default-src 'none'")


def check_plain(rel: str, ledger: str, key_name: str, label: str, list_only: bool) -> int:
    """A plain page: every number in its main and its head ledgered, and no script."""
    path = PUBLIC / rel
    if not path.is_file():
        fail.append(f"public/{rel} is missing")
        return 0
    page = path.read_text(encoding="utf-8")
    m = re.search(r"<main\b.*?</main>", page, flags=re.S)
    found = numbers_in(flatten(m.group(0) if m else ""))
    claims = json.loads((TOOLS / ledger).read_text(encoding="utf-8"))["lessons"][key_name]
    if list_only:
        print(f"{key_name}: {sorted(found)}")
        return len(claims)
    for key in sorted(found - set(claims)):
        fail.append(f"{label} prints {key!r} and tools/books/{ledger} does not say where it comes from")
    for key in sorted(set(claims) - found):
        fail.append(f"tools/books/{ledger} lists {key!r} and {label} no longer prints it")
    ledgered = set().union(*(forms(k) for k in claims)) if claims else set()
    for key, value in claims.items():
        check_entry(key_name, key, value, ledgered)
    for key in sorted(head_numbers(page)):
        if not forms(key) & ledgered:
            fail.append(f"{label}'s head prints {key!r} and tools/books/{ledger} does not say where it comes from")
    if "<script" in page:
        fail.append(f"{label} carries a script; it is a plain page")
    return len(claims)


def main() -> int:
    list_only = "--list" in sys.argv[1:]
    plain = {key_name: check_plain(rel, ledger, key_name, label, list_only)
             for rel, ledger, key_name, label in PLAIN}
    for book in BOOKS:
        if (PUBLIC / "books" / book / "index.html").is_file():
            check_book(book, list_only)
        else:
            fail.append(f"public/books/{book}/index.html is missing")
    if list_only:
        return 0
    check_scripts()
    check_headers()
    if fail:
        for problem in fail:
            print("check_books: " + problem, file=sys.stderr)
        return 1
    count = sum(len(json.loads((TOOLS / f"claims-{b}.json").read_text())["lessons"]) for b in BOOKS)
    print(f"check_books: three books, thirty lessons, every number in {count} ledgers sourced, "
          f"derived or labelled, the training guide's {plain['train']} as well, "
          "and scripts only where the policy allows them")
    return 0


if __name__ == "__main__":
    sys.exit(main())
