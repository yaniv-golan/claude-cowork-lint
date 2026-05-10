"""Output formatters: text, JSON, SARIF."""

from __future__ import annotations

from cwlint.output.json_fmt import format_json
from cwlint.output.sarif import format_sarif
from cwlint.output.text import format_text

__all__ = ["format_json", "format_sarif", "format_text"]
