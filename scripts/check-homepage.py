#!/usr/bin/env python3
"""Fail if the homepage points at a missing local file, contains a 555
phone number, or still has a placeholder form endpoint."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

PHONE_555 = re.compile(
    r"(?:\(\s*555\s*\)|555\s*-\s*0|\b555\s*[-\.]\s*\d{3,4}\b|\b\d{3}\s*[-\.\)]\s*555\s*[-\.]\s*\d{4}\b)",
    re.IGNORECASE,
)
PLACEHOLDER_TOKENS = (
    "YOUR_FORM_ID",
    "REPLACE_WITH",
)
MANUS_MARKERS = ("manus-runtime", "spaceEditor", "/assets/index-")


class RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {k: v for k, v in attrs if v}
        for key in ("href", "src"):
            if key in data:
                self.refs.append((key, data[key]))


def is_remote(value: str) -> bool:
    raw = value.strip()
    if not raw or raw.startswith("#"):
        return True
    lowered = raw.lower()
    if lowered.startswith(("mailto:", "tel:", "sms:", "javascript:", "data:")):
        return True
    parsed = urlparse(raw)
    if parsed.scheme in {"http", "https", "mailto", "tel"}:
        return True
    if raw.startswith("//"):
        return True
    return False


def local_candidates(value: str) -> list[Path]:
    path = unquote(urlparse(value).path)
    if not path or path.startswith("#"):
        return []
    rel = path[1:] if path.startswith("/") else path
    base = (ROOT / rel).resolve()
    candidates = [base]
    if path.endswith("/"):
        candidates.append(base / "index.html")
    else:
        candidates.append(Path(str(base) + ".html"))
        candidates.append(base / "index.html")
    # Keep only paths inside the repo.
    inside = []
    for candidate in candidates:
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            continue
        inside.append(candidate)
    return inside


def exists(value: str) -> bool:
    return any(path.is_file() for path in local_candidates(value))


def check_refs(html: str) -> list[str]:
    parser = RefParser()
    parser.feed(html)
    problems = []
    for key, value in parser.refs:
        if is_remote(value):
            continue
        if not exists(value):
            problems.append(f"local {key}={value!r} does not resolve to a file")
    return problems


def check_text(label: str, text: str) -> list[str]:
    problems = []
    if PHONE_555.search(text):
        problems.append(f"{label} contains a 555 phone number")
    lowered = text.lower()
    if "formspree" in lowered:
        problems.append(f"{label} contains a formspree form endpoint")
    for token in PLACEHOLDER_TOKENS:
        if token in text:
            problems.append(f"{label} contains placeholder form endpoint {token}")
    return problems


def check_sitemap() -> list[str]:
    sitemap = ROOT / "sitemap.xml"
    if not sitemap.is_file():
        return ["sitemap.xml is missing"]
    problems = []
    for loc in re.findall(r"<loc>\s*([^<]+)\s*</loc>", sitemap.read_text(encoding="utf-8")):
        parsed = urlparse(loc.strip())
        if parsed.netloc and parsed.netloc not in {"hillcountryhvacrepair.com", "www.hillcountryhvacrepair.com"}:
            continue
        path = parsed.path or "/"
        if not exists(path):
            problems.append(f"sitemap URL does not resolve locally: {loc.strip()}")
    return problems


def main() -> int:
    if not INDEX.is_file():
        print("index.html is missing", file=sys.stderr)
        return 1

    html = INDEX.read_text(encoding="utf-8")
    problems: list[str] = []
    problems.extend(check_refs(html))
    problems.extend(check_text("index.html", html))
    for marker in MANUS_MARKERS:
        if marker in html:
            problems.append(f"index.html still references Manus asset {marker}")

    linked = []
    parser = RefParser()
    parser.feed(html)
    for _key, value in parser.refs:
        if is_remote(value):
            continue
        for candidate in local_candidates(value):
            if candidate.is_file() and candidate.suffix in {".css", ".js", ".html"}:
                linked.append(candidate)
    for path in linked:
        rel = path.relative_to(ROOT)
        problems.extend(check_text(str(rel), path.read_text(encoding="utf-8", errors="replace")))

    problems.extend(check_sitemap())

    if problems:
        print("Homepage guard failed:")
        for item in problems:
            print(f"  - {item}")
        return 1

    print("Homepage guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
