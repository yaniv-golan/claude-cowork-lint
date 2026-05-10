"""CW005 — SKILL.md missing required frontmatter field (e.g. user-invocable: true)."""

from __future__ import annotations

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
class CW005MissingUserInvocable(Rule):
    rule_id = "CW005"
    severity = Severity.WARN
    summary = "SKILL.md missing required frontmatter field"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        required = spec.skill_frontmatter_invariants.required_fields
        for skill_path in layout.skills:
            text = skill_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            fm, body_start = parse_frontmatter(text)
            for field_name in required:
                fm_value = fm.get(field_name) if fm else None
                if fm and field_name in fm and fm_value is not False:
                    continue
                # report on the closing --- line if frontmatter exists, else line 1
                line_no = max(body_start, 1)
                if suppressed(sups, self.rule_id, line_no):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=skill_path.relative_to(layout.root),
                    line=line_no,
                    message=f"required frontmatter field {field_name!r} missing or false",
                    suggestion=f"Add `{field_name}: true` to the SKILL.md frontmatter.",
                )
