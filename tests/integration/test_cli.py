"""End-to-end CLI tests via typer's CliRunner."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from typer.testing import CliRunner

from cwlint.cli import app

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


def test_version_flag() -> None:
    result = CliRunner().invoke(app, ["--version"])
    assert result.exit_code == 0
    assert "claude-cowork-lint" in result.stdout


def test_check_clean_repo_exits_0(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"SKILL.md": "---\nuser-invocable: true\n---\nbody"})
    result = CliRunner().invoke(app, ["check", str(repo)])
    assert result.exit_code == 0
    assert "no findings" in result.stdout.lower() or "✓" in result.stdout


def test_check_strict_with_error_exits_1(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    result = CliRunner().invoke(app, ["check", str(repo), "--strict"])
    assert result.exit_code == 1
    assert "CW004" in result.stdout


def test_check_warn_only_default_exits_0(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo({"SKILL.md": "---\n---\nbody"})
    result = CliRunner().invoke(app, ["check", str(repo)])
    assert result.exit_code == 0
    assert "CW005" in result.stdout


def test_check_format_json(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    result = CliRunner().invoke(app, ["check", str(repo), "--format", "json", "--strict"])
    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert any(f["rule_id"] == "CW004" for f in payload["findings"])
    assert payload["summary"]["error"] == 1


def test_check_format_sarif(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    result = CliRunner().invoke(app, ["check", str(repo), "--format", "sarif"])
    payload = json.loads(result.stdout)
    assert payload["version"] == "2.1.0"
    assert payload["runs"][0]["results"][0]["ruleId"] == "CW004"


def test_check_ignore_skips_rule(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    result = CliRunner().invoke(app, ["check", str(repo), "--ignore", "CW004", "--strict"])
    assert result.exit_code == 0


def test_list_rules() -> None:
    result = CliRunner().invoke(app, ["list-rules"])
    assert result.exit_code == 0
    assert "CW001" in result.stdout
    assert "CW012" in result.stdout
    assert "CW007" not in result.stdout  # deferred to v0.2


def test_spec_info() -> None:
    result = CliRunner().invoke(app, ["spec-info"])
    assert result.exit_code == 0
    assert "1.6259.1" in result.stdout
    assert "2.1.121" in result.stdout
