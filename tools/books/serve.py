#!/usr/bin/env python3
"""Serve public/ the way Cloudflare Pages does, for testing the books locally.

    python3 tools/books/serve.py 8123

WHY NOT http.server. The books only run because public/_headers gives /books/*
a policy that allows the site's own scripts and every other section one that
allows none. A preview that ignores _headers would pass a broken policy. This
server applies the file with the rules Cloudflare documents: every rule whose
pattern matches the request applies, a header set twice is joined with a
comma, and `! Name` removes a header. Splats match greedily, including
nothing. It also serves directory indexes and adds the trailing slash, as
Pages does.

It is a test tool. tools/ is never served.
"""

from __future__ import annotations

import http.server
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / "public"


def parse_headers(text: str) -> list[tuple[re.Pattern, list[tuple[str, str | None]]]]:
    rules: list[tuple[re.Pattern, list[tuple[str, str | None]]]] = []
    current = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw[0].isspace():
            pattern = re.escape(raw.strip()).replace(r"\*", ".*")
            pattern = re.sub(r":[A-Za-z]\w*", "[^/]+", pattern)
            current = (re.compile("^" + pattern + "$"), [])
            rules.append(current)
            continue
        line = raw.strip()
        if line.startswith("! "):
            current[1].append((line[2:].strip(), None))
        else:
            name, _, value = line.partition(":")
            current[1].append((name.strip(), value.strip()))
    return rules


def headers_for(path: str, rules) -> dict[str, str]:
    out: dict[str, list[str]] = {}
    detach: set[str] = set()
    for pattern, items in rules:
        if not pattern.match(path):
            continue
        for name, value in items:
            if value is None:
                detach.add(name.lower())
            else:
                out.setdefault(name, []).append(value)
    return {k: ", ".join(v) for k, v in out.items() if k.lower() not in detach}


class Handler(http.server.SimpleHTTPRequestHandler):
    rules = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        for name, value in headers_for(path, self.rules).items():
            self.send_header(name, value)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        if str(path).endswith(".js") or str(path).endswith(".mjs"):
            return "text/javascript"
        return super().guess_type(path)

    def log_message(self, *args):
        pass


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    Handler.rules = parse_headers((ROOT / "_headers").read_text(encoding="utf-8"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {ROOT} on http://127.0.0.1:{port}/ with _headers applied", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
