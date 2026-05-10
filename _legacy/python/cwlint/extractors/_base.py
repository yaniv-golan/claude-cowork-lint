"""Extractor ABC."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Extractor(ABC):
    """Base class for a single behavioural-anchor extractor.

    Each subclass extracts ONE field of the contract from a JS bundle string.
    Subclasses should be stateless and idempotent.
    """

    field_name: str
    """Top-level key under which the extracted JSON fragment is merged."""

    target_bundle: str
    """Either 'desktop' (Claude.app/.vite/build/index.js) or 'cli' (Bun SEA bundle)."""

    @abstractmethod
    def extract(self, source: str) -> dict[str, Any] | None:
        """Return the JSON fragment for this field, or None if no match."""


class ExtractorRegistry:
    """Holds and runs all registered extractors against a bundle."""

    def __init__(self) -> None:
        self._items: list[Extractor] = []

    def register(self, extractor: Extractor) -> None:
        self._items.append(extractor)

    def all(self) -> list[Extractor]:
        return list(self._items)

    def run(self, source: str, target: str) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for ex in self._items:
            if ex.target_bundle != target:
                continue
            fragment = ex.extract(source)
            if fragment is None:
                continue
            out[ex.field_name] = fragment
        return out
