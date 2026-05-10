"""The v0 JSON Schema must validate the vendored spec."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path


def test_schema_validates_v2_1_121(repo_root: Path) -> None:
    import jsonschema

    schema = json.loads((repo_root / "schemas" / "v0.json").read_text())
    spec = json.loads((repo_root / "contracts" / "cowork-v2.1.121.json").read_text())
    jsonschema.validate(instance=spec, schema=schema)
