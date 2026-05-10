"""CW008 — structured sub-agent dispatch cue followed within 30 lines by a fenced bash block."""

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

# Structured cues with low false-positive rate. Avoid prose words.
_DISPATCH_CUES: list[re.Pattern[str]] = [
    re.compile(r"\bsubagent_type\s*[:=]"),
    re.compile(r"\bTask\s*\("),
    re.compile(r"(?<![\w/])/bg(?![\w/])"),
    re.compile(r"(?<![\w/])/background(?![\w/])"),
    re.compile(r"(?<![\w/])/fork(?![\w/])"),
    re.compile(r"\bspawn_subagent\b"),
    re.compile(r"\brun_in_background\s*[:=]\s*true"),
]
_BASH_FENCE = re.compile(r"^```(?:bash|sh|shell)\b", re.IGNORECASE)
_MAIN_THREAD = re.compile(r"main[- ]thread", re.IGNORECASE)
_LOOKAHEAD = 30
_MAIN_THREAD_LOOKBACK = 3


@register
class CW008SubagentBashHeuristic(Rule):
    rule_id = "CW008"
    severity = Severity.WARN
    summary = "Sub-agent dispatch cue followed by a fenced bash block within 30 lines"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:  # noqa: ARG002
        for skill_path in layout.skills:
            text = skill_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            cue_lines = [
                idx
                for idx, line in enumerate(lines, start=1)
                if any(p.search(line) for p in _DISPATCH_CUES)
            ]
            for cue_line in cue_lines:
                end = min(cue_line + _LOOKAHEAD, len(lines))
                for fence_idx in range(cue_line + 1, end + 1):
                    if not _BASH_FENCE.match(lines[fence_idx - 1]):
                        continue
                    # check for main-thread comment within 3 lines before
                    pre_start = max(0, fence_idx - 1 - _MAIN_THREAD_LOOKBACK)
                    pre_window = lines[pre_start : fence_idx - 1]
                    if any(_MAIN_THREAD.search(line) for line in pre_window):
                        break
                    if suppressed(sups, self.rule_id, fence_idx):
                        break
                    yield Finding(
                        rule_id=self.rule_id,
                        severity=self.severity,
                        path=skill_path.relative_to(layout.root),
                        line=fence_idx,
                        message="bash block follows a sub-agent dispatch cue",
                        detail=(
                            "A structured dispatch cue was found within "
                            f"{_LOOKAHEAD} lines above this fence (line {cue_line}). "
                            "Bash is stripped from Cowork sub-agents — the example may not "
                            "reflect runtime behaviour."
                        ),
                        suggestion=(
                            "If this block runs on the main thread, add a comment like "
                            "'# main-thread block' within 3 lines above the fence to silence "
                            "this finding. Otherwise replace Bash with mcp__workspace__bash."
                        ),
                    )
                    break
