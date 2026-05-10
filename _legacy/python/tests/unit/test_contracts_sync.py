"""contracts/ and src/cwlint/_contracts/ must contain byte-identical files."""

from __future__ import annotations

import filecmp
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path


def test_contracts_in_sync(repo_root: Path) -> None:
    root_dir = repo_root / "contracts"
    pkg_dir = repo_root / "src" / "cwlint" / "_contracts"
    root_files = sorted(p.name for p in root_dir.iterdir() if p.is_file() and not p.is_symlink())
    pkg_files = sorted(
        p.name
        for p in pkg_dir.iterdir()
        if p.is_file() and not p.is_symlink() and p.name != "__init__.py"
    )
    assert root_files == pkg_files, f"contract files differ: root={root_files} pkg={pkg_files}"
    for name in root_files:
        assert filecmp.cmp(root_dir / name, pkg_dir / name, shallow=False), (
            f"{name}: repo-root and package copies differ; run `python scripts/sync_contracts.py`"
        )
