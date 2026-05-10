"""CW003 — SKILL.md uses bare $CLAUDE_PLUGIN_ROOT instead of ${CLAUDE_PLUGIN_ROOT}."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from cwlint.findings import Finding, Severity
from cwlint.rules import register
from cwlint.rules._base import Rule
from cwlint.rules._helpers import suppressed
from cwlint.suppression import parse_suppressions

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.spec import Spec


@register
class CW003BareEnvVar(Rule):
    rule_id = "CW003"
    severity = Severity.WARN
    summary = "SKILL.md uses bare $CLAUDE_PLUGIN_ROOT instead of ${CLAUDE_PLUGIN_ROOT}"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        target = spec.skill_frontmatter_invariants.env_var_substitution
        bare_name = target.unsupported_form.lstrip("$")
        wrapped = target.supported_form
        # Match $NAME but NOT ${NAME and NOT $NAME_SUFFIX (longer name)
        pat = re.compile(rf"\$(?!\{{){re.escape(bare_name)}(?![A-Za-z0-9_])")

        for skill_path in layout.skills:
            text = skill_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            for idx, line in enumerate(lines, start=1):
                if not pat.search(line):
                    continue
                if suppressed(sups, self.rule_id, idx):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=skill_path.relative_to(layout.root),
                    line=idx,
                    message=f"bare {target.unsupported_form!r} found",
                    detail=(target.reason or ""),
                    suggestion=f"Use {wrapped!r} instead.",
                )
