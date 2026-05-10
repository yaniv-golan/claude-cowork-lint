"""CW002 — agent has neither Write nor Edit after the runtime gates."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.findings import Finding, Severity
from cwlint.rules import register
from cwlint.rules._base import Rule
from cwlint.rules._helpers import (
    find_token_line,
    parse_frontmatter,
    subagent_survivors,
    suppressed,
)
from cwlint.suppression import parse_suppressions

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.spec import Spec

_PERSISTENCE = frozenset({"Write", "Edit"})


@register
class CW002NoPersistencePath(Rule):
    rule_id = "CW002"
    severity = Severity.ERROR
    summary = "Agent has neither Write nor Edit after the runtime gates apply"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        survivors = subagent_survivors(spec)
        for agent_path in layout.agents:
            text = agent_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            fm, body_start = parse_frontmatter(text)
            if fm is None:
                continue
            tools = fm.get("tools")
            if not isinstance(tools, list):
                continue
            declared = {t for t in tools if isinstance(t, str)}
            survives = (declared & survivors) | {t for t in declared if t.startswith("mcp__")}
            if _PERSISTENCE & survives:
                continue
            line_no = find_token_line(lines, "tools", body_start)
            if suppressed(sups, self.rule_id, line_no):
                continue
            yield Finding(
                rule_id=self.rule_id,
                severity=self.severity,
                path=agent_path.relative_to(layout.root),
                line=line_no,
                message="agent has no persistence tool (Write or Edit) available in Cowork",
                detail=(
                    "After the host-loop and async-dispatch filters apply, neither 'Write' nor "
                    "'Edit' is in this agent's tool set. The agent cannot persist file changes."
                ),
                suggestion="Add 'Write' or 'Edit' to this agent's tools.",
            )
