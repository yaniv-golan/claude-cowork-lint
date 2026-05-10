"""Sub-agent allowlist (`Ys_` in v2.1.138, `jQ_` in v2.1.119).

Anchor: function with destructured signature
``({tools, isBuiltIn, isAsync=false, permissionMode})`` is unique to LW8/gz8.
The allowlist symbol is the one referenced inside that function's body as
``isAsync && !<sym>.has(O.name)`` (or its minified equivalent).
"""

from __future__ import annotations

import re
from typing import Any

from cwlint.extractors._base import Extractor
from cwlint.extractors._jsutil import resolve_set_body

# Function whose first argument destructures `{tools, isBuiltIn, isAsync=false, permissionMode}`.
# We anchor on the signature; the body is bracket-matched in code (not regex) to
# avoid greedy `.*?` swallowing the rest of the file.
_FILTER_SIG = re.compile(
    r"function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*"
    r"\(\{tools\s*:[^,]+,\s*isBuiltIn\s*:([^,]+),\s*isAsync\s*:([^=]+)=\s*!1\s*,"
    r"\s*permissionMode\s*:[^}]+\}\)\s*\{"
)


def _extract_body(source: str, brace_offset: int) -> str:
    """Given the offset of the opening `{` of a function, return the body up to its
    matching `}`. Counts braces; ignores braces inside string/regex literals only
    crudely (sufficient for minified bundles where literals are short)."""
    depth = 1
    i = brace_offset + 1
    in_string: str | None = None
    while i < len(source) and depth > 0:
        ch = source[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            in_string = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[brace_offset + 1 : i]
        i += 1
    return source[brace_offset + 1 : i]


class SubagentFilterExtractor(Extractor):
    field_name = "subagent_tool_filter"
    target_bundle = "cli"

    def extract(self, source: str) -> dict[str, Any] | None:
        m = _FILTER_SIG.search(source)
        if not m:
            return None
        body = _extract_body(source, m.end() - 1)
        is_builtin_var = m.group(2).strip()
        is_async_var = m.group(3).strip()

        out: dict[str, Any] = {"filter_fn_symbol": m.group(1)}

        # Drop set — `if(<SYM>.has(O.name))return!1`
        drop_re = re.compile(
            r"if\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.has\(\s*[A-Za-z_$][A-Za-z0-9_$]*\.name\s*\)\s*\)\s*return\s*!\s*1"
        )
        drop_match = drop_re.search(body)
        if drop_match:
            sym = drop_match.group(1)
            names = self._resolve_set(source, sym)
            if names:
                out["drop_set"] = {"names": names, "count": len(names), "symbol": sym}

        # Async-dispatch allowlist — `if(<isAsyncVar> && !<SYM>.has(O.name))...`
        # We escape `is_async_var` in case it has odd characters.
        allow_re = re.compile(
            rf"if\s*\(\s*{re.escape(is_async_var)}\s*&&\s*!\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.has\("
        )
        allow_match = allow_re.search(body)
        if allow_match:
            sym = allow_match.group(1)
            names = self._resolve_set(source, sym)
            if names:
                out["async_dispatch_allowlist"] = {
                    "names": names,
                    "count": len(names),
                    "symbol": sym,
                }

        # Non-builtin extra drop — `if(!<isBuiltInVar> && <SYM>.has(O.name))return!1`
        non_builtin_re = re.compile(
            rf"if\s*\(\s*!\s*{re.escape(is_builtin_var)}\s*&&\s*"
            r"([A-Za-z_$][A-Za-z0-9_$]*)\s*\.has\("
        )
        nb_match = non_builtin_re.search(body)
        if nb_match:
            sym = nb_match.group(1)
            names = self._resolve_set(source, sym)
            if names:
                out["non_builtin_extra_drop_set"] = {
                    "names": names,
                    "count": len(names),
                    "symbol": sym,
                }

        return out or None

    @staticmethod
    def _resolve_set(source: str, sym: str) -> list[str]:
        pat = re.compile(rf"(?<![A-Za-z0-9_$]){re.escape(sym)}\s*=\s*new\s+Set\(\[([^\]]+)\]\)")
        m = pat.search(source)
        if not m:
            return []
        return resolve_set_body(source, m.group(1))
