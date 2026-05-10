"""Engine tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint import load_default_spec
from cwlint.engine import check_repo

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


def test_clean_repo(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "SKILL.md": "---\nuser-invocable: true\n---\nbody",
            "agents/foo.md": "---\ntools: [Read, Write, TodoWrite]\n---\nbody",
        }
    )
    report = check_repo(repo, load_default_spec())
    assert report.findings == []
    assert report.error_count == 0


def test_engine_picks_up_cw004(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {"SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"}
    )
    report = check_repo(repo, load_default_spec())
    cw004 = [f for f in report.findings if f.rule_id == "CW004"]
    assert len(cw004) == 1


def test_ignore_skips_rule(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {"SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"}
    )
    report = check_repo(repo, load_default_spec(), ignore=["CW004"])
    assert all(f.rule_id != "CW004" for f in report.findings)


def test_findings_sorted(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "SKILL.md": "---\n---\n$CLAUDE_PLUGIN_ROOT/foo",
            "agents/a.md": "---\ntools: [Read, Grep]\n---\nx",
        }
    )
    report = check_repo(repo, load_default_spec())
    rule_ids = [f.rule_id for f in report.findings]
    assert rule_ids == sorted(rule_ids)
