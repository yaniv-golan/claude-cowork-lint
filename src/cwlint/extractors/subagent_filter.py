"""Sub-agent allowlist (`Ys_` in v2.1.138, `jQ_` in v2.1.119).

Anchor: function with destructured signature
``({tools, isBuiltIn, isAsync=false, permissionMode})`` is unique to LW8.
The `Ys_` allowlist is the `new Set([...])` referenced inside that function's
async-allowlist gate.
"""

from __future__ import annotations

import re
from typing import Any

from cwlint.extractors._base import Extractor

_FILTER_FN = re.compile(
    r"""\{tools\s*:[^,]+,\s*isBuiltIn\s*:[^,]+,\s*isAsync\s*:[^=]+=\s*!1\s*,\s*permissionMode\s*:""",
    re.VERBOSE,
)
_ALLOWLIST = re.compile(r'new\s+Set\(\[(?P<body>[^\]]*"Read"[^\]]*"Bash"[^\]]*)\]\)')
_STRING = re.compile(r'"([A-Za-z_][A-Za-z0-9_]*)"')


class SubagentFilterExtractor(Extractor):
    field_name = "subagent_tool_filter"
    target_bundle = "cli"

    def extract(self, source: str) -> dict[str, Any] | None:
        if not _FILTER_FN.search(source):
            return None
        for m in _ALLOWLIST.finditer(source):
            body = m["body"]
            names = _STRING.findall(body)
            if "Bash" in names and "Read" in names and "Write" in names:
                return {
                    "async_dispatch_allowlist": {
                        "names": names,
                        "count": len(names),
                    }
                }
        return None
