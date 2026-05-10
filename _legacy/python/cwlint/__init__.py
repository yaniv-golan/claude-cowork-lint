"""cwlint — Claude Cowork runtime contract linter."""

from __future__ import annotations

from cwlint.__about__ import __version__
from cwlint.engine import check_repo
from cwlint.findings import Finding, Report, Severity
from cwlint.spec import Spec, load_default_spec, load_spec

__all__ = [
    "Finding",
    "Report",
    "Severity",
    "Spec",
    "__version__",
    "check_repo",
    "load_default_spec",
    "load_spec",
]
