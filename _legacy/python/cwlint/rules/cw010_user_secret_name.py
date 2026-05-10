"""CW010 — plugin userConfig option name violates user-secret validation rules."""

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


@register
class CW010UserSecretName(Rule):
    rule_id = "CW010"
    severity = Severity.ERROR
    summary = "Plugin userConfig option name violates user-secret validation rules"

    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        rules = spec.user_secrets_injection.validation
        name_re = re.compile(rules.name_regex)
        reserved = set(rules.reserved_name_literals)
        for plugin_path in layout.plugins:
            try:
                payload = json.loads(plugin_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            user_config = payload.get("userConfig") if isinstance(payload, dict) else None
            if not isinstance(user_config, dict):
                continue
            text = plugin_path.read_text(encoding="utf-8")
            lines = text.splitlines()
            sups = parse_suppressions(lines)
            for option_name in user_config:
                violations = _check_name(option_name, name_re, rules.name_max_length, reserved)
                if not violations:
                    continue
                line_no = _find_key_line(lines, option_name)
                if suppressed(sups, self.rule_id, line_no):
                    continue
                yield Finding(
                    rule_id=self.rule_id,
                    severity=self.severity,
                    path=plugin_path.relative_to(layout.root),
                    line=line_no,
                    message=f"userConfig option name {option_name!r}: {violations[0]}",
                    detail="; ".join(violations),
                    suggestion=(
                        "Use only [A-Za-z][A-Za-z0-9_]* (≤128 chars) and avoid reserved names "
                        "like ANTHROPIC_API_KEY, DATABASE_URL, SECRET_KEY."
                    ),
                )


def _check_name(name: str, name_re: re.Pattern[str], max_len: int, reserved: set[str]) -> list[str]:
    violations: list[str] = []
    if not name_re.match(name):
        violations.append(f"does not match regex {name_re.pattern!r}")
    if len(name) > max_len:
        violations.append(f"length {len(name)} > {max_len}")
    if name.upper() in reserved:
        violations.append(f"reserved name {name.upper()!r}")
    return violations


def _find_key_line(lines: list[str], key: str) -> int:
    pat = re.compile(rf'"{re.escape(key)}"\s*:')
    for idx, line in enumerate(lines, start=1):
        if pat.search(line):
            return idx
    return 1
