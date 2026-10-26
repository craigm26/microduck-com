#!/usr/bin/env python3
"""Plant one defect at a time in a throwaway copy of the repository and watch
scripts/check_books.py fail on it, for the reason planted.

    python3 tools/books/mutate.py              # copies the repository to a temporary directory
    python3 tools/books/mutate.py SRC WORKDIR  # or names both

Like the gate it needs the network: every run rereads the pinned sources.

Each case edits files in the copy, runs the gate, and restores every touched
file byte for byte before the next. A case passes only if the gate exits 1 AND
one of the lines it adds over the baseline contains the expected words. The
copy is run before the first case and after the last; both runs must give the
same lines (none, once all four books are in).
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[2]).resolve()
WORK = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix="books-mutate-")).resolve()
COPY = WORK / "microduck-com"


def run(cwd=None):
    got = subprocess.run([sys.executable, str(COPY / "scripts/check_books.py")],
                         cwd=str(cwd or COPY), capture_output=True, text=True)
    lines = {l for l in (got.stdout + got.stderr).splitlines() if l.startswith("check_books: ") and "four books, forty lessons" not in l}
    return got.returncode, lines


def text(rel):
    return (COPY / rel).read_text(encoding="utf-8")


def write(rel, s):
    (COPY / rel).write_text(s, encoding="utf-8")


def sub(rel, old, new, count=1):
    s = text(rel)
    if s.count(old) < 1:
        raise SystemExit(f"harness: {old[:60]!r} is not in {rel}")
    write(rel, s.replace(old, new, count))


def ledger(book, edit):
    rel = f"tools/books/claims-{book}.json"
    d = json.loads(text(rel))
    edit(d["lessons"])
    write(rel, json.dumps(d, indent=1, ensure_ascii=False) + "\n")


B = "public/books/beginner/index.html"
I = "public/books/intermediate/index.html"
FB = "public/books/engine/figures-beginner.js"
FI = "public/books/engine/figures-intermediate.js"
H = "public/_headers"

CASES = []


def case(name, touches, expect, cwd=None):
    def deco(fn):
        CASES.append((name, touches, expect, fn, cwd))
        return fn
    return deco


@case("an unledgered number in a lesson's words", [B], "prints '999' and the ledger does not say")
def _():
    s = text(B)
    i = s.index('id="lesson-2"'); j = s.index("<p>", i)
    write(B, s[:j] + "<p>It carries 999 feathers.</p>" + s[j:])


@case("a quote its source does not contain", ["tools/books/claims-intermediate.json"], "does not say")
def _():
    ledger("intermediate", lambda L: L["lesson-2"]["61"].update(quote="61 numbers from the duck's dreams"))


@case("arithmetic that does not come out", ["tools/books/claims-intermediate.json"], "does not print as 98,304")
def _():
    ledger("intermediate", lambda L: L["lesson-6"]["98,304"].update(derived="4096 * 23"))


@case("a second script on a book page", [B], "must carry exactly")
def _():
    sub(B, "</head>", '<script src="/books/engine/kit.js"></script>\n</head>')


@case("a script on the docs page", ["public/docs/index.html"], "public/docs/index.html carries a script tag")
def _():
    sub("public/docs/index.html", "</head>", '<script type="module" src="/books/engine/book.js"></script>\n</head>')


@case("the same script on docs, with the gate run from another directory", ["public/docs/index.html"],
      "public/docs/index.html carries a script tag", cwd="/")
def _():
    sub("public/docs/index.html", "</head>", '<script type="module" src="/books/engine/book.js"></script>\n</head>')


@case("script-src in the docs policy", [H], "/docs/: only the books may run scripts")
def _():
    s = text(H)
    i = s.index("/docs/*"); j = s.index("Content-Security-Policy: ", i) + len("Content-Security-Policy: ")
    write(H, s[:j] + "script-src 'self'; " + s[j:])


@case("the not-found section named by its file, which Pages redirects away from", [H],
      "/404 is under 0 security policies")
def _():
    s = text(H)
    i = s.index("\n/404\n")
    write(H, s[:i] + "\n/404.html\n" + s[i + len("\n/404\n"):])


@case("the books' policy deleted", [H], "/books/beginner/ is under 0 security policies")
def _():
    s = text(H)
    i = s.index("/books/*")
    j = s.find("\n/", i + 1)
    write(H, s[:i] + (s[j + 1:] if j >= 0 else ""))


@case("unsafe-inline added to the books' scripts", [H], "the books' policy must allow the site's own scripts and nothing else")
def _():
    s = text(H)
    i = s.index("/books/*")
    j = s.index("script-src 'self'", i)
    write(H, s[:j] + "script-src 'self' 'unsafe-inline'" + s[j + len("script-src 'self'"):])


@case("a policy detached with !", [H], "detaches")
def _():
    s = text(H)
    i = s.index("/books/*"); j = s.index("\n", i)
    write(H, s[:j] + "\n  ! Content-Security-Policy" + s[j:])


@case("a remote address in figure code", [FB], "names a remote address")
def _():
    sub(FB, "export const figures = {", "// pictures from https://example.com\nexport const figures = {")


@case("an em dash in a figure's label", [FI], "contains an em dash")
def _():
    sub(FI, "ctx.label('brain', V(140, 132, 130)", "ctx.label('brain \u2014 a chip', V(140, 132, 130)")


@case("eval in the engine", ["public/books/engine/kit.js"], "evaluates code or opens a connection")
def _():
    sub("public/books/engine/kit.js", "export const clamp", "const x = eval('1');\nexport const clamp")


@case("an import of a file that does not exist", [FI], "which does not exist")
def _():
    sub(FI, "import ", "import './nope.js';\nimport ")


@case("'reward model' in the engine", [FI], "claims a reward model")
def _():
    sub(FI, "export const figures = {", "// a reward model\nexport const figures = {")


@case("one byte of the vendored three.js changed", ["public/books/vendor/three.module.min.js"], "is not the vendored file")
def _():
    p = COPY / "public/books/vendor/three.module.min.js"
    b = bytearray(p.read_bytes()); b[100] = (b[100] + 1) % 256; p.write_bytes(bytes(b))


@case("a prediction whose answer is not one of its choices", [B], "must match exactly one of")
def _():
    s = text(B)
    i = s.index('id="lesson-3"')
    m = re.compile(r'data-answer="([^"]+)"').search(s, i)
    write(B, s[:m.start()] + 'data-answer="nosuch"' + s[m.end():])


@case("a prediction with no answer to open", [B], "needs its answer in a details")
def _():
    s = text(B)
    i = s.index('id="lesson-4"')
    a = s.index("<details", i); z = s.index("</details>", a) + len("</details>")
    write(B, s[:a] + s[z:])


@case("a lesson naming a figure the engine does not have", [B], "figure 'nosuch' is not in figures-beginner.js")
def _():
    s = text(B)
    i = s.index('id="lesson-5"')
    m = re.compile(r'data-figure="([^"]+)"').search(s, i)
    write(B, s[:m.start()] + 'data-figure="nosuch"' + s[m.end():])


@case("a contents entry that does not match its lesson", [I], "the contents list does not match")
def _():
    s = text(I)
    i = s.index('class="book-toc"')
    m = re.compile(r'(<a href="#lesson-3"><span>)([^<]+)(</span></a>)').search(s, i)
    write(I, s[:m.start(2)] + "Something else" + s[m.end(2):])


@case("a lesson's id broken", [I], "not lesson-1 to lesson-10")
def _():
    sub(I, 'id="lesson-10"', 'id="lesson-ten"')


@case("a seventh step", [B], "a figure has 2 to 6 steps, not 7")
def _():
    s = text(B)
    i = s.index('id="lesson-6"')
    ol = s.index('class="figure-steps"', i); end = s.index("</ol>", ol)
    n = s[ol:end].count("<li>")
    write(B, s[:end] + "<li><strong>More</strong> again.</li>" * (7 - n) + s[end:])


@case("a number in a figure's label with no entry", [FB], "prints '77' with no ledger entry")
def _():
    s = text(FB)
    i = s.index("  parts(ctx) {")
    j = s.index("ctx.label(", i)
    write(FB, s[:j] + "ctx.label('77 feathers', V(0, 0, 0));\n    " + s[j:])


@case("a chart tick with no entry", [FI], "prints '750' with no ledger entry")
def _():
    sub(FI, "chart.xTicks = [0, 500, 1000, 1500];", "chart.xTicks = [0, 750, 1500];")


@case("a figure entry the figure no longer prints", ["tools/books/claims-intermediate.json"],
      "under figure and figure training no longer prints it")
def _():
    ledger("intermediate", lambda L: L["lesson-6"]["figure"].update({"42": {"toy": "planted"}}))


@case("a quote that does not carry its number", ["tools/books/claims-beginner.json"], "the quote does not contain two")
def _():
    ledger("beginner", lambda L: L["lesson-1"]["two"].pop("means"))


@case("arithmetic from numbers the lesson does not ledger", ["tools/books/claims-beginner.json"], "is derived from 20")
def _():
    ledger("beginner", lambda L: L["lesson-1"]["500"].update(derived="50 * 20 / 2"))


@case("an entry with two kinds", ["tools/books/claims-beginner.json"], "needs exactly one of source")
def _():
    ledger("beginner", lambda L: L["lesson-1"]["500"].update(toy="and also a toy"))


@case("a number in the head the book does not ledger", [B], "the head prints 'eleven'")
def _():
    sub(B, "in ten pop-up lessons", "in eleven pop-up lessons")


@case("a number on the shelf with no entry", ["public/books/index.html"], "the shelf prints '12'")
def _():
    sub("public/books/index.html", "Four books, one little robot", "Four books, 12 drawings, one little robot")


@case("a script on the shelf", ["public/books/index.html"], "carries a script")
def _():
    sub("public/books/index.html", "</head>", '<script type="module" src="/books/engine/book.js"></script>\n</head>')


T = "public/train/windows/index.html"
TC = "public/train/index.html"
TL = "public/train/linux/index.html"
TM = "public/train/mac/index.html"
TI = "public/train/iphone/index.html"
TJ = "tools/books/claims-train.json"


@case("a number in the Windows guide with no entry", [T], "the Windows guide prints '999'")
def _():
    sub(T, "saves a checkpoint every 250", "saves a checkpoint every 999")


@case("a Windows-guide entry the page no longer prints", [T], "claims-train.json lists '250' and the Windows guide no longer prints it")
def _():
    # 250 is printed twice, once for the challenge and once for microduck_rl: take out both
    sub(T, "saves a checkpoint every 250", "saves a checkpoint now and then")
    sub(T, "A checkpoint lands every 250 iterations", "A checkpoint lands now and then")


@case("a Windows-guide quote a pinned source does not say", [TJ], "ch-sprint does not say")
def _():
    ledger("train", lambda L: L["windows"]["4096"].update(quote="`num_envs` 8192, `max_iterations` 3000"))


@case("a Windows-guide quote a web page does not say", [TJ], "ms-wsl-gpu does not say")
def _():
    ledger("train", lambda L: L["windows"]["10"].update(quote="Ensure you are running Windows 12 or Windows 10, version 21H2 or higher"))


@case("a number in the Windows guide's head", [T], "the Windows guide's head prints '9'")
def _():
    sub(T, "<title>Train your first duck on Windows, Microduck Studio</title>", "<title>Train your first duck on Windows in 9 steps, Microduck Studio</title>")


@case("a script on the Windows guide", [T], "the Windows guide carries a script")
def _():
    sub(T, "</head>", '<script type="module" src="/books/engine/book.js"></script>\n</head>')


@case("a number in the training chooser's head", [TC], "the training chooser's head prints '4'")
def _():
    sub(TC, "<title>Train your first duck, Microduck Studio</title>", "<title>Train your first duck 4 ways, Microduck Studio</title>")


@case("a Linux-guide quote its pinned source does not say", [TJ], "ch-sprint does not say")
def _():
    ledger("train", lambda L: L["linux"]["2"].update(quote="Walk 3 m on a flat lane as fast as possible."))


@case("a number in the Mac guide with no entry", [TM], "the Mac guide prints '24'")
def _():
    sub(TM, "after 12 hours at most", "after 24 hours at most")


@case("a Mac-guide quote Pollen's Arena does not say", [TJ], "arena-training does not say")
def _():
    ledger("train", lambda L: L["mac"]["two"].update(quote="this pulls that repo back into logs/rsl_rl/ every three minutes"))


@case("a number in the iPhone guide with no entry", [TI], "the iPhone guide prints '25'")
def _():
    sub(TI, "100 iterations, about a quarter of an hour, judged", "100 iterations, about 25 minutes, judged")


@case("an iPhone-guide quote Studio's source does not say", [TJ], "studio-weights does not say")
def _():
    ledger("train", lambda L: L["iphone"]["197,774"].update(quote="all 197,775 of them"))


@case("a training page that is gone", [TL], "public/train/linux/index.html is missing")
def _():
    (COPY / TL).unlink()


CB = "public/books/casebook/index.html"
CBJ = "tools/books/claims-casebook.json"
FCB = "public/books/engine/figures-casebook.js"


@case("a number in a casebook lesson with no entry", [CB], "casebook lesson-3: prints '0.37'")
def _():
    sub(CB, "so only about 12% land under 0.15 m/s.", "so only about 12% land under 0.15 m/s, and 0.37 of those turn.")


@case("a casebook quote duckbatch's close note does not say", [CBJ], "db-b003-close does not say")
def _():
    ledger("casebook", lambda L: L["lesson-1"]["0.108"].update(quote="| vx 0.30 | 0.119 | 0.109 | 0.060 |"))


@case("a casebook figure that prints a number with no entry", [FCB], "figure scorecard prints '0.33'")
def _():
    sub(FCB, "'walk at 0.30'", "'walk at 0.33'")


@case("a Qwiic quote the Robot HAT's bill of materials does not say", [CBJ], "hat-bom does not say")
def _():
    ledger("casebook", lambda L: L["lesson-9"]["four"].update(quote='"J5, J6, J7",JST_SH_BM04B-SRSS-TB_1x04-1MP_P1.00mm_Vertical,3,JST SH,C160390'))


@case("the casebook gone", [CB], "public/books/casebook/index.html is missing")
def _():
    (COPY / CB).unlink()


TA = "public/train/advanced/index.html"


@case("a number in the advanced guide with no entry", [TA], "the advanced guide prints '6006'")
def _():
    sub(TA, "with the port from the\n  page's address", "with the port from the\n  page's address, 6006 for TensorBoard")


@case("an advanced-guide quote Pollen's pad page does not say", [TJ], "md-udp-pad does not say")
def _():
    ledger("train", lambda L: L["advanced"]["4210"].update(quote="| `port` | `4211` | the UDP port, bound on IPv4 `0.0.0.0` |"))


@case("an advanced-guide cost that does not add up", [TJ], "does not print as 1.20")
def _():
    ledger("train", lambda L: L["advanced"]["1.20"].update(derived="1.5 * 0.85"))


@case("the advanced guide gone", [TA], "public/train/advanced/index.html is missing")
def _():
    (COPY / TA).unlink()


def main():
    if COPY == SRC or SRC in COPY.parents or COPY in SRC.parents:
        raise SystemExit("mutate: that copy would land on the repository itself; name another WORKDIR")
    if COPY.exists():
        shutil.rmtree(COPY)
    WORK.mkdir(parents=True, exist_ok=True)
    shutil.copytree(SRC, COPY, ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__"))
    code0, base = run()
    print(f"baseline: exit {code0}, {len(base)} lines")
    for l in sorted(base):
        print("   ", l)
    results = []
    for name, touches, expect, fn, cwd in CASES:
        saved = {rel: (COPY / rel).read_bytes() for rel in touches}
        fn()
        code, lines = run(cwd)
        new = sorted(lines - base)
        hit = [l for l in new if expect in l]
        ok = code == 1 and bool(hit)
        results.append((ok, name, hit[0] if hit else (new[0] if new else "(nothing new)")))
        for rel, b in saved.items():
            (COPY / rel).write_bytes(b)
        for rel, b in saved.items():
            assert (COPY / rel).read_bytes() == b
        print(("PASS " if ok else "MISS ") + name + "\n     " + (hit[0] if hit else "new: " + repr(new[:3])))
    code1, end = run()
    print(f"after the last case: exit {code1}, {len(end)} lines, {'same' if end == base else 'DIFFERENT'} as the baseline")
    missed = [r for r in results if not r[0]]
    print(f"{len(results) - len(missed)} of {len(results)} cases failed the gate for the planted reason")
    if len(sys.argv) <= 2:
        shutil.rmtree(WORK)
    return 1 if missed or end != base else 0


if __name__ == "__main__":
    sys.exit(main())
