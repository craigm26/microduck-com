#!/usr/bin/env python3
"""Every public HTML page closes its elements; the sitemap lists valid local pages.

WHY NOT JUST xmllint. It is not installed on this machine and it is not worth a
package install to run before a deploy, so the fallback the plan named is the
real check here: a strict html.parser round trip that keeps a stack of open
elements and reports the first one that never closes. When xmllint IS present,
predeploy.sh runs it too, so the stricter tool is used where it exists.

VOID ELEMENTS are the whole subtlety: `<meta>` and `<br>` never close, and a
parser that expects them to would report every page as broken and be switched
off within a week.

THE NOT-FOUND PAGE IS THE ONE PAGE THE SITEMAP MUST NOT LIST. Cloudflare Pages
serves public/404.html, with a 404, for any path that is not a file. Without it,
Pages takes the site for a single-page app and answers every unknown path with
the home page and a 200, so a broken link looks like a working copy of the home
page to a search engine (found 2026-10-26). So the page must exist, must say
noindex, and must stay out of the sitemap; every other page must be in it.

AND IT CARRIES ITS OWN SECURITY POLICY. For a path that is not a file, Pages serves
the page under the /* section of _headers alone, which sets no policy (a policy on
/* would be joined to the books' and block their scripts). So the page sets one in
a meta tag: from default-src 'none', and with no script-src, because it runs none.
"""

from __future__ import annotations

import pathlib
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from site_helpers import read_pages, local_target

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
# Tags HTML lets you leave open. This site closes all of them; the set is here
# so a future row written the loose way does not read as a structural failure.
OPTIONAL_CLOSE = {"li", "p", "tr", "td", "th", "dt", "dd", "option", "thead",
                  "tbody", "tfoot"}


class Stack(HTMLParser):
    def __init__(self, name: str) -> None:
        super().__init__(convert_charrefs=True)
        self.name = name
        self.open: list[tuple[str, int]] = []
        self.problems: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs) -> None:
        node_id = dict(attrs).get("id")
        if node_id in self.ids:
            self.problems.append(f"{self.name}:{self.getpos()[0]}: duplicate id {node_id}")
        if node_id:
            self.ids.add(node_id)
        if tag not in VOID:
            self.open.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag: str, attrs) -> None:
        pass

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        while self.open:
            top, line = self.open.pop()
            if top == tag:
                return
            if top not in OPTIONAL_CLOSE:
                self.problems.append(
                    f"{self.name}:{line}: <{top}> is still open where </{tag}> arrives")
                return
        self.problems.append(f"{self.name}: </{tag}> closes nothing")

    def finish(self) -> list[str]:
        for tag, line in self.open:
            if tag not in OPTIONAL_CLOSE:
                self.problems.append(f"{self.name}:{line}: <{tag}> is never closed")
        return self.problems


def main() -> int:
    problems: list[str] = []
    pages = read_pages()
    for name in pages:
        path = pathlib.Path(name)
        if not path.is_file():
            problems.append(f"{name} is missing")
            continue
        parser = Stack(name)
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        problems.extend(parser.finish())

    not_found = pathlib.Path("public/404.html")
    if str(not_found) not in pages:
        problems.append("public/404.html is missing: without it Cloudflare Pages answers every "
                        "unknown path with the home page and a 200")
    elif '<meta name="robots" content="noindex">' not in pages[str(not_found)]:
        problems.append("public/404.html must carry <meta name=\"robots\" content=\"noindex\">")
    else:
        import re
        policy = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)">',
                           pages[str(not_found)])
        if not policy or not policy.group(1).startswith("default-src 'none'") or "script-src" in policy.group(1):
            problems.append("public/404.html must carry its own policy, from default-src 'none' and with no "
                            "script-src, in <meta http-equiv=\"Content-Security-Policy\">: for a path that is "
                            "not a file, Pages serves it under /* alone, which sets none")

    sitemap = pathlib.Path("public/sitemap.xml")
    if not sitemap.is_file():
        problems.append("public/sitemap.xml is missing")
    else:
        try:
            root = ET.parse(sitemap).getroot()
            listed = set()
            for location in root.findall("{*}url/{*}loc"):
                target, _ = local_target(str(sitemap), location.text or "")
                if target is None or not target.is_file():
                    problems.append(f"public/sitemap.xml names a missing local page: {location.text}")
                else:
                    listed.add(target)
            if not_found.resolve() in listed:
                problems.append("public/sitemap.xml lists the not-found page, which no search "
                                "engine should index")
            missing = {pathlib.Path(name).resolve() for name in pages
                       if pathlib.Path(name) != not_found} - listed
            if missing:
                problems.append("public/sitemap.xml omits " + ", ".join(str(p) for p in sorted(missing)))
        except (ET.ParseError, ValueError) as why:
            problems.append(f"public/sitemap.xml is not valid XML: {why}")

    if problems:
        for problem in problems:
            print("check_wellformed: " + problem, file=sys.stderr)
        return 1
    print(f"check_wellformed: {len(pages)} pages close every element with unique ids, "
          "and the sitemap covers every page but the not-found one")
    return 0


if __name__ == "__main__":
    sys.exit(main())
