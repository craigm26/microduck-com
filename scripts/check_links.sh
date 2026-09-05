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
import pathlib, re, subprocess, sys

pages = {p: pathlib.Path(p).read_text(encoding="utf-8")
         for p in ("public/index.html", "public/privacy/index.html")}
ids = {p: set(re.findall(r'id="([^"]+)"', t)) for p, t in pages.items()}

fail = []
external = {}
for name, text in pages.items():
    for href in re.findall(r'href="([^"]+)"', text):
        if href.startswith("mailto:"):
            continue
        if href.startswith("#"):
            if href[1:] not in ids[name]:
                fail.append(f"{name} links {href} and has no such id")
            continue
        if href.startswith("/"):
            path, _, fragment = href.partition("#")
            if path in ("", "/"):
                target = pathlib.Path("public/index.html")
            elif path.endswith("/"):
                target = pathlib.Path("public") / path.lstrip("/") / "index.html"
            else:
                target = pathlib.Path("public") / path.lstrip("/")
            if not target.is_file():
                fail.append(f"{name} links {href} and {target} does not exist")
            elif fragment:
                page_ids = ids.get(str(target))
                if page_ids is None:
                    page_ids = set(re.findall(r'id="([^"]+)"',
                                              target.read_text(encoding="utf-8")))
                if fragment not in page_ids:
                    fail.append(f"{name} links {href} and {target} has no id {fragment}")
            continue
        external.setdefault(href, set()).add(name)

for url in sorted(external):
    got = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-L", "--max-time", "20",
         "-w", "%{http_code}", url],
        capture_output=True, text=True)
    code = got.stdout.strip()
    print(f"{code or 'ERR':>4}  {url}")
    if code != "200":
        fail.append(f"{url} answered {code or 'nothing'} "
                    f"(linked from {', '.join(sorted(external[url]))})")

if fail:
    for problem in fail:
        print("check_links: " + problem, file=sys.stderr)
    sys.exit(1)
print(f"check_links: {len(external)} external links answered 200, "
      "every local path and anchor resolves")
PY
