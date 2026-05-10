"""Public types: Severity, Finding, Report."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class Severity(StrEnum):
    ERROR = "error"
    WARN = "warn"
    INFO = "info"


class Finding(BaseModel):
    model_config = ConfigDict(frozen=True)

    rule_id: str
    severity: Severity
    path: Path
    line: int
    message: str
    detail: str | None = None
    suggestion: str | None = None


class Report(BaseModel):
    model_config = ConfigDict(frozen=True)

    spec_version: str
    claude_app_version: str
    findings: list[Finding] = Field(default_factory=list)

    @property
    def error_count(self) -> int:
        return sum(1 for f in self.findings if f.severity is Severity.ERROR)

    @property
    def warn_count(self) -> int:
        return sum(1 for f in self.findings if f.severity is Severity.WARN)

    @property
    def info_count(self) -> int:
        return sum(1 for f in self.findings if f.severity is Severity.INFO)

    @property
    def has_errors(self) -> bool:
        return self.error_count > 0

    def exit_code(self, *, strict: bool) -> int:
        if strict and self.has_errors:
            return 1
        return 0
