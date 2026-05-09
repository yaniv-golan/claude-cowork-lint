"""Layer boundaries — fail CI if a low-level module imports a high-level one."""

from __future__ import annotations

import ast
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

_RULE = tuple[str, tuple[str, ...]]

# (importer_prefix, forbidden_imports): a module under `importer_prefix` may NOT
# import any module whose dotted name starts with one of `forbidden_imports`.
_HIGH = ("cwlint.cli", "cwlint.engine", "cwlint.output")
_HIGH_PLUS_DEPS = (*_HIGH, "cwlint.discovery", "cwlint.rules", "cwlint.spec")
_RULES: list[_RULE] = [
    ("cwlint.spec", (*_HIGH, "cwlint.discovery", "cwlint.rules")),
    ("cwlint.findings", _HIGH_PLUS_DEPS),
    ("cwlint.suppression", _HIGH_PLUS_DEPS),
    ("cwlint.discovery", (*_HIGH, "cwlint.rules")),
    ("cwlint.rules", _HIGH),
    ("cwlint.output", (*_HIGH, "cwlint.rules", "cwlint.discovery")),
    ("cwlint.engine", ("cwlint.cli", "cwlint.output")),
]


def _module_name(path: Path, src_root: Path) -> str:
    rel = path.relative_to(src_root).with_suffix("")
    return ".".join(rel.parts)


def test_no_layer_violations(repo_root: Path) -> None:
    src_root = repo_root / "src"
    violations: list[str] = []
    for py_file in (src_root / "cwlint").rglob("*.py"):
        mod = _module_name(py_file, src_root)
        tree = ast.parse(py_file.read_text(encoding="utf-8"))
        imports: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module)
        for prefix, forbidden in _RULES:
            if not mod.startswith(prefix):
                continue
            for imp in imports:
                if any(imp == f or imp.startswith(f + ".") for f in forbidden):
                    violations.append(f"{mod} imports {imp} (forbidden by {prefix})")
    assert not violations, "Layer-boundary violations:\n" + "\n".join(violations)
