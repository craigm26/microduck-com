#!/usr/bin/env python3
"""The story books stay plain, private to the reader, and true to their source.

    python3 scripts/check_story.py

Only the pages in PUBLISHED may exist, and only the pictures they use, with the same
list in the sitemap and in _headers. The book's home shows the chapter and its two
editions and lists nothing unwritten. Every story page must have no script tag, except the one module tag each edition
of a picture book carries, no third-party address and no link to kithgame.com; no em or en dash, in the pages or in the source; every chapter in
the source built, and every built chapter in the source; every word of a chapter
on its page in order; no picture idea on a page; an alt text on every picture
slot; every image a page names present in the book's folder and under the size
limit; the picture credit in the licence line and on the page for grown-ups; a
draft's noindex and licence line; chapters and a book's home that link
only within the book; and a page for grown-ups that links out only to the short
list in build_story.py. The pages must also be exactly what build_story.py draws,
so a hand edit fails here.

A PICTURE BOOK'S SCRIPT IS THE ONE EXCEPTION, AND IT STAYS SMALL. Its two pages may
each carry their one self-hosted module tag, the words stay in the markup in reading
order, so both still read with scripts off, and the scripts they run may not open a
window, send a beacon or point the page anywhere but this book.

WHY A GATE OF ITS OWN. check_site_claims.sh already bans scripts and remote
assets, but a plain link to another site is fine anywhere else on the site and is
not fine in a book a child reads. These pages promise a child's reader that
nothing leaves the book.

PUBLISHED IS THE OWNER'S CALL. On 2026-11-05 the owner said to publish chapter 1 only.
The older prose chapters and their art wait in tools/books/<slug>/unpublished/. A page
or picture that comes back to public/ fails here, even if book.json lists it, so
publishing more means changing this list on purpose.

A SLOT'S ALT TEXT IS A FIELD. An empty slot's field says what is missing and a
slot with art must say what the art shows. The check is that it exists, in source
and page, and that art never sits beside a "to come" alt.

Failures name the file and the fix. See the header of predeploy.sh for the
planted mistakes this was seen to fail on.
"""

from __future__ import annotations

import importlib.util
import os
import pathlib
import posixpath
import re
import sys
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
os.chdir(ROOT)  # site_helpers reads public/ from the repository root
from site_helpers import Markup, SITE_HOSTS, flatten  # noqa: E402

spec = importlib.util.spec_from_file_location("build_story", ROOT / "tools/books/build_story.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

fail: list[str] = []
URL = re.compile(r"""(?:https?:)?//[^\s"'<>)]+""", flags=re.IGNORECASE)
IDEAS = ("Picture ideas", "Picture-only joke", "THIS WAY UP", "WANTED poster", "bird's-eye")
DASHES = (("—", "an em dash"), ("–", "an en dash"))
MAX_ART = 400 * 1024
PUBLISHED = ("", "picture/", "3d/", "grown-ups/")  # under /stories/<slug>/, the owner's call
SOURCE_TEXT = (".md", ".json", ".html")
# Words of the older drafts and promises it made. None of them is true of what is published.
RETIRED = ("That we can know", "Two chapters", "Real robots", "Big Question", "Try It", "Bump",
           "Not written yet", "run no scripts and load nothing")


def rel(path: pathlib.Path) -> str:
    return path.relative_to(ROOT).as_posix()


def check_source(slug: str) -> None:
    folder = ROOT / "tools/books" / slug
    for path in sorted(item for item in folder.rglob("*") if item.suffix in SOURCE_TEXT):
        text = path.read_text(encoding="utf-8")
        for mark, name in DASHES:
            if mark in text:
                fail.append(f"{rel(path)} contains {name}; rewrite the sentence")
        if "kithgame.com" in text.lower():
            fail.append(f"{rel(path)} names kithgame.com; story books do not link to it")
        for idea in IDEAS:
            if idea.lower() in text.lower():
                fail.append(f"{rel(path)} holds a picture idea ({idea!r}); those stay in the draft")


def check_links(path: pathlib.Path, book: dict) -> None:
    """A child's page stays in the book. Only the page for grown-ups has a way out."""
    name = rel(path)
    home = f"/stories/{book['slug']}/"
    grown_ups = path.parent.name == "grown-ups"
    for tag, attrs in Markup(path.read_text(encoding="utf-8")).elements:
        href = attrs.get("href")
        if tag == "link" or not href or href.startswith("#"):
            continue
        target = href.split("?")[0]
        kept = posixpath.normpath(target.split("#")[0]) + "/" if target.startswith("/") else target
        if kept.startswith(home) and kept.removeprefix(home) not in PUBLISHED:
            fail.append(f"{name} links {href}, which is not a published page of this book")
            continue
        if kept.startswith(home) or (grown_ups and target in build.GROWN_UP_LINKS):
            continue
        fail.append(f"{name} links {href}; " + ("this page links out only to GROWN_UP_LINKS in "
                    "build_story.py" if grown_ups else "a child's page links only within the book"))


def check_image(name: str, src: str, book: dict) -> None:
    """An image a page names is in the book's folder, is there, and is small enough."""
    home = f"/stories/{book['slug']}/"
    if not posixpath.normpath(src).startswith(home):
        fail.append(f"{name} names the image {src!r}; a book's pictures live under public{home}")
        return
    art = ROOT / "public" / src.lstrip("/")
    if not art.is_file():
        fail.append(f"{name} names {src}, which does not exist; add the file or fix book.json")
    elif art.stat().st_size > MAX_ART:
        fail.append(f"{rel(art)} is {art.stat().st_size} bytes, over the {MAX_ART} limit; re-export it")


def check_page(path: pathlib.Path, book: dict) -> None:
    text = path.read_text(encoding="utf-8")
    name = rel(path)
    allowed = {"picture": [build.PICTURE_TAG], "3d": [build.BOOK_TAG]}.get(path.parent.name, []) if book.get("picture") else []
    tags = re.findall(r"<script\b[^>]*>(?:.*?</script>)?", text, flags=re.IGNORECASE | re.DOTALL)
    if tags != allowed:
        fail.append(f"{name} carries {tags}; a story page runs no scripts, and a picture book's page only {allowed}")
    markup = Markup(text)
    if "kithgame.com" in text.lower():
        fail.append(f"{name} names kithgame.com; story books do not link to it")
    for url in URL.findall(text):
        if urlsplit(url if ":" in url.split("//")[0] else "https:" + url).hostname not in SITE_HOSTS:
            fail.append(f"{name} names a third-party address: {url}")
    for tag, attrs in markup.elements:
        if any(attr.lower().startswith("on") for attr in attrs):
            fail.append(f"{name} carries an event handler on <{tag}>")
        if tag == "img" and not attrs.get("alt", "").strip():
            fail.append(f"{name} has an <img> with no alt text")
        if tag == "img":
            check_image(name, attrs.get("src", ""), book)
    for mark, label in DASHES:
        if mark in text:
            fail.append(f"{name} contains {label}; fix it in tools/books/{book['slug']}/")
    for idea in IDEAS:
        if idea.lower() in text.lower():
            fail.append(f"{name} prints a picture idea ({idea!r}); those stay out of the pages")
    if book["status"] == "draft" and '<meta name="robots" content="noindex">' not in text:
        fail.append(f"{name} is a draft and must carry <meta name=\"robots\" content=\"noindex\">")
    if book["licence"] not in flatten(text):
        fail.append(f"{name} has lost its licence line")
    if build.INDEPENDENCE not in flatten(text):
        fail.append(f"{name} has lost the statement that this is independent of Pollen Robotics")
    for words in RETIRED:
        if words.lower() in flatten(text).lower():
            fail.append(f"{name} says {words!r}, from an older draft; fix it in tools/books/{book['slug']}/")


STORY_SCRIPTS = ("picture.js", "figures-story.js")
OUTWARD = re.compile(r"window\.open|sendBeacon|\.href\s*=|location\s*=|target\s*=|createElement\(\s*['\"]a['\"]")


def check_picture(slug: str, book: dict) -> None:
    """Both editions carry every word in reading order, and every sheet of art is there."""
    source = build.picture_source(slug, book)
    base = ROOT / "public/stories" / slug
    words = []
    for data in source["spreads"]:
        if not str(data.get("alt", "")).strip():
            fail.append(f"{book['picture']}: spread {data.get('title')!r} has no alt text")
        words.append(data["title"])
        for item in data["zones"]:
            words += [item["art"]] if "art" in item else [re.sub(r"<[^>]+>", "", line) for line in item["p"]]
            # A phone shows one half of a spread at a time, so a box across the fold is cut in two.
            if "x" in item and item["x"] < 50 < item["x"] + item["w"]:
                fail.append(f"{book['picture']}: spread {data.get('title')!r} has words across the fold at x {item['x']}")
    for edition in ("picture", "3d"):
        path = base / edition / "index.html"
        if not path.is_file():
            fail.append(f"{rel(path)} is missing; run python3 tools/books/build_story.py")
            continue
        page, place = flatten(path.read_text(encoding="utf-8")), 0
        for line in words:
            found = page.find(line, place)
            if found < 0:
                fail.append(f"{rel(path)} does not carry, in order: {line[:70]!r}")
                continue
            place = found + len(line)
    for spec in [source["title_page"]] + source["spreads"]:
        for name in build.art_files(spec):
            check_image(f"tools/books/{slug}/{book['picture']}", f"/stories/{slug}/{name}", book)
    for script in STORY_SCRIPTS:
        code = (ROOT / "public/books/engine" / script).read_text(encoding="utf-8")
        for hit in OUTWARD.findall(code):
            fail.append(f"public/books/engine/{script} has {hit!r}; a child's page opens no way out")
    engine = (ROOT / "public/books/engine/book.js").read_text(encoding="utf-8")
    for hit in re.findall(r"location\.assign\(([^)]*)\)", engine):
        if "dataset.flat" not in hit:
            fail.append(f"public/books/engine/book.js leaves the page with location.assign({hit})")


def check_published(slug: str, book: dict) -> None:
    """Exactly the published pages and the pictures they use, on disk and in every list of them."""
    base = ROOT / "public/stories" / slug
    wanted = {base / part / "index.html" for part in PUBLISHED}
    source = build.picture_source(slug, book)
    art = {base / book["cover"]["image"]}
    for spec in [source["title_page"]] + source["spreads"]:
        art |= {base / name for name in build.art_files(spec)}
    for path in sorted(item for item in base.rglob("*") if item.is_file()):
        if path not in wanted | art:
            fail.append(f"{rel(path)} is not a published page or a picture one uses; only {PUBLISHED} "
                        f"are published, so move it to tools/books/{slug}/unpublished/")
    for path in sorted(wanted - {item for item in wanted if item.is_file()}):
        fail.append(f"{rel(path)} is missing; run python3 tools/books/build_story.py")

    urls = {f"/stories/{slug}/{part}" for part in PUBLISHED}
    listed = {urlsplit(url).path for url in re.findall(r"<loc>([^<]+)</loc>", (ROOT / "public/sitemap.xml").read_text(encoding="utf-8"))}
    for url in sorted({url for url in listed if url.startswith(f"/stories/{slug}/")} ^ urls):
        fail.append(f"public/sitemap.xml and PUBLISHED disagree on {url}")
    rules = re.findall(rf"^/stories/{slug}/([^\s*]*)\*?\s*$", (ROOT / "public/_headers").read_text(encoding="utf-8"), flags=re.MULTILINE)
    for part in sorted(set(rules) ^ set(PUBLISHED) ^ {"art/"}):
        fail.append(f"public/_headers and PUBLISHED disagree on /stories/{slug}/{part}")

    path = base / "index.html"
    if path.is_file():
        text = path.read_text(encoding="utf-8")
        home = f"/stories/{slug}/"
        links = {attrs.get("href") for tag, attrs in Markup(text).elements if tag == "a"}
        for link in (f"{home}picture/", f"{home}3d/"):
            if link not in links:
                fail.append(f"{rel(path)} must link the edition {link}")
        if source["title"] not in flatten(text):
            fail.append(f"{rel(path)} must show {source['title']!r}")


def check_slots(path: pathlib.Path, slots: list[dict]) -> None:
    name = rel(path)
    elements = Markup(path.read_text(encoding="utf-8")).elements
    frames = [attrs for tag, attrs in elements if "story-slot-frame" in attrs.get("class", "").split()]
    art = [attrs for tag, attrs in elements if "story-slot-art" in attrs.get("class", "").split()]
    if len(frames) + len(art) != len(slots):
        fail.append(f"{name} draws {len(frames) + len(art)} picture slots and book.json has {len(slots)}; "
                    "run python3 tools/books/build_story.py")
    for data in slots:
        if not str(data.get("alt", "")).strip():
            fail.append(f"tools/books slot {data.get('id')} has no alt text; give it an \"alt\" field")
        if data.get("image") and "to come" in str(data.get("alt", "")).lower():
            fail.append(f"tools/books slot {data.get('id')} has art and its alt says it is to come")
        if not (data.get("width") and data.get("height")):
            fail.append(f"tools/books slot {data.get('id')} has no width and height for the art")
    for frame in frames:
        if not frame.get("aria-label", "").strip():
            fail.append(f"{name} has a picture slot with no alt text")


def check_chapter(path: pathlib.Path, book: dict, chapter: dict) -> None:
    """Every source sentence on its page, in order."""
    name = rel(path)
    page = flatten(path.read_text(encoding="utf-8"))
    place = 0
    wanted = [f"Chapter {chapter['number']} {chapter['title']}"] + chapter["story"]
    wanted += [chapter["log_title"]] + chapter["log"]
    wanted += [f"{lead} {text}" for lead, text in chapter["ends"]]
    for words in wanted:
        words = re.sub(r"\s+", " ", words).strip()
        found = page.find(words, place)
        if found < 0:
            fail.append(f"{name} does not carry, in order: {words[:70]!r}")
            continue
        place = found + len(words)


def main() -> int:
    if not build.BOOKS:
        fail.append("build_story.py lists no books")
    for slug in build.BOOKS:
        folder = ROOT / "tools/books" / slug
        base = ROOT / "public/stories" / slug
        book, chapters = build.load(slug)
        check_source(slug)

        # Both directions: a chapter file with no entry in book.json would never be built.
        on_disk = {path.name for path in folder.glob("chapter-*.md")}
        listed = {entry["source"] for entry in book["chapters"]}
        for missing in sorted(on_disk - listed):
            fail.append(f"tools/books/{slug}/{missing} is not in book.json, so it is never built")
        for chapter in chapters:
            path = base / str(chapter["number"]) / "index.html"
            if not path.is_file():
                fail.append(f"chapter {chapter['number']} is in the source and {rel(path)} is not "
                            "built; run python3 tools/books/build_story.py")
                continue
            check_chapter(path, book, chapter)
            check_slots(path, chapter["slots"])
        numbers = {str(chapter["number"]) for chapter in chapters}
        extra = {path.parent.name for path in base.glob("*/index.html") if path.parent.name.isdigit()} - numbers
        for number in sorted(extra):
            fail.append(f"{rel(base)}/{number}/ is built and has no chapter in the source")
        if book.get("picture"):
            check_picture(slug, book)
            check_published(slug, book)
        if (base / "index.html").is_file():
            check_slots(base / "index.html", [book["cover"]])
            if book["draft_line"] not in flatten((base / "index.html").read_text(encoding="utf-8")):
                fail.append(f"{rel(base)}/index.html must say plainly: {book['draft_line']}")
        credit = book.get("picture_credit", "")
        if not credit or credit not in book["licence"]:
            fail.append(f"tools/books/{slug}/book.json: the licence line must carry picture_credit")
        # The source, not the built page: every built page's footer carries the credit too.
        if credit and credit not in flatten((folder / "grown-ups.html").read_text(encoding="utf-8")):
            fail.append(f"tools/books/{slug}/grown-ups.html must carry picture_credit word for word")
        for path in sorted(base.rglob("*.html")):
            check_page(path, book)
            check_links(path, book)
        try:
            drawn = build.pages_for(slug)
        except SystemExit as why:
            fail.append(str(why))
            continue
        for path, text in drawn.items():
            if path.parent.relative_to(base).as_posix().removeprefix(".") not in {part.rstrip("/") for part in PUBLISHED}:
                fail.append(f"build_story.py draws {rel(path)}, which is not in PUBLISHED; "
                            "the owner publishes chapter 1 only")
            if path.is_file() and path.read_text(encoding="utf-8") != text:
                fail.append(f"{rel(path)} is not what build_story.py draws; edit the source and rebuild")
            if not path.is_file() and path.parent.name not in numbers:
                fail.append(f"{rel(path)} is missing; run python3 tools/books/build_story.py")
    if fail:
        for problem in fail:
            print("check_story: " + problem, file=sys.stderr)
        return 1
    print(f"check_story: {len(build.BOOKS)} story book, only the {len(PUBLISHED)} published pages and "
          "the pictures they use, with the sitemap and _headers agreeing, plain pages, every image "
          "present, and the picture book's two editions carry every word with one self-hosted script each")
    return 0


if __name__ == "__main__":
    sys.exit(main())
