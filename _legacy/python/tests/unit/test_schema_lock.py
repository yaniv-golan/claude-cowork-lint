"""Schema-lock test: at v1.0 we promised `spec_version: "0"` is locked.

Bumping `spec_version` is a major-version event for the *project* (cwlint
itself), not just a contract update. This test exists so the lock can't be
broken accidentally — if you genuinely need a `spec_version: "1"` migration,
delete this test and bump the major in `__about__.py` in the same PR.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path


def test_spec_version_locked_at_zero(repo_root: Path) -> None:
    contracts = list((repo_root / "contracts").glob("cowork-v*.json"))
    assert contracts, "no contract files found"
    for path in contracts:
        data = json.loads(path.read_text())
        assert data["spec_version"] == "0", (
            f"{path.name} has spec_version={data['spec_version']!r}; "
            "expected '0'. Bumping spec_version is a major-version event — "
            "see tests/unit/test_schema_lock.py."
        )


def test_jsonschema_id_matches_repo_url(repo_root: Path) -> None:
    schema = json.loads((repo_root / "schemas" / "v0.json").read_text())
    expected = "https://github.com/yaniv-golan/claude-cowork-lint/schemas/v0.json"
    assert schema["$id"] == expected
