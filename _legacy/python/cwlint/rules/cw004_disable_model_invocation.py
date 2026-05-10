"""CW004 — SKILL.md frontmatter sets a forbidden field (e.g. disable-model-invocation: true)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from cwlint.findings import Finding, Severity
from cwlint.rules import register
from cwlint.rules._base import Rule
from cwlint.rules._helpers import parse_frontmatter, suppressed
from cwlint.suppression import parse_suppressions

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.spec import Spec


@register
class CW004DisableModelInvocation(Rule):
    rule_id = "CW004"
    severity = Severity.ERROR
    summary = "SKILL.md frontmatter sets a forbidden field"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        forbidden = spec.skill_frontmatter_invariants.forbidden_fields
        for skill_path in layout.skills:
            text = skill_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            fm, body_start = parse_frontmatter(text)
            if fm is None:
                continue
            for ff in forbidden:
                if ff.field not in fm:
                    continue
                if fm[ff.field] != ff.value:
                    continue
                # Find the line where `field:` appears in the frontmatter.
                pat = re.compile(rf"^\s*{re.escape(ff.field)}\s*:")
                line_no = body_start
                for idx in range(body_start, len(lines) + 1):
                    if pat.match(lines[idx - 1]):
                        line_no = idx
                        break
                if suppressed(sups, self.rule_id, line_no):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=skill_path.relative_to(layout.root),
                    line=line_no,
                    message=f"forbidden frontmatter field {ff.field!r} = {ff.value!r}",
                    detail=ff.reason,
                    suggestion=f"Remove `{ff.field}: {ff.value}` from frontmatter.",
                )
