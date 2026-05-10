"""Locate skill, plugin, agent, hook, MCP, and command files in a target repo."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

_SKIP_DIRS = frozenset(
    {
        ".git",
        ".venv",
        "node_modules",
        "dist",
        "build",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        ".mypy_cache",
        ".tox",
        ".nox",
    }
)


@dataclass(frozen=True)
class RepoLayout:
    root: Path
    skills: list[Path] = field(default_factory=list)
    plugins: list[Path] = field(default_factory=list)
    plugin_hooks_files: list[Path] = field(default_factory=list)
    agents: list[Path] = field(default_factory=list)
    settings_files: list[Path] = field(default_factory=list)
    mcp_configs: list[Path] = field(default_factory=list)
    commands: list[Path] = field(default_factory=list)


def discover(root: Path) -> RepoLayout:
    """Walk `root`, returning a `RepoLayout`. Read-only; no side effects."""
    skills: list[Path] = []
    plugins: list[Path] = []
    plugin_hooks: list[Path] = []
    agents: list[Path] = []
    settings: list[Path] = []
    mcp_configs: list[Path] = []
    commands: list[Path] = []

    for path in _iter_files(root):
        rel = path.relative_to(root)
        name = path.name
        parts = set(rel.parts[:-1])
        if name == "SKILL.md":
            skills.append(path)
        elif name == "plugin.json" and ".claude-plugin" in parts:
            plugins.append(path)
        elif name == "hooks.json" and "hooks" in parts:
            plugin_hooks.append(path)
        elif name in {"settings.json", "settings.local.json"} and ".claude" in parts:
            settings.append(path)
        elif name == ".mcp.json":
            mcp_configs.append(path)
        elif "commands" in parts and name.endswith(".md"):
            commands.append(path)
        elif "agents" in parts and name.endswith(".md"):
            agents.append(path)

    return RepoLayout(
        root=root,
        skills=sorted(skills),
        plugins=sorted(plugins),
        plugin_hooks_files=sorted(plugin_hooks),
        agents=sorted(agents),
        settings_files=sorted(settings),
        mcp_configs=sorted(mcp_configs),
        commands=sorted(commands),
    )


def _iter_files(root: Path) -> Iterator[Path]:
    for entry in root.iterdir():
        if entry.is_dir():
            if entry.name in _SKIP_DIRS:
                continue
            yield from _iter_files(entry)
        elif entry.is_file():
            yield entry
