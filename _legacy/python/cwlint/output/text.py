"""Human-readable text formatter."""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from cwlint.findings import Severity

if TYPE_CHECKING:
    from cwlint.findings import Finding, Report

_ICON = {
    Severity.ERROR: "✗",
    Severity.WARN: "!",
    Severity.INFO: "i",
}


def format_text(report: Report) -> str:
    if not report.findings:
        return "✓ no findings  (spec: claude-app " + report.claude_app_version + ")"

    by_path: dict[str, list[Finding]] = defaultdict(list)
    for f in report.findings:
        by_path[str(f.path)].append(f)

    out: list[str] = []
    for path in sorted(by_path):
        out.append(f"\n{path}")
        for f in by_path[path]:
            icon = _ICON[f.severity]
            out.append(f"  {icon} {f.line:>4}  {f.rule_id}  {f.message}")
            if f.detail:
                out.append(f"          {f.detail}")
            if f.suggestion:
                out.append(f"          → {f.suggestion}")

    out.append("")
    out.append(
        "Summary: "
        f"{report.error_count} error, "
        f"{report.warn_count} warn, "
        f"{report.info_count} info  "
        f"(spec: claude-app {report.claude_app_version})"
    )
    return "\n".join(out)
