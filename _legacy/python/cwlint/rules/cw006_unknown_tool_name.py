"""CW006 — hook command references a tool name not in any allowlist (typo detector)."""

from __future__ import annotations

import difflib
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

# Tool-name shape: capitalised CamelCase, length 2..40, no underscores.
_TOOL_RE = re.compile(r"\b([A-Z][a-zA-Z]{1,39})\b")


@register
class CW006UnknownToolName(Rule):
    rule_id = "CW006"
    severity = Severity.WARN
    summary = "Hook command references a tool name not in any allowlist (typo detector)"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        known = _build_known_tool_universe(spec)
        for hook_path in layout.plugin_hooks_files + layout.settings_files:
            try:
                payload = json.loads(hook_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            text = hook_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            for raw, lineno in _walk_strings(payload, text):
                for match in _TOOL_RE.finditer(raw):
                    candidate = match.group(1)
                    if candidate in known:
                        continue
                    suggestions = difflib.get_close_matches(candidate, known, n=1, cutoff=0.7)
                    if not suggestions:
                        continue
                    if suppressed(sups, self.rule_id, lineno):
                        continue
                    msg = f"unknown tool name {candidate!r} — did you mean {suggestions[0]!r}?"
                    yield Finding(
                        rule_id=self.rule_id,
                        severity=self.severity,
                        path=hook_path.relative_to(layout.root),
                        line=lineno,
                        message=msg,
                        suggestion=f"Replace {candidate!r} with {suggestions[0]!r}.",
                    )


def _build_known_tool_universe(spec: Spec) -> set[str]:
    f = spec.subagent_tool_filter
    h = spec.host_loop_tool_substitution
    universe = set(f.async_dispatch_allowlist.names)
    universe |= set(f.drop_set.names)
    universe |= set(f.fork_subagent_allowlist.names)
    universe |= set(f.experimental_fallback_allowlist.names)
    universe |= set(h.host_loop_safe_set.names)
    universe |= set(h.host_loop_excluded_builtins.names)
    return universe


def _walk_strings(payload: object, text: str) -> Iterable[tuple[str, int]]:
    """Yield (string, approximate-line-number) for every string value in a JSON payload."""
    lines = text.splitlines()
    seen: set[str] = set()

    def _collect(node: object) -> Iterable[str]:
        if isinstance(node, str):
            yield node
        elif isinstance(node, dict):
            for v in node.values():
                yield from _collect(v)
        elif isinstance(node, list):
            for v in node:
                yield from _collect(v)

    for s in _collect(payload):
        if s in seen:
            continue
        seen.add(s)
        line_no = 1
        for idx, line in enumerate(lines, start=1):
            if s in line:
                line_no = idx
                break
        yield s, line_no
