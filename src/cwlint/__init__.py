"""cwlint — Claude Cowork runtime contract linter."""

from __future__ import annotations

from cwlint.__about__ import __version__
from cwlint.spec import Spec, load_default_spec, load_spec

__all__ = ["Spec", "__version__", "load_default_spec", "load_spec"]
