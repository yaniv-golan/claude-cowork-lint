"""Desktop-side host-loop tool gates (`zvt`/`jie` in v1.6259, `Y2e`/`xUA` in v1.6608).

Two arrays in the desktop bundle:
  - host_loop_safe_set: tools that survive the desktop pre-CLI filter
  - host_loop_excluded_builtins: built-ins explicitly stripped (replaced with MCP tools)

Behavioural anchors:
  - safe-set: array starting with "Task","Glob","Grep","Read","Edit","Write" and
    ending with "ToolSearch","SendUserMessage". Member spreads are followed.
  - excluded: array literal exactly matching the 5-element set
    {Bash, NotebookEdit, REPL, JavaScript, WebFetch} in some order.
"""

from __future__ import annotations

import re
from typing import Any

from cwlint.extractors._base import Extractor
from cwlint.extractors._jsutil import resolve_set_body

_SAFE_SET = re.compile(
    r'\[\s*"Task"\s*,\s*"Glob"\s*,\s*"Grep"\s*,\s*"Read"\s*,'
    r'(?P<body>[^\]]*?"SendUserMessage")\s*\]'
)
_EXCLUDED = re.compile(
    r'\[\s*(?P<body>(?:"(?:Bash|NotebookEdit|REPL|JavaScript|WebFetch)"\s*,\s*){4}'
    r'"(?:Bash|NotebookEdit|REPL|JavaScript|WebFetch)")\s*\]'
)
_REPLACEMENTS_HEURISTIC = {
    "Bash": "mcp__workspace__bash",
    "WebFetch": "mcp__workspace__web_fetch",
}


class HostLoopExtractor(Extractor):
    field_name = "host_loop_tool_substitution"
    target_bundle = "desktop"

    def extract(self, source: str) -> dict[str, Any] | None:
        out: dict[str, Any] = {}
        safe = _SAFE_SET.search(source)
        if safe:
            full = '"Task","Glob","Grep","Read",' + safe.group("body")
            names = resolve_set_body(source, full)
            if names:
                out["host_loop_safe_set"] = {"names": names, "count": len(names)}

        excluded = _EXCLUDED.search(source)
        if excluded:
            names = re.findall(r'"([A-Za-z]+)"', excluded.group("body"))
            if names:
                out["host_loop_excluded_builtins"] = {
                    "names": names,
                    "count": len(names),
                    "mcp_replacements": {
                        n: _REPLACEMENTS_HEURISTIC[n] for n in names if n in _REPLACEMENTS_HEURISTIC
                    },
                }
        return out or None
