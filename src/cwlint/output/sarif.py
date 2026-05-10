"""SARIF 2.1.0 formatter for GitHub code-scanning."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from cwlint.__about__ import __version__
from cwlint.findings import Severity

if TYPE_CHECKING:
    from cwlint.findings import Finding, Report

_LEVEL = {
    Severity.ERROR: "error",
    Severity.WARN: "warning",
    Severity.INFO: "note",
}


def format_sarif(report: Report) -> dict[str, Any]:
    rules_seen: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []
    for f in report.findings:
        rules_seen.setdefault(
            f.rule_id,
            {
                "id": f.rule_id,
                "name": f.rule_id,
                "shortDescription": {"text": f.message},
                "defaultConfiguration": {"level": _LEVEL[f.severity]},
            },
        )
        results.append(_format_result(f))
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "claude-cowork-lint",
                        "informationUri": (
                            "https://github.com/yaniv-golan/claude-cowork-lint"
                        ),
                        "version": __version__,
                        "rules": list(rules_seen.values()),
                    }
                },
                "results": results,
                "properties": {
                    "spec_version": report.spec_version,
                    "claude_app_version": report.claude_app_version,
                },
            }
        ],
    }


def _format_result(f: Finding) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ruleId": f.rule_id,
        "level": _LEVEL[f.severity],
        "message": {"text": f.message},
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": str(f.path)},
                    "region": {"startLine": f.line},
                }
            }
        ],
    }
    if f.detail or f.suggestion:
        properties: dict[str, Any] = {}
        if f.detail:
            properties["detail"] = f.detail
        if f.suggestion:
            properties["suggestion"] = f.suggestion
        result["properties"] = properties
    return result
