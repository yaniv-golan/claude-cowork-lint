"""Run all registered rules against a target repo."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.discovery import discover
from cwlint.findings import Finding, Report
from cwlint.rules import all_rules

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

    from cwlint.spec import Spec


def check_repo(root: Path, spec: Spec, *, ignore: Iterable[str] = ()) -> Report:
    """Discover and run all rules against `root`. Read-only."""
    layout = discover(root)
    ignored = set(ignore)
    findings: list[Finding] = []
    for rule in all_rules():
        if rule.rule_id in ignored:
            continue
        findings.extend(rule.check(layout, spec))
    return Report(
        spec_version=spec.spec_version,
        claude_app_version=spec.claude_app_version,
        findings=sorted(findings, key=lambda f: (f.rule_id, str(f.path), f.line)),
    )
