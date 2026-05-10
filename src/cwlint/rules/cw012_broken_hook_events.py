"""CW012 — plugin hooks declare specific events known broken in Cowork."""

from __future__ import annotations

import json
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

_BROKEN_EVENTS = frozenset(
    {
        "SessionStart",
        "Stop",
        "SubagentStart",
        "SubagentStop",
        "UserPromptSubmit",
        "PostToolUse",
    }
)


@register
class CW012BrokenHookEvents(Rule):
    rule_id = "CW012"
    severity = Severity.INFO
    summary = "Plugin hooks declare events known broken in Cowork"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:  # noqa: ARG002
        for hook_path in layout.plugin_hooks_files:
            try:
                payload = json.loads(hook_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            hooks_obj = payload.get("hooks") if isinstance(payload, dict) else payload
            if not isinstance(hooks_obj, dict):
                continue
            text = hook_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            for event_name in hooks_obj:
                if event_name not in _BROKEN_EVENTS:
                    continue
                line_no = _find_key_line(lines, event_name)
                if suppressed(sups, self.rule_id, line_no):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=hook_path.relative_to(layout.root),
                    line=line_no,
                    message=f"hook event {event_name!r} is silently broken in Cowork",
                    detail=(
                        f"The {event_name!r} hook event is declared here, but plugin-scoped "
                        "hooks do not fire in Cowork sessions. This is a stronger signal than "
                        "CW011 because the event itself depends on the lifecycle that Cowork "
                        "drops."
                    ),
                    suggestion="Move this hook to ~/.claude/settings.json (user scope).",
                )


def _find_key_line(lines: list[str], key: str) -> int:
    pat = re.compile(rf'"{re.escape(key)}"\s*:')
    for idx, line in enumerate(lines, start=1):
        if pat.search(line):
            return idx
    return 1
