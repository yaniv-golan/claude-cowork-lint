"""CW011 — plugin has hooks/hooks.json (silently excluded in Cowork)."""

from __future__ import annotations

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
class CW011PluginHooks(Rule):
    rule_id = "CW011"
    severity = Severity.WARN
    summary = "Plugin has hooks/hooks.json — won't fire in Cowork"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:  # noqa: ARG002
        for hook_path in layout.plugin_hooks_files:
            text = hook_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            line_no = 1
            if suppressed(sups, self.rule_id, line_no):
                continue
            yield Finding(
                rule_id=self.rule_id,
                severity=self.severity,
                path=hook_path.relative_to(layout.root),
                line=line_no,
                message="plugin-scoped hooks.json found",
                detail=(
                    "Cowork spawns the in-VM CLI with `--setting-sources=user`, restricting "
                    "settings resolution to user scope. Plugin-scoped hooks (declared here) "
                    "DO NOT FIRE in Cowork sessions. See "
                    "https://github.com/anthropics/claude-code/issues/16288 and "
                    "https://github.com/anthropics/claude-code/issues/27398."
                ),
                suggestion=(
                    "Move hooks to ~/.claude/settings.json (user scope) so they fire in both "
                    "Cowork and Claude Code Desktop sessions."
                ),
            )
