"""Shared pytest fixtures."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest


@pytest.fixture
def repo_root() -> Path:
    """Absolute path to the project root, regardless of cwd."""
    return Path(__file__).resolve().parent.parent


@pytest.fixture
def make_skill_repo(tmp_path: Path) -> Callable[[dict[str, str]], Path]:
    """Build a synthetic skill/plugin repo under tmp_path. Returns the root dir."""

    def _make(files: dict[str, str]) -> Path:
        for rel, content in files.items():
            target = tmp_path / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        return tmp_path

    return _make
