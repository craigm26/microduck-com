#!/usr/bin/env bash
# Every href on the site resolves: files exist, anchors exist, URLs answer 200.
#
# GET, NOT HEAD. Some hosts answer 405 to a HEAD, and a HEAD based check false
# fails on them, which trains everybody to ignore the gate.
#
# WHAT IT CANNOT CATCH. A TestFlight link that answers 200 while the beta behind
# it stopped accepting testers. That one is a human line in the deploy
# checklist, and it is in the README.
#
# It needs the network. In an offline shell it fails rather than passing, which
# is the point: a link gate that goes green because nothing could be reached is
# the vacuous gate this project has already paid for once.

set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import pathlib, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
sys.path.insert(0, "scripts")
from site_helpers import read_pages, Markup, css_references, local_target

pages = read_pages()
ids = {pathlib.Path(name).resolve(): set(Markup(text).ids) for name, text in pages.items()}
references = {name: Markup(text).references + css_references(text)
              for name, text in pages.items()}
for path in pathlib.Path("public").rglob("*"):
    if path.suffix.lower() in (".css", ".svg"):
        text = path.read_text(encoding="utf-8")
        references[str(path)] = css_references(text)
        if path.suffix.lower() == ".svg":
            references[str(path)] += Markup(text).references
            ids[path.resolve()] = set(Markup(text).ids)

fail = []
external = {}
for name, refs in references.items():
    for href in refs:
        if urlsplit(href).scheme in ("mailto", "tel", "data"):
            continue
        try:
            target, fragment = local_target(name, href)
        except ValueError as why:
            fail.append(f"{name}: {why}")
            continue
        if target is None:
            external.setdefault(href, set()).add(name)
        elif not target.is_file():
            fail.append(f"{name} links {href} and {target} does not exist")
        elif fragment and fragment not in ids.get(target, set()):
            fail.append(f"{name} links {href} and {target} has no id {fragment}")

# An unpublished canonical URL is checked against public/, like other local
# links. External hosts are fetched; deployment verification checks live URLs.
def fetch(url):
    got = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-L", "--max-time", "20",
         "-w", "%{http_code}", url], capture_output=True, text=True)
    return url, got.stdout.strip()

with ThreadPoolExecutor(max_workers=8) as pool:
    for url, code in pool.map(fetch, sorted(external)):
        print(f"{code or 'ERR':>4}  {url}")
        if code != "200":
            fail.append(f"{url} answered {code or 'nothing'} "
                        f"(linked from {', '.join(sorted(external[url]))})")

if fail:
    for problem in fail:
        print("check_links: " + problem, file=sys.stderr)
    sys.exit(1)
print(f"check_links: {len(external)} external links answered 200, "
      "every local path, asset and anchor resolves")
PY
