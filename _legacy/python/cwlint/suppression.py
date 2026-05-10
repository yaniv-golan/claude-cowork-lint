"""Parse `# cwlint: ignore CWxxx[,CWyyy] reason="..."` markers.

A suppression on line N applies to the same line OR the line immediately below.
Without a `reason="..."` field it is silently ignored — keeps in-tree ignores honest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

_PATTERN = re.compile(
    r"""cwlint:\s+ignore\s+(?P<ids>CW\d{3}(?:\s*,\s*CW\d{3})*)\s+reason="(?P<reason>[^"]+)\"""",
    re.VERBOSE,
)


@dataclass(frozen=True)
class Suppression:
    line: int
    rule_ids: tuple[str, ...]
    reason: str

    def applies_to(self, *, rule_id: str, line: int) -> bool:
        """Marker on the same line or the line immediately above silences the finding."""
        return rule_id in self.rule_ids and line in (self.line, self.line + 1)


def parse_suppressions(lines: Iterable[str]) -> list[Suppression]:
    out: list[Suppression] = []
    for idx, raw in enumerate(lines, start=1):
        m = _PATTERN.search(raw)
        if not m:
            continue
        ids = tuple(s.strip() for s in m["ids"].split(","))
        out.append(Suppression(line=idx, rule_ids=ids, reason=m["reason"]))
    return out
