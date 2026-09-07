"""Shared readers for the static site's copy, assets, and structure gates."""

from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

PUBLIC = Path("public")
SITE_HOSTS = {"microduckstudio.com", "www.microduckstudio.com"}


def read_pages() -> dict[str, str]:
    return {str(path): path.read_text(encoding="utf-8")
            for path in sorted(PUBLIC.rglob("*.html"))}


class Markup(HTMLParser):
    def __init__(self, markup: str):
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.elements: list[tuple[str, dict[str, str]]] = []
        self.references: list[str] = []
        self.words: list[str] = []
        self.hidden = 0
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        for attr in ("href", "src", "poster", "data", "xlink:href"):
            if attrs.get(attr):
                self.references.append(attrs[attr])
        if attrs.get("srcset"):
            # Local responsive assets have a URL followed by an optional size.
            self.references.extend(part.strip().split()[0]
                                   for part in attrs["srcset"].split(",") if part.strip())
        if tag in ("head", "style", "script"):
            self.hidden += 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in ("head", "style", "script"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.words.append(data)


def flatten(markup: str) -> str:
    return re.sub(r"\s+", " ", " ".join(Markup(markup).words)).strip()


def css_references(css: str) -> list[str]:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    return [match[1].strip() for match in
            re.findall(r"url\(\s*(['\"]?)(.*?)\1\s*\)", css, flags=re.IGNORECASE)]


def local_target(source: str, reference: str) -> tuple[Path | None, str]:
    """Resolve same-site links against the unpublished tree, including fragments."""
    url = urlsplit(reference)
    if url.scheme in ("mailto", "tel", "data"):
        return None, ""
    if url.netloc and url.hostname not in SITE_HOSTS:
        return None, ""
    if url.scheme and url.scheme not in ("http", "https"):
        raise ValueError(f"unsupported URL scheme: {reference}")
    path = unquote(url.path)
    if url.netloc or path.startswith("/"):
        target = PUBLIC / path.lstrip("/")
    elif path:
        target = Path(source).parent / path
    else:
        target = Path(source)
    target = target.resolve()
    if not target.is_relative_to(PUBLIC.resolve()):
        raise ValueError(f"path escapes public/: {reference}")
    if target.is_dir() or path.endswith("/"):
        target /= "index.html"
    return target, unquote(url.fragment)


def section_markup(pages: dict[str, str], page_id: str) -> str:
    """Read an identified section, or a legacy h2 and its following content."""
    matches = [(text, match) for text in pages.values() for match in re.finditer(
        r'<([a-z][a-z0-9]*)\b[^>]*\bid="' + re.escape(page_id) + r'"[^>]*>',
        text, flags=re.IGNORECASE)]
    if len(matches) != 1:
        return ""
    text, match = matches[0]
    if match.group(1).lower() == "h2":
        end = re.search(r"<h2\b|<footer\b", text[match.end():], flags=re.IGNORECASE)
        return text[match.start():match.end() + end.start() if end else len(text)]
    # A section's nested wrappers cannot accidentally include a later footer.
    tag = match.group(1)
    depth = 1
    for boundary in re.finditer(r"</?" + tag + r"\b[^>]*>", text[match.end():],
                                flags=re.IGNORECASE):
        depth += -1 if boundary.group().startswith("</") else 1
        if depth == 0:
            return text[match.start():match.end() + boundary.end()]
    return ""
