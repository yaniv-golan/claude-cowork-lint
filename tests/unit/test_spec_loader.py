"""load_spec() returns a typed model with the expected accessors."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from cwlint.spec import Spec, load_default_spec, load_spec

if TYPE_CHECKING:
    from pathlib import Path


def test_load_spec_v2_1_121(repo_root: Path) -> None:
    spec = load_spec(repo_root / "contracts" / "cowork-v2.1.121.json")
    assert isinstance(spec, Spec)
    assert spec.spec_version == "0"
    assert spec.claude_app_version == "1.6259.1"
    assert spec.operon_core_version == "2.1.121"


def test_load_default_spec_resolves_latest() -> None:
    spec = load_default_spec()
    assert spec.claude_app_version == "1.6259.1"


def test_async_dispatch_allowlist_contains_bash() -> None:
    spec = load_default_spec()
    assert "Bash" in spec.subagent_tool_filter.async_dispatch_allowlist.names


def test_drop_set_contains_askuserquestion() -> None:
    spec = load_default_spec()
    assert "AskUserQuestion" in spec.subagent_tool_filter.drop_set.names


def test_kernel_env_allowlist_contains_path() -> None:
    spec = load_default_spec()
    assert "PATH" in spec.kernel_env_passthrough.allowlist
    assert "HOME" in spec.kernel_env_passthrough.deleted_after_filter


def test_host_loop_excluded_builtins_includes_bash() -> None:
    spec = load_default_spec()
    excluded = spec.host_loop_tool_substitution.host_loop_excluded_builtins
    assert "Bash" in excluded.names
    assert excluded.mcp_replacements["Bash"] == "mcp__workspace__bash"


def test_load_spec_rejects_wrong_schema_version(tmp_path: Path, repo_root: Path) -> None:
    """A spec with all required fields present but spec_version != '0' must be rejected
    by the field validator (not by missing-field errors — that would pass for the wrong reason)."""
    from pydantic import ValidationError

    canonical = json.loads((repo_root / "contracts" / "cowork-v2.1.121.json").read_text())
    canonical["spec_version"] = "1"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(canonical))

    with pytest.raises(ValidationError) as exc_info:
        load_spec(bad)
    assert "Unsupported spec_version" in str(exc_info.value)
