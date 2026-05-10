"""Kernel-env allowlist (`MGn` in v1.6259.1) — strings the VM kernel-shell sees.

Anchor: `new Set([...])` literal containing the unique combination "HOME",
"PATH", and "OPERON_SECRET_VARS" — that triple uniquely identifies MGn.
"""

from __future__ import annotations

import re
from typing import Any

from cwlint.extractors._base import Extractor

_ANCHOR = re.compile(
    r"""new\s+Set\(\[
        (?P<body>[^\]]*"OPERON_SECRET_VARS"[^\]]*)
    \]\)""",
    re.VERBOSE | re.DOTALL,
)
_STRING = re.compile(r'"([A-Za-z_][A-Za-z0-9_]*)"')


class KernelEnvAllowlistExtractor(Extractor):
    field_name = "kernel_env_passthrough"
    target_bundle = "desktop"

    def extract(self, source: str) -> dict[str, Any] | None:
        for m in _ANCHOR.finditer(source):
            body = m["body"]
            if "HOME" in body and "PATH" in body:
                names = _STRING.findall(body)
                if names and "OPERON_SECRET_VARS" in names:
                    return {
                        "allowlist": names,
                        "deleted_after_filter": [
                            n for n in ("HOME", "USER", "LOGNAME", "TMPDIR") if n in names
                        ],
                    }
        return None
