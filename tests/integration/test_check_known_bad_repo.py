"""End-to-end test: a deliberately bad repo that triggers every CW rule we ship."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint import load_default_spec
from cwlint.engine import check_repo

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

_BAD_REPO_FILES = {
    # CW003 ($CLAUDE_PLUGIN_ROOT bare), CW004 (disable-model-invocation: true), CW005 absent
    "SKILL.md": (
        "---\n"
        "disable-model-invocation: true\n"
        "---\n"
        "Reference: $CLAUDE_PLUGIN_ROOT/foo\n"
    ),
    # CW010 (reserved-name userConfig)
    ".claude-plugin/plugin.json": (
        '{"name":"x","version":"0.1.0",'
        '"userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}'
    ),
    # CW011 (plugin hooks file present), CW012 (Stop event), CW006 (typo: WriteFile)
    "hooks/hooks.json": (
        '{"hooks": {"Stop": [{"command": "echo WriteFile here"}]}}'
    ),
    # CW001 (TaskOutput is in drop_set), CW001 (Bash → host_loop_excluded_builtins),
    # CW002 (no Write/Edit), CW009 (mcp__unknown__tool)
    "agents/bad.md": (
        "---\ntools: [TaskOutput, Bash, mcp__unknown__tool]\n---\nbody"
    ),
    # CW008 (sub-agent dispatch + bash fence)
    "skills/dispatch/SKILL.md": (
        "---\n"
        "user-invocable: true\n"
        "---\n"
        "Spawn: Task(subagent_type='r')\n"
        "\n"
        "```bash\n"
        "ls\n"
        "```\n"
    ),
}


def test_every_rule_fires_at_least_once(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(_BAD_REPO_FILES)
    report = check_repo(repo, load_default_spec())
    fired = {f.rule_id for f in report.findings}
    expected = {
        "CW001",
        "CW002",
        "CW003",
        "CW004",
        "CW005",
        "CW006",
        "CW008",
        "CW009",
        "CW010",
        "CW011",
        "CW012",
    }
    missing = expected - fired
    assert not missing, f"rules that did NOT fire: {sorted(missing)}; all fired: {sorted(fired)}"


def test_strict_mode_exits_1(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(_BAD_REPO_FILES)
    report = check_repo(repo, load_default_spec())
    assert report.exit_code(strict=True) == 1
    assert report.error_count >= 1
