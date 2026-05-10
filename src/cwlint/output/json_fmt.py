"""Stable JSON contract documented in docs/CLI.md."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from cwlint.__about__ import __version__

if TYPE_CHECKING:
    from cwlint.findings import Report


def format_json(report: Report) -> dict[str, Any]:
    return {
        "cwlint_version": __version__,
        "spec_version": report.spec_version,
        "claude_app_version": report.claude_app_version,
        "findings": [
            {
                "rule_id": f.rule_id,
                "severity": str(f.severity),
                "path": str(f.path),
                "line": f.line,
                "message": f.message,
                "detail": f.detail,
                "suggestion": f.suggestion,
            }
            for f in report.findings
        ],
        "summary": {
            "error": report.error_count,
            "warn": report.warn_count,
            "info": report.info_count,
        },
    }
