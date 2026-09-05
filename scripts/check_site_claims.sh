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

# The bundle is built in duck-sounds and never edited here. Its digest is
# checked against its own sidecar before the page's size claim is compared.
( cd public && sha256sum -c duckbench-bundle.zip.sha256 >/dev/null ) || {
  echo "check_site_claims: public/duckbench-bundle.zip does not match its sha256" >&2
  exit 1
}

python3 - <<'PY'
import html, json, pathlib, re, sys

fail = []
data = json.loads(pathlib.Path("tools/kit-sentences.json").read_text(encoding="utf-8"))
pages = {p: pathlib.Path(p).read_text(encoding="utf-8")
         for p in ("public/index.html", "public/privacy/index.html")}
index = pages["public/index.html"]
# The stylesheet is not something a person reads, so it is stripped before
# the page is flattened. Otherwise a CSS length can satisfy a copy check.
def flatten(markup: str) -> str:
    body = re.sub(r"<style\b.*?</style>", " ", markup, flags=re.DOTALL)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body)))


flat = {p: flatten(t) for p, t in pages.items()}
flat_index = flat["public/index.html"]

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
        fail.append(f"public/index.html does not carry {key} exactly: {url}")
found = set(re.findall(r"https://huggingface\.co/datasets/[A-Za-z0-9._/-]+", index))
extra = found - {data["urls"]["stairs_dataset"], data["urls"]["ball_dataset"]}
if extra:
    fail.append("public/index.html links a dataset the kit does not name: " + ", ".join(sorted(extra)))

# 3. The format strings, read as values. duck-move/2 is NOT pinned here: its
#    constant lives in duckkit, a different repository pinned by tag, which this
#    extractor cannot reach. The row stays; the claim about it does not.
for key in ("intent", "plan"):
    fmt = data["formats"][key]
    if fmt not in index:
        fail.append(f"public/index.html does not print the {key} format string {fmt}")

# 4. The shared token block is byte identical in both pages.
BEGIN = "/* == SHARED TOKENS: mirror this block byte for byte in the other page == */"
END = "/* == END SHARED TOKENS == */"
blocks = {}
for name, text in pages.items():
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        fail.append(f"{name} does not carry exactly one shared token block")
        continue
    blocks[name] = text[text.index(BEGIN):text.index(END) + len(END)]
if len(blocks) == 2 and len(set(blocks.values())) != 1:
    fail.append("the two pages' shared token blocks have drifted apart")

# 5. No third party request is possible from either page.
HOSTS = ("fonts.googleapis", "fonts.gstatic", "googletagmanager",
         "google-analytics", "plausible.io", "cdn.jsdelivr", "cdnjs.cloudflare")
for name, text in pages.items():
    if "<script" in text:
        fail.append(f"{name} carries a script tag")
    for host in HOSTS:
        if host in text:
            fail.append(f"{name} references {host}")
    for pattern in (r'src="http', r'srcset="http', r"@import", r"url\(http"):
        if re.search(pattern, text):
            fail.append(f"{name} matches {pattern}, which can fetch from another host")

# 6. The bundle's byte size, and the size the page claims.
size = pathlib.Path("public/duckbench-bundle.zip").stat().st_size
if size != 11666886:
    fail.append(f"public/duckbench-bundle.zip is {size} bytes, not 11666886; "
                "the page's 11.7 MB was measured against the old file")
if flat_index.count("11.7 MB") != 2:
    fail.append(f"public/index.html says 11.7 MB {flat_index.count('11.7 MB')} times, "
                "expected twice (the bench section and the links section)")
if "12 MB" in flat_index:
    fail.append("public/index.html still rounds the bundle to 12 MB")

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
    fail.append("public/index.html does not print the plant digest in full")
routes = len(data["routes"])
phrase = f"{WORDS[routes]} bench routes"
if phrase not in flat_index:
    fail.append(f"public/index.html does not say {phrase!r}, which is what "
                "DuckBench.routes counts to today")

# 9. The counts the page makes about ITSELF. These are not kit constants, they
#    are the page describing its own contents, and they go stale the moment
#    somebody adds a step or a repository. So they are read off the markup.
def section(page_id: str) -> str:
    """The markup of one section, ending at the next h2 OR at the footer.

    THE FOOTER ENDS IT, and that is not tidiness. #links is the last h2 on the
    page, so a slice that ran to the end of the document swallowed the footer,
    and the footer carries its own link to this repository. Deleting
    microduck-com from the links list left the page saying "four repositories"
    above three of them and this gate still green, because the footer supplied
    the fourth.
    """
    start = index.find(f'id="{page_id}"')
    if start < 0:
        return ""
    ends = [x for x in (index.find("<h2 ", start), index.find("<footer", start)) if x > 0]
    return index[start:min(ends) if ends else len(index)]


reproduce = section("reproduce")
steps = len(re.findall(r"<li>", reproduce))
if steps != 5 or "Five steps" not in flatten(reproduce):
    fail.append(f"the reproduce section has {steps} steps and calls itself five")

honest = section("honest")
claims = len(re.findall(r"<p><strong>", honest))
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

html_files = sorted(p.name for p in pathlib.Path("public").rglob("*.html"))
if len(html_files) != 2:
    fail.append(f"public/ holds {len(html_files)} HTML files and the page says two")

if fail:
    for problem in fail:
        print("check_site_claims: " + problem, file=sys.stderr)
    sys.exit(1)
print(f"check_site_claims: dashes, hosts, tokens, formats, datasets, {size} bytes, "
      f"{routes} routes, {steps} reproduce steps and {claims} honesty claims all check out")
PY
