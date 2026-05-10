"""Sanity smoke test for the package surface."""

from __future__ import annotations

import cwlint


def test_package_exposes_version() -> None:
    assert isinstance(cwlint.__version__, str)
    assert cwlint.__version__.startswith("0.")


def test_public_surface_loads_default_spec() -> None:
    spec = cwlint.load_default_spec()
    assert spec.spec_version == "0"
