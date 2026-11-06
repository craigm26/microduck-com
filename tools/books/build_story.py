#!/usr/bin/env python3
"""Draw a story book's pages from its source. Plain static pages, no script tag,
except the two pages a picture book adds, each with one module tag.

    python3 tools/books/build_story.py            # write public/stories/<slug>/
    python3 tools/books/build_story.py --check    # exit 1 if any page is stale

ONLY WHAT BOOK.JSON LISTS IS BUILT. tools/books/<slug>/unpublished/ holds older
sources this script never reads, and scripts/check_story.py fails if their pages
or pictures come back to public/.

THE STORY TEXT IS NEVER RETYPED. A prose chapter's words live in
tools/books/<slug>/chapter-<n>.md, in the form the draft has them: one heading,
paragraphs, a `> ` log, then Real robots, Big Question and Try It. This script
wraps them in markup and changes no word, so scripts/check_story.py can read
every source paragraph back off the built page.

PICTURES ARE SLOTS. book.json says where each slot goes (`after` is the start of
the paragraph before it), the size of the art, its alt text and its `image`, a
file under public/stories/<slug>/. A slot with no `image` draws a labelled empty
frame of that shape. A slot naming a file that is not there stops the build. Add
art by giving the slot an `image` and a true alt, never by editing a built page.

A PICTURE BOOK IS ONE SOURCE, DRAWN TWICE. picture-<n>.json holds a chapter's
read-aloud words, where each block sits on its spread (in percent of the spread)
and the sheets of its art. picture/ draws them as a page-turning book and 3d/ as
the same markup under the learning books' engine. Without a script both are the
same plain scrolling page, which is why the words live in the markup and never
in a script or a picture. The one thing printed in the art is a sound word, and
the markup still carries it for a screen reader, and for the gate.

THE STYLESHEET STAYS THE SITE'S. check_site_claims.sh holds every page to one
stamped site.css, so the story look is the `.story-` section of that file.
"""

from __future__ import annotations

import hashlib
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
TOOLS = ROOT / "tools/books"
PUBLIC = ROOT / "public"
SITE = "https://microduckstudio.com"
BOOKS = ("the-duck-who-stayed",)
INDEPENDENCE = ("Microduck Studio is an independent project. It is not made by, endorsed by, "
                "or affiliated with Pollen Robotics. Microduck is their robot; this is an "
                "independent owner's app for it.")
# On every page a child reads, because a shared link lands on a chapter, not the shelf.
KIND = "Story book · Fiction"
# A child's page links only within the book. The page for grown-ups is the one way
# out, and only to these. Each of them carries the site's header, so what lies one
# step further is the grown-up's choice, which is why that page is the only door.
GROWN_UP_LINKS = ("/books/", "/books/#learning-books", "/cards/", "/cards/print/",
                  "mailto:feedback@microduckstudio.com")
SOUNDS = {"Clonk.", "Bump!"}
ENDINGS = ("Real robots.", "Big Question (back page).", "Try It:")


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def attr(text: str) -> str:
    return html.escape(text, quote=True)


def parse_chapter(text: str) -> dict:
    """One chapter's source, split into its heading, story, log and back matter."""
    blocks = [block for block in re.split(r"\n\s*\n", text.strip()) if block.strip()]
    heading = re.fullmatch(r"## Chapter (\d+): (.+)", blocks[0].strip())
    if not heading:
        raise SystemExit(f"build_story: a chapter must open '## Chapter N: Title': {blocks[0]!r}")
    story, log, ends = [], [], []
    for block in blocks[1:]:
        if block.startswith("> "):
            log = [line[2:].strip() for line in block.splitlines()]
        elif (lead := re.fullmatch(r"\*\*(.+?)\*\* (.+)", block, flags=re.S)) and lead[1].startswith(ENDINGS):
            ends.append((lead[1], lead[2]))
        else:
            story.append(block.strip())
    if not log or len(ends) != len(ENDINGS):
        raise SystemExit(f"build_story: chapter {heading[1]} needs a log and {len(ENDINGS)} "
                         "closing panels (Real robots, Big Question, Try It)")
    if not log[0].startswith("**") or not log[0].endswith("**"):
        raise SystemExit(f"build_story: chapter {heading[1]}'s log must open with a bold line")
    return {"number": int(heading[1]), "title": heading[2], "story": story,
            "log_title": log[0].strip("*"), "log": log[1:], "ends": ends}


def load(slug: str) -> tuple[dict, list[dict]]:
    book = json.loads((TOOLS / slug / "book.json").read_text(encoding="utf-8"))
    chapters = []
    for entry in book["chapters"]:
        chapter = parse_chapter((TOOLS / slug / entry["source"]).read_text(encoding="utf-8"))
        if chapter["number"] != entry["number"]:
            raise SystemExit(f"build_story: {entry['source']} says chapter {chapter['number']}, "
                             f"book.json says {entry['number']}")
        chapters.append(chapter | {"slots": entry["slots"], "description": entry["description"]})
    return book, chapters


def stylesheet() -> str:
    digest = hashlib.sha256((PUBLIC / "assets/site.css").read_bytes()).hexdigest()[:10]
    return f"/assets/site.css?v={digest}"


def slot(data: dict, slug: str, *, first: bool = False) -> str:
    if not str(data.get("alt", "")).strip():
        raise SystemExit(f"build_story: picture slot {data.get('id')} has no alt text; "
                         'give it an "alt" field in book.json')
    tall = " story-slot-tall" if data["height"] > data["width"] else ""
    head = (f'<figure class="story-slot{tall}" id="picture-{attr(data["id"])}" '
            f'data-art-width="{data["width"]}" data-art-height="{data["height"]}">')
    if not data.get("image"):
        return (f'{head}\n  <div class="story-slot-frame" role="img" aria-label="{attr(data["alt"])}">'
                f'<span>Picture to come</span></div>\n</figure>')
    src = f'/stories/{slug}/{data["image"]}'
    if not (PUBLIC / src.lstrip("/")).is_file():
        raise SystemExit(f"build_story: picture slot {data['id']} names public{src}, which does not exist")
    lazy = "" if first else ' loading="lazy"'
    return (f'{head}\n  <img class="story-slot-art" src="{attr(src)}" alt="{attr(data["alt"])}" '
            f'width="{data["width"]}" height="{data["height"]}" decoding="async"{lazy}>\n</figure>')


def page(book: dict, path: str, title: str, description: str, body: str, *,
         head: str = "", body_attrs: str = 'class="story-page"', bar: str = "") -> str:
    robots = '<meta name="robots" content="noindex">\n' if book["status"] == "draft" else ""
    home = f'/stories/{book["slug"]}/'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{attr(description)}">
{robots}<link rel="canonical" href="{SITE}{path}">
<meta name="theme-color" content="#f5eddd">
<link rel="icon" type="image/png" href="/assets/studio-icon.png">
<link rel="stylesheet" href="{stylesheet()}">
{head}</head>
<body {body_attrs}>
<a class="skip" href="#main">Skip to content</a>
<header class="story-bar">
  <a href="{home}">{esc(book["title"])}</a>
{bar}  <a href="{home}grown-ups/">For grown-ups</a>
</header>

{body}

<footer class="story-foot">
  <p>{esc(book["licence"])}</p>
  <p>{esc(INDEPENDENCE)}</p>
</footer>
</body>
</html>
"""


def chapter_page(book: dict, chapter: dict, chapters: list[dict]) -> str:
    home = f'/stories/{book["slug"]}/'
    slots = {}
    for data in chapter["slots"]:
        hits = [text for text in chapter["story"] if text.startswith(data["after"])]
        if len(hits) != 1:
            raise SystemExit(f"build_story: slot {data['id']} needs one paragraph starting "
                             f"{data['after']!r} and found {len(hits)}")
        slots[hits[0]] = data
    story = []
    for text in chapter["story"]:
        sound = ' class="story-sound"' if text in SOUNDS else ""
        story.append(f"<p{sound}>{esc(text)}</p>")
        if text in slots:
            story.append(slot(slots[text], book["slug"]))
    log = "\n".join(f"    <li>{esc(line)}</li>" for line in chapter["log"])
    ends = []
    for lead, text in chapter["ends"]:
        kind = "robots" if lead.startswith("Real") else "question" if lead.startswith("Big") else "try"
        ends.append(f'<section class="story-end story-{kind}">\n'
                    f"  <p><strong>{esc(lead)}</strong> {esc(text)}</p>\n</section>")
    at = chapters.index(chapter)
    links = []
    if at:
        before = chapters[at - 1]
        links.append(f'<a rel="prev" href="{home}{before["number"]}/">Chapter {before["number"]}: '
                     f'{esc(before["title"])}</a>')
    links.append(f'<a href="{home}">All chapters</a>')
    if at + 1 < len(chapters):
        after = chapters[at + 1]
        links.append(f'<a rel="next" href="{home}{after["number"]}/">Chapter {after["number"]}: '
                     f'{esc(after["title"])}</a>')
    moves = "\n".join(f"  {link}" for link in links)
    story_html = "\n".join(story)
    ends_html = "\n".join(ends)
    body = f"""<main id="main" tabindex="-1" class="story-main">
<article>
<header class="story-head">
  <p class="story-kind">{KIND}</p>
  <h1><span class="story-number">Chapter {chapter["number"]}</span> {esc(chapter["title"])}</h1>
  <p class="story-draft">{esc(book["draft_line"])}</p>
</header>

<div class="story-text">
{story_html}
</div>

<aside class="story-log" aria-label="Wren's log">
  <p class="story-log-title">{esc(chapter["log_title"])}</p>
  <ul>
{log}
  </ul>
</aside>

{ends_html}
<p class="story-web-note">On the web, the Duck Cards are on the <a href="{home}grown-ups/">page for grown-ups</a>.</p>
</article>
</main>

<nav class="story-moves" aria-label="Chapters">
{moves}
</nav>"""
    return page(book, f'{home}{chapter["number"]}/',
                f'Chapter {chapter["number"]}: {chapter["title"]} | {book["title"]}',
                chapter["description"], body)


def home_page(book: dict) -> str:
    """One chapter, its two editions and nothing about chapters that do not exist yet."""
    home = f'/stories/{book["slug"]}/'
    chapter = picture_source(book["slug"], book)["title"]
    body = f"""<main id="main" tabindex="-1" class="story-main">
<header class="story-head story-title">
  <p class="story-kind">{KIND}</p>
  <h1>{esc(book["title"])}</h1>
  <p class="story-tagline">{esc(book["tagline"])}</p>
  <p class="story-draft">{esc(book["draft_line"])}</p>
</header>

{slot(book["cover"], book["slug"], first=True)}

<p class="story-blurb">{esc(book["blurb"])}</p>

<section aria-labelledby="chapter-title">
  <h2 id="chapter-title">{esc(chapter)}</h2>
  <ul class="story-chapters">
    <li><a href="{home}picture/">Read the picture book</a></li>
    <li><a href="{home}3d/">Open the 3-D book</a></li>
  </ul>
</section>

<p class="story-out"><a href="{home}grown-ups/">For grown-ups</a></p>
</main>"""
    return page(book, home, f'{book["title"]} | Microduck Studio story books',
                f'{book["title"]}, a first draft of a story to read aloud. {book["blurb"]}', body)


def grown_ups_page(book: dict) -> str:
    home = f'/stories/{book["slug"]}/'
    content = (TOOLS / book["slug"] / "grown-ups.html").read_text(encoding="utf-8").strip()
    body = f"""<main id="main" tabindex="-1" class="story-main story-notes">
<header class="story-head">
  <p class="story-kind">{esc(book["title"])}</p>
  <h1>For grown-ups</h1>
</header>

{content}

<p class="story-out"><a href="{home}">Back to the book</a> · <a href="/books/">All Microduck books</a></p>
</main>"""
    return page(book, f"{home}grown-ups/", f'For grown-ups | {book["title"]}',
                f'A note for parents, Duck Cards and contact for {book["title"]}.', body)


PICTURE_TAG = '<script type="module" src="/books/engine/picture.js"></script>'
BOOK_TAG = '<script type="module" src="/books/engine/book.js"></script>'
ART_WIDTH, ART_HEIGHT = 1800, 1200
INLINE = re.compile(r'&lt;span class=&quot;(pb-big|pb-chant|pb-pen)&quot;&gt;(.*?)&lt;/span&gt;')


def picture_source(slug: str, book: dict) -> dict:
    return json.loads((TOOLS / slug / book["picture"]).read_text(encoding="utf-8"))


def art_files(spec: dict) -> list[str]:
    """Every file a spread needs: the flat picture, then, if it has sheets, the room and each sheet."""
    names = [f'{spec["art"]}.webp']
    if spec.get("sheets"):
        names += [f'{spec["art"]}-back.webp'] + [f'{spec["art"]}-{sheet["name"]}.webp' for sheet in spec["sheets"]]
    return names


def line(text: str) -> str:
    """One line of the words, with the three marks a line may carry and nothing else."""
    return INLINE.sub(r'<span class="\1">\2</span>', html.escape(text, quote=True))


def zone(data: dict) -> str:
    if "art" in data:  # a sound word lettered into the picture: the art shows it, the markup says it
        return f'<p class="pb-said">{esc(data["art"])}</p>'
    kind = f' pb-{data["kind"]}' if data.get("kind") else ""
    tight = " pb-tight" if data.get("tight") else ""
    lines = "".join(f"<p>{line(text)}</p>" for text in data["p"])
    return (f'<div class="pb-z{kind}{tight}" style="--x:{data["x"]};--y:{data["y"]};--w:{data["w"]}">{lines}</div>')


def title_zone(book: dict, source: dict, data: dict) -> str:
    return (f'<div class="pb-z pb-title-z" style="--x:{data["x"]};--y:{data["y"]};--w:{data["w"]}">'
            f'<p class="story-kind">{KIND}</p><h1>{esc(book["title"])}</h1>'
            f'<p class="pb-chapter">{esc(source["title"])}</p>'
            f'<p class="pb-for">{esc(source["audience"])}</p>'
            f'<p class="pb-draft">{esc(book["draft_line"])}</p></div>')


def spread(slug: str, spec: dict, number: int, *, engine: bool, words: str, alt: str, title: str = "") -> str:
    """One spread. The same markup for both editions: engine adds the classes book.js reads."""
    src = f'/stories/{slug}/{spec["art"]}.webp'
    if not (PUBLIC / src.lstrip("/")).is_file():
        raise SystemExit(f"build_story: public{src} does not exist")
    lazy = ' loading="lazy"' if number else ""
    art = (f'<img class="pb-art" src="{attr(src)}" alt="{attr(alt)}" width="{ART_WIDTH}" height="{ART_HEIGHT}" '
           f'decoding="async"{lazy}>')
    heading = f'<h2 class="pb-title">{esc(title)}</h2>\n' if title else ""
    if engine:
        sheets = attr(json.dumps(spec.get("sheets", []), separators=(",", ":")))
        data = f'data-art="/stories/{slug}/{spec["art"]}" data-sheets="{sheets}"'
        kind, inner, sid = ("lesson", "lesson-page", f"lesson-{number}") if number else ("book-intro", "book-intro-page", "title-page")
        return (f'<article class="pb-spread {kind}" id="{sid}" {data}>\n{heading}'
                f'<div class="pb-canvas {inner}">\n{art}\n<div class="pb-words">\n{words}\n</div>\n</div>\n</article>')
    return (f'<article class="pb-spread" id="spread-{number}">\n{heading}'
            f'<div class="pb-canvas">\n{art}\n<div class="pb-words">\n{words}\n</div>\n</div>\n</article>')


def picture_body(book: dict, source: dict, *, engine: bool) -> str:
    slug = book["slug"]
    first = source["title_page"]
    parts = [spread(slug, first, 0, engine=engine, words=title_zone(book, source, first["zones"][0]), alt=first["alt"])]
    for number, data in enumerate(source["spreads"], 1):
        words = "\n".join(zone(item) for item in data["zones"])
        parts.append(spread(slug, data, number, engine=engine, words=words, alt=data["alt"], title=data["title"]))
    return "\n\n".join(parts)


def picture_page(book: dict, source: dict) -> str:
    home = f'/stories/{book["slug"]}/'
    body = f"""<main id="main" tabindex="-1" class="pb-main">
{picture_body(book, source, engine=False)}
</main>"""
    return page(book, f"{home}picture/", f'{source["title"]}, picture book | {book["title"]}', source["description"], body,
                head=f"{PICTURE_TAG}\n", body_attrs='class="story-page pb-page"',
                bar=f'  <a class="pb-switch" href="{home}3d/">Open the 3-D book</a>\n')


def book3d_page(book: dict, source: dict) -> str:
    home = f'/stories/{book["slug"]}/'
    body = f"""<main id="main" tabindex="-1" class="pb-main">
{picture_body(book, source, engine=True)}
</main>"""
    return page(book, f"{home}3d/", f'{source["title"]}, 3-D book | {book["title"]}', source["description_3d"], body,
                head=f"{BOOK_TAG}\n",
                body_attrs=(f'class="story-page book-page pb-page pb-3d" data-book="story" data-spreads="" '
                            f'data-unit="Page" data-label="Story book" data-flat="{home}picture/" '
                            f'data-cover="{home}art/cover.webp"'),
                bar=f'  <a class="pb-switch" href="{home}picture/">Flat picture book</a>\n')


def pages_for(slug: str) -> dict[pathlib.Path, str]:
    book, chapters = load(slug)
    base = PUBLIC / "stories" / slug
    out = {base / "index.html": home_page(book),
           base / "grown-ups/index.html": grown_ups_page(book)}
    for chapter in chapters:
        out[base / str(chapter["number"]) / "index.html"] = chapter_page(book, chapter, chapters)
    if book.get("picture"):
        source = picture_source(slug, book)
        out[base / "picture/index.html"] = picture_page(book, source)
        out[base / "3d/index.html"] = book3d_page(book, source)
    return out


def main() -> int:
    check = "--check" in sys.argv[1:]
    stale = []
    for slug in BOOKS:
        for path, text in pages_for(slug).items():
            current = path.read_text(encoding="utf-8") if path.is_file() else None
            if current == text:
                continue
            stale.append(path)
            if not check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
    if check and stale:
        for path in stale:
            print(f"build_story: {path.relative_to(ROOT)} is stale; run python3 tools/books/build_story.py",
                  file=sys.stderr)
        return 1
    print(f"build_story: {'all pages current' if check else f'{len(stale)} pages written'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
