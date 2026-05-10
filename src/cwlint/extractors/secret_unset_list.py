"""OPERON_SECRET_VARS list (`ljt` in v1.6259.1).

Anchor: array literal containing the unique triple "ANTHROPIC_API_KEY",
"OPENAI_API_KEY", "OPERON_EZPROXY_COOKIE" — that triple is unique enough to
identify ljt across builds.
"""

from __future__ import annotations

import re
from typing import Any

from cwlint.extractors._base import Extractor

_ANCHOR = re.compile(
    r"""\[
        (?P<body>[^\]]*"ANTHROPIC_API_KEY"[^\]]*"OPENAI_API_KEY"[^\]]*)
    \]""",
    re.VERBOSE | re.DOTALL,
)
_STRING = re.compile(r'"([A-Z][A-Z0-9_]*)"')


class SecretUnsetListExtractor(Extractor):
    field_name = "secret_unset_list"
    target_bundle = "desktop"

    def extract(self, source: str) -> dict[str, Any] | None:
        for m in _ANCHOR.finditer(source):
            body = m["body"]
            if "OPERON_EZPROXY_COOKIE" not in body:
                continue
            names = _STRING.findall(body)
            if not names:
                continue
            return {"names": names, "count": len(names)}
        return None
