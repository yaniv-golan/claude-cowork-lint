"""Sanity smoke test for the package surface."""

from __future__ import annotations

import cwlint


def test_package_exposes_version() -> None:
    assert isinstance(cwlint.__version__, str)
    assert cwlint.__version__.startswith("0.")
