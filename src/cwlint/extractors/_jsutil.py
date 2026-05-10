"""Helpers for resolving minified-JS symbols to string literals.

Minified Bun/Webpack output typically defines tool names as `var Name="Read"`,
`Sym="Bash"`, etc., scattered across the file. To turn an allowlist like
`new Set([H9, Sh, yC, ...])` into a list of names, we need to find each
identifier's string-literal binding.
"""

from __future__ import annotations

import re

_SYMBOL_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def parse_symbol_list(body: str) -> list[str]:
    """Parse a comma-separated `new Set([...])` body into identifier and spread tokens.

    `body` is the inside of a `[...]`. Items may be bare identifiers
    (`H9`, `$BH`), spreads (`...$2`), or string literals (`"Read"`).
    Returns a list of items as-is — caller is responsible for resolution.
    """
    return [tok.strip() for tok in body.split(",") if tok.strip()]


def resolve_symbol(source: str, name: str) -> str | None:
    """Return the string literal a top-level identifier is assigned to, or None.

    Handles both `var name="value"` and `name="value"` patterns. Skips matches
    where `name` is preceded by an identifier character (i.e. is a substring of
    a longer identifier).
    """
    if not _SYMBOL_RE.match(name):
        return None
    pat = re.compile(rf'(?<![A-Za-z0-9_$]){re.escape(name)}\s*=\s*"([^"]+)"')
    m = pat.search(source)
    return m.group(1) if m else None


def resolve_set_body(source: str, body: str) -> list[str]:
    """Resolve a Set body to a flat list of string-literal names.

    Spreads (`...X`) where `X` is itself a Set/array of identifiers get
    expanded if `X = new Set([...])` or `X = [...]` is found. Unknown spread
    targets are skipped silently.
    """
    out: list[str] = []
    for tok in parse_symbol_list(body):
        if tok.startswith("..."):
            inner = tok[3:].strip()
            spread_def = re.search(
                rf'(?<![A-Za-z0-9_$]){re.escape(inner)}\s*=\s*(?:new\s+Set\()?\[([^\]]+)\]',
                source,
            )
            if spread_def:
                out.extend(resolve_set_body(source, spread_def.group(1)))
            continue
        if tok.startswith('"') and tok.endswith('"'):
            out.append(tok[1:-1])
            continue
        # bare identifier
        resolved = resolve_symbol(source, tok)
        if resolved is not None:
            out.append(resolved)
    return out
