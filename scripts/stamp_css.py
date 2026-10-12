#!/usr/bin/env python3
"""Stamp the stylesheet's own hash onto every page's link to it.

    python3 scripts/stamp_css.py            # rewrite the links
    python3 scripts/stamp_css.py --check    # exit 1 if any link is stale

WHY. microduckstudio.com's Cloudflare zone sends `/assets/site.css` with
`max-age=14400`, so a browser that visited in the last four hours keeps the old
stylesheet after a deploy while the new HTML arrives at once. On 2026-10-12 that
is exactly what happened: the Duck Cards pages went live and a returning
visitor saw every card unstyled, because the cached site.css had no card rules.
A link that changes whenever the stylesheet changes, `/assets/site.css?v=<hash>`,
is a different URL to every cache, so new HTML can never be paired with an old
stylesheet. check_site_claims.sh holds every page to the current hash.
"""

from __future__ import annotations

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ROOT / "public/assets/site.css"
LINK = re.compile(r'(<link rel="stylesheet" href="/assets/site\.css)(?:\?v=[0-9a-f]*)?(">)')


def version() -> str:
    return hashlib.sha256(CSS.read_bytes()).hexdigest()[:10]


def main() -> int:
    check = "--check" in sys.argv[1:]
    want = version()
    stale = []
    for page in sorted((ROOT / "public").rglob("*.html")):
        text = page.read_text(encoding="utf-8")
        if len(LINK.findall(text)) != 1:
            print(f"stamp_css: {page.relative_to(ROOT)} does not link the stylesheet exactly once",
                  file=sys.stderr)
            return 1
        new = LINK.sub(rf"\g<1>?v={want}\g<2>", text)
        if new != text:
            stale.append(str(page.relative_to(ROOT)))
            if not check:
                page.write_text(new, encoding="utf-8")
    if check and stale:
        print("stamp_css: stale stylesheet links, run python3 scripts/stamp_css.py: "
              + ", ".join(stale), file=sys.stderr)
        return 1
    print(f"stamp_css: site.css is v={want}; "
          + (f"restamped {len(stale)} pages" if stale and not check else "every page links it"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
