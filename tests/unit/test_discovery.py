"""Discovery tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint.discovery import discover

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


def test_discover_skill_at_root(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "SKILL.md": "---\nuser-invocable: true\n---\nbody",
        }
    )
    layout = discover(repo)
    assert {p.name for p in layout.skills} == {"SKILL.md"}
    assert layout.plugins == []
    assert layout.agents == []


def test_discover_nested_skill(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "skills/foo/SKILL.md": "---\nuser-invocable: true\n---\nx",
            "skills/bar/SKILL.md": "---\nuser-invocable: true\n---\ny",
        }
    )
    layout = discover(repo)
    assert len(layout.skills) == 2
    assert {p.parent.name for p in layout.skills} == {"foo", "bar"}


def test_discover_plugin_manifest(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            ".claude-plugin/plugin.json": '{"name":"x","version":"0.1.0"}',
            "hooks/hooks.json": '{"hooks": {}}',
        }
    )
    layout = discover(repo)
    assert len(layout.plugins) == 1
    assert layout.plugin_hooks_files
    assert layout.plugin_hooks_files[0].name == "hooks.json"


def test_discover_agent_files(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "agents/reviewer.md": "---\ntools: [Bash, Read]\n---\nx",
            "agents/sub/specialist.md": "---\ntools: [Edit]\n---\ny",
        }
    )
    layout = discover(repo)
    assert len(layout.agents) == 2


def test_discover_ignores_node_modules_and_dist(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(
        {
            "node_modules/junk/SKILL.md": "---\n---\nignored",
            "dist/SKILL.md": "---\n---\nignored",
            "skills/real/SKILL.md": "---\nuser-invocable: true\n---\nreal",
        }
    )
    layout = discover(repo)
    assert len(layout.skills) == 1
    assert layout.skills[0].parent.name == "real"


def test_discover_mcp_config(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            ".mcp.json": '{"mcpServers": {"workspace": {}}}',
        }
    )
    layout = discover(repo)
    assert len(layout.mcp_configs) == 1
    assert layout.mcp_configs[0].name == ".mcp.json"


def test_discover_plugin_commands(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "commands/foo.md": "---\nallowed-tools: [Read]\n---\nbody",
            "commands/sub/bar.md": "---\n---\nbody",
        }
    )
    layout = discover(repo)
    assert len(layout.commands) == 2


def test_discover_settings_local_json(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(
        {
            ".claude/settings.json": "{}",
            ".claude/settings.local.json": "{}",
        }
    )
    layout = discover(repo)
    assert len(layout.settings_files) == 2
