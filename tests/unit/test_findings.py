"""Tests for Severity / Finding / Report types."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from cwlint.findings import Finding, Report, Severity


def test_finding_immutable() -> None:
    f = Finding(
        rule_id="CW001",
        severity=Severity.ERROR,
        path=Path("agents/foo.md"),
        line=12,
        message="hello",
    )
    with pytest.raises(ValidationError):
        f.line = 99


def test_report_aggregates_severity_counts() -> None:
    findings = [
        Finding(rule_id="CW001", severity=Severity.ERROR, path=Path("a"), line=1, message=""),
        Finding(rule_id="CW003", severity=Severity.WARN, path=Path("b"), line=1, message=""),
        Finding(rule_id="CW003", severity=Severity.WARN, path=Path("c"), line=1, message=""),
        Finding(rule_id="CW009", severity=Severity.INFO, path=Path("d"), line=1, message=""),
    ]
    r = Report(spec_version="0", claude_app_version="1.6259.1", findings=findings)
    assert r.error_count == 1
    assert r.warn_count == 2
    assert r.info_count == 1
    assert r.has_errors is True


def test_report_strict_exit_code() -> None:
    findings = [
        Finding(rule_id="CW001", severity=Severity.ERROR, path=Path("a"), line=1, message=""),
    ]
    r = Report(spec_version="0", claude_app_version="1.6259.1", findings=findings)
    assert r.exit_code(strict=True) == 1
    assert r.exit_code(strict=False) == 0


def test_report_no_errors_exit_code_0_strict() -> None:
    findings = [
        Finding(rule_id="CW003", severity=Severity.WARN, path=Path("a"), line=1, message=""),
    ]
    r = Report(spec_version="0", claude_app_version="1.6259.1", findings=findings)
    assert r.exit_code(strict=True) == 0
    assert r.exit_code(strict=False) == 0
