#!/usr/bin/env python3
"""Draw a story book's pages from its source. Plain static pages, no script tag.

    python3 tools/books/build_story.py            # write public/stories/<slug>/
    python3 tools/books/build_story.py --check    # exit 1 if any page is stale

THE STORY TEXT IS NEVER RETYPED. A chapter's words live in
tools/books/<slug>/chapter-<n>.md, in the form the draft has them: one heading,
paragraphs, a `> ` log, then Real robots, Big Question and Try It. This script
wraps them in markup and changes no word, so scripts/check_story.py can read
every source paragraph back off the built page.

PICTURES ARE SLOTS. book.json says where each slot goes (`after` is the start of
the paragraph before it), the size the art must be, and its alt text. A slot
draws a labelled empty frame of that shape. Add art by changing this script's
slot() and the slot's alt, never by editing a built page.

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


def slot(data: dict) -> str:
    if not str(data.get("alt", "")).strip():
        raise SystemExit(f"build_story: picture slot {data.get('id')} has no alt text; "
                         'give it an "alt" field in book.json')
    tall = " story-slot-tall" if data["height"] > data["width"] else ""
    return (f'<figure class="story-slot{tall}" id="picture-{attr(data["id"])}" '
            f'data-art-width="{data["width"]}" data-art-height="{data["height"]}">\n'
            f'  <div class="story-slot-frame" role="img" aria-label="{attr(data["alt"])}">'
            f'<span>Picture to come</span></div>\n</figure>')


def page(book: dict, path: str, title: str, description: str, body: str) -> str:
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
</head>
<body class="story-page">
<a class="skip" href="#main">Skip to content</a>
<header class="story-bar">
  <a href="{home}">{esc(book["title"])}</a>
  <a href="{home}grown-ups/">For grown-ups</a>
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
            story.append(slot(slots[text]))
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


def home_page(book: dict, chapters: list[dict]) -> str:
    home = f'/stories/{book["slug"]}/'
    built = {chapter["number"]: chapter for chapter in chapters}
    rows = []
    for number in range(1, book["planned_chapters"] + 1):
        if number in built:
            rows.append(f'    <li><a href="{home}{number}/"><span>Chapter {number}</span> '
                        f'{esc(built[number]["title"])}</a></li>')
        else:
            rows.append(f'    <li class="story-unwritten"><span>Chapter {number}</span> Not written yet</li>')
    chapter_list = "\n".join(rows)
    body = f"""<main id="main" tabindex="-1" class="story-main">
<header class="story-head story-title">
  <p class="story-kind">{KIND}</p>
  <h1>{esc(book["title"])}</h1>
  <p class="story-tagline">{esc(book["tagline"])}</p>
  <p class="story-draft">{esc(book["draft_line"])}</p>
</header>

{slot(book["cover"])}

<p class="story-blurb">{esc(book["blurb"])}</p>

<section aria-labelledby="chapters-title">
  <h2 id="chapters-title">Chapters</h2>
  <ol class="story-chapters">
{chapter_list}
  </ol>
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


def pages_for(slug: str) -> dict[pathlib.Path, str]:
    book, chapters = load(slug)
    base = PUBLIC / "stories" / slug
    out = {base / "index.html": home_page(book, chapters),
           base / "grown-ups/index.html": grown_ups_page(book)}
    for chapter in chapters:
        out[base / str(chapter["number"]) / "index.html"] = chapter_page(book, chapter, chapters)
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
