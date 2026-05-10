"""Shared helpers used by multiple rules."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cwlint.spec import Spec
    from cwlint.suppression import Suppression

FRONTMATTER_RE = re.compile(r"^---\n(?P<body>.*?)\n---", re.DOTALL)


def subagent_survivors(spec: Spec) -> set[str]:
    """The set of (non-MCP) tool names a Cowork sub-agent will actually have.

    survivors = (async_dispatch_allowlist ∖ host_loop_excluded_builtins) ∖ drop_set
    MCP tools are handled separately (always pass via `mcp__` prefix).
    """
    f = spec.subagent_tool_filter
    h = spec.host_loop_tool_substitution
    async_allow = set(f.async_dispatch_allowlist.names)
    drop_set = set(f.drop_set.names)
    host_excluded = set(h.host_loop_excluded_builtins.names)
    return (async_allow - host_excluded) - drop_set


def find_token_line(lines: list[str], token: str, start_line: int = 1) -> int:
    """1-based line where `token` literally appears (word-boundary). Falls back to `start_line`."""
    pat = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])")
    for idx in range(start_line, len(lines) + 1):
        if pat.search(lines[idx - 1]):
            return idx
    return start_line


def suppressed(sups: list[Suppression], rule_id: str, line_no: int) -> bool:
    """True if a suppression marker on `line_no` or `line_no - 1` covers `rule_id`."""
    return any(rule_id in s.rule_ids and s.line in (line_no, line_no - 1) for s in sups)


def parse_frontmatter(text: str) -> tuple[dict[str, object] | None, int]:
    """Return (frontmatter_dict_or_None, body_start_line_1_based)."""
    import yaml

    m = FRONTMATTER_RE.search(text)
    if not m:
        return None, 1
    try:
        data = yaml.safe_load(m["body"])
    except yaml.YAMLError:
        return None, 1
    if not isinstance(data, dict):
        return None, 1
    body_start = text.count("\n", 0, m.start("body")) + 1
    return data, body_start
