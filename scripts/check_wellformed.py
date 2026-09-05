#!/usr/bin/env python3
"""Both HTML pages parse and every element closes; the sitemap is valid XML.

WHY NOT JUST xmllint. It is not installed on this machine and it is not worth a
package install to run before a deploy, so the fallback the plan named is the
real check here: a strict html.parser round trip that keeps a stack of open
elements and reports the first one that never closes. When xmllint IS present,
predeploy.sh runs it too, so the stricter tool is used where it exists.

VOID ELEMENTS are the whole subtlety: `<meta>` and `<br>` never close, and a
parser that expects them to would report every page as broken and be switched
off within a week.
"""

from __future__ import annotations

import pathlib
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

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

    def handle_starttag(self, tag: str, attrs) -> None:
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
    for name in ("public/index.html", "public/privacy/index.html"):
        path = pathlib.Path(name)
        if not path.is_file():
            problems.append(f"{name} is missing")
            continue
        parser = Stack(name)
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        problems.extend(parser.finish())

    sitemap = pathlib.Path("public/sitemap.xml")
    if not sitemap.is_file():
        problems.append("public/sitemap.xml is missing")
    else:
        try:
            ET.parse(sitemap)
        except ET.ParseError as why:
            problems.append(f"public/sitemap.xml is not valid XML: {why}")

    if problems:
        for problem in problems:
            print("check_wellformed: " + problem, file=sys.stderr)
        return 1
    print("check_wellformed: both pages close every element, the sitemap parses")
    return 0


if __name__ == "__main__":
    sys.exit(main())
