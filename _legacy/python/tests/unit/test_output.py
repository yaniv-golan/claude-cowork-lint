"""Tests for text/json/sarif formatters."""

from __future__ import annotations

import json
from pathlib import Path

from cwlint.findings import Finding, Report, Severity
from cwlint.output import format_json, format_sarif, format_text


def _make_report(findings: list[Finding] | None = None) -> Report:
    return Report(
        spec_version="0",
        claude_app_version="1.6259.1",
        findings=findings or [],
    )


def _make_finding(
    rule_id: str = "CW001", severity: Severity = Severity.ERROR, line: int = 1
) -> Finding:
    return Finding(
        rule_id=rule_id,
        severity=severity,
        path=Path("agents/foo.md"),
        line=line,
        message="boom",
        detail="some detail",
        suggestion="fix it",
    )


def test_text_clean_report() -> None:
    out = format_text(_make_report())
    assert "no findings" in out
    assert "1.6259.1" in out


def test_text_with_findings() -> None:
    report = _make_report([_make_finding()])
    out = format_text(report)
    assert "CW001" in out
    assert "agents/foo.md" in out
    assert "boom" in out
    assert "fix it" in out
    assert "Summary" in out


def test_json_shape() -> None:
    report = _make_report([_make_finding()])
    payload = format_json(report)
    assert payload["spec_version"] == "0"
    assert payload["claude_app_version"] == "1.6259.1"
    assert payload["findings"][0]["rule_id"] == "CW001"
    assert payload["findings"][0]["severity"] == "error"
    assert payload["findings"][0]["path"] == "agents/foo.md"
    assert payload["summary"] == {"error": 1, "warn": 0, "info": 0}


def test_json_serialisable() -> None:
    """The JSON output must be serializable via the std json module."""
    report = _make_report([_make_finding()])
    json.dumps(format_json(report))


def test_sarif_top_level() -> None:
    report = _make_report([_make_finding()])
    sarif = format_sarif(report)
    assert sarif["version"] == "2.1.0"
    assert sarif["runs"][0]["tool"]["driver"]["name"] == "claude-cowork-lint"
    assert sarif["runs"][0]["results"][0]["ruleId"] == "CW001"
    assert sarif["runs"][0]["results"][0]["level"] == "error"


def test_sarif_severity_mapping() -> None:
    report = _make_report(
        [
            _make_finding(rule_id="CW001", severity=Severity.ERROR),
            _make_finding(rule_id="CW003", severity=Severity.WARN),
            _make_finding(rule_id="CW009", severity=Severity.INFO),
        ]
    )
    sarif = format_sarif(report)
    levels = [r["level"] for r in sarif["runs"][0]["results"]]
    assert levels == ["error", "warning", "note"]
