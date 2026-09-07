#!/usr/bin/env bash
# The structural claims: dashes, third parties, the bundle, the shared tokens.
#
# EVERY CLAIM IS READ AS A VALUE OR AS A STRUCTURAL PROPERTY, never as a bare
# substring of a Swift file. The value reads happen in extract_kit_sentences.py
# and land in tools/kit-sentences.json; this script compares the page against
# that file and against the bundle on disk.
#
# TWO GREPS ARE DELIBERATELY NARROWER THAN THE OBVIOUS ONE.
#   * Not `href=`. `<link rel="canonical" href="https://microduckstudio.com/">`
#     is a legitimate absolute href in the head, and a naive rule fires on the
#     page's own canonical tag. Absolute hrefs are anchors and the canonical
#     link, and check_links.sh is what validates them.
#   * Not the bare word `analytics`. Both pages say "no analytics" in prose, in
#     English, as a promise. The rule is written against tracker HOSTNAMES,
#     which cannot appear in prose by accident.
#
# PROVED ABLE TO FAIL: see the header of predeploy.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

test -f tools/kit-sentences.json || {
  echo "check_site_claims: no tools/kit-sentences.json; run extract_kit_sentences.py first" >&2
  exit 1
}

# The bundle is built in duckbench and never edited here. Its digest is
# checked against its own sidecar before the page's size claim is compared.
( cd public && sha256sum -c duckbench-bundle.zip.sha256 >/dev/null ) || {
  echo "check_site_claims: public/duckbench-bundle.zip does not match its sha256" >&2
  exit 1
}

python3 - <<'PY'
import json, pathlib, re, sys
sys.path.insert(0, "scripts")
from site_helpers import read_pages, flatten, Markup, section_markup, css_references

fail = []
data = json.loads(pathlib.Path("tools/kit-sentences.json").read_text(encoding="utf-8"))
pages = read_pages()
index = "\n".join(pages.values())
flat = {p: flatten(t) for p, t in pages.items()}
flat_index = " ".join(flat.values())

WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight",
         "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
         "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]

# 1. Dashes, the banned training acronym, and the app's old name.
for name, text in pages.items():
    for label, needle in (("an em dash", "—"), ("an en dash", "–")):
        if needle in text:
            fail.append(f"{name} contains {label}")
    if "RLHF" in text or "reward model" in text:
        fail.append(f"{name} names the training acronym this project does not use in copy")
    if "Duck Studio" in text:
        fail.append(f"{name} uses the app's old name")

# 2. The two dataset URLs are the kit's values, and no third one is on the page.
for key in ("stairs_dataset", "ball_dataset"):
    url = data["urls"][key]
    if url not in index:
        fail.append(f"the site does not carry {key} exactly: {url}")
found = set(re.findall(r"https://huggingface\.co/datasets/[A-Za-z0-9._/-]+", index))
extra = found - {data["urls"]["stairs_dataset"], data["urls"]["ball_dataset"]}
if extra:
    fail.append("the site links a dataset the kit does not name: " + ", ".join(sorted(extra)))

# 3. The format strings, read as values. duck-move/2 is NOT pinned here: its
#    constant lives in duckkit, a different repository pinned by tag, which this
#    extractor cannot reach. The row stays; the claim about it does not.
for key in ("intent", "plan"):
    fmt = data["formats"][key]
    if fmt not in index:
        fail.append(f"the site does not print the {key} format string {fmt}")

# 4. Every page uses one local stylesheet, so shared design tokens cannot drift.
stylesheet = pathlib.Path("public/assets/site.css")
if not stylesheet.is_file():
    fail.append("public/assets/site.css is missing")
for name, text in pages.items():
    styles = [attrs.get("href") for tag, attrs in Markup(text).elements
              if tag == "link" and "stylesheet" in attrs.get("rel", "").split()]
    if styles != ["/assets/site.css"]:
        fail.append(f"{name} must link /assets/site.css exactly once as its stylesheet")

# 5. Read all served HTML, stylesheets and SVGs for scripts or remote assets.
HOSTS = ("fonts.googleapis", "fonts.gstatic", "googletagmanager",
         "google-analytics", "plausible.io", "cdn.jsdelivr", "cdnjs.cloudflare")
assets = {str(path): path.read_text(encoding="utf-8")
          for path in pathlib.Path("public").rglob("*")
          if path.suffix.lower() in (".css", ".svg")}
for name, text in (pages | assets).items():
    parsed = Markup(text) if not name.endswith(".css") else None
    if re.search(r"<script\b", text, flags=re.IGNORECASE):
        fail.append(f"{name} carries a script tag")
    if parsed:
        for tag, attrs in parsed.elements:
            if any(attr.lower().startswith("on") for attr in attrs):
                fail.append(f"{name} carries an event handler on <{tag}>")
            if any(value and value.strip().lower().startswith("javascript:")
                   for value in attrs.values()):
                fail.append(f"{name} carries a JavaScript URL")
            for attr in ("src", "srcset", "poster", "data"):
                if re.search(r"(?:https?:)?//", attrs.get(attr, ""), flags=re.IGNORECASE):
                    fail.append(f"{name} has a remote {attr} asset")
            if tag == "link" and set(attrs.get("rel", "").split()) & {
                    "stylesheet", "icon", "preload", "prefetch", "preconnect", "dns-prefetch"}:
                if re.match(r"(?:https?:)?//", attrs.get("href", ""), flags=re.IGNORECASE):
                    fail.append(f"{name} loads a remote link asset")
    for host in HOSTS:
        if host in text.lower():
            fail.append(f"{name} references {host}")
    if re.search(r"@import\b", text, flags=re.IGNORECASE):
        fail.append(f"{name} carries a CSS import")
    for reference in css_references(text):
        if re.match(r"(?:https?:)?//", reference, flags=re.IGNORECASE):
            fail.append(f"{name} fetches a remote CSS asset: {reference}")

# 6. The bundle's byte size, and the size the page claims.
size = pathlib.Path("public/duckbench-bundle.zip").stat().st_size
if size != 11666886:
    fail.append(f"public/duckbench-bundle.zip is {size} bytes, not 11666886; "
                "the page's 11.7 MB was measured against the old file")
if flat_index.count("11.7 MB") != 2:
    fail.append(f"the site says 11.7 MB {flat_index.count('11.7 MB')} times, "
                "expected twice (the bench section and the links section)")
if "12 MB" in flat_index:
    fail.append("the site still rounds the bundle to 12 MB")

# 7. One h1 per page, and a viewport that lets a reader zoom.
for name, text in pages.items():
    if len(re.findall(r"<h1\b", text)) != 1:
        fail.append(f"{name} does not have exactly one h1")
    if '<meta name="viewport" content="width=device-width, initial-scale=1">' not in text:
        fail.append(f"{name} is missing the exact viewport meta")
    if "maximum-scale" in text or "user-scalable=no" in text:
        fail.append(f"{name} disables pinch zoom")

# 8. The counted claims: the plant digest, and the bench route count.
digest = data["quoted"]["plant_digest"]
if digest not in index:
    fail.append("the site does not print the plant digest in full")
routes = len(data["routes"])
phrase = f"{WORDS[routes]} bench routes"
if phrase not in flat_index:
    fail.append(f"the site does not say {phrase!r}, which is what "
                "DuckBench.routes counts to today")

# 9. The counts the page makes about ITSELF. These are not kit constants, they
#    are the page describing its own contents, and they go stale the moment
#    somebody adds a step or a repository. So they are read off the markup.
def section(page_id: str) -> str:
    return section_markup({"public/docs/index.html": pages.get("public/docs/index.html", "")},
                          page_id)


reproduce = section("reproduce")
steps = sum(tag == "li" for tag, attrs in Markup(reproduce).elements)
if steps != 5 or "Five steps" not in flatten(reproduce):
    fail.append(f"the reproduce section has {steps} steps and calls itself five")

honest = section("honest")
claims = len(re.findall(r"<p\b[^>]*>\s*<strong\b", honest))
if claims != 6:
    fail.append(f"the honest section has {claims} claim paragraphs; the standfirst "
                "promises two claims and four more things")

links = section("links")
repos = set(re.findall(r'https://github\.com/craigm26/([A-Za-z0-9._-]+)"', links))
datasets = set(re.findall(r'https://huggingface\.co/datasets/[^"]+', links))
bundles = len(re.findall(r'href="/duckbench-bundle\.zip"', links))
probes = len(re.findall(r"https://microduck-sim\.pages\.dev/phonebench/", links))
upstream = len(re.findall(r'https://github\.com/(?:pollen-robotics/microduck|robocurve/inspect-robots)"',
                          links))
if (len(repos), len(datasets), bundles, probes, upstream) != (4, 2, 1, 1, 2):
    fail.append(f"the links section lists {len(repos)} of our repositories, "
                f"{len(datasets)} datasets, {bundles} bundle, {probes} probe and "
                f"{upstream} upstream projects; its opening sentence says four, two, "
                "one, one and two")

for required in ("public/index.html", "public/docs/index.html", "public/privacy/index.html"):
    if required not in pages:
        fail.append(f"{required} is missing")

if fail:
    for problem in fail:
        print("check_site_claims: " + problem, file=sys.stderr)
    sys.exit(1)
print(f"check_site_claims: dashes, hosts, shared CSS, formats, datasets, {size} bytes, "
      f"{routes} routes, {steps} reproduce steps and {claims} honesty claims all check out")
PY
