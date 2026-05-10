"""Rule ABC. Each rule is stateless and produces zero or more Findings."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

    from cwlint.discovery import RepoLayout
    from cwlint.findings import Finding, Severity
    from cwlint.spec import Spec


class Rule(ABC):
    rule_id: str
    severity: Severity
    summary: str

    @abstractmethod
    def check(self, layout: RepoLayout, spec: Spec) -> Iterable[Finding]:
        """Yield findings. Must not mutate `layout` or `spec`."""
