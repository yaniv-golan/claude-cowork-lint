"""Realistic clean-repo end-to-end test: the kind of repo that should pass with no findings."""

from __future__ import annotations

from typing import TYPE_CHECKING

from cwlint import load_default_spec
from cwlint.engine import check_repo

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


_CLEAN_REPO_FILES = {
    "SKILL.md": (
        "---\nuser-invocable: true\n---\n# Hello\n\nUse ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh.\n"
    ),
    ".claude-plugin/plugin.json": (
        '{"name":"my-plugin","version":"0.1.0","userConfig":{"MY_TOKEN":{"type":"string"}}}'
    ),
    "agents/reviewer.md": ("---\ntools: [Read, Write, Grep, Glob, TodoWrite]\n---\nbody"),
    ".mcp.json": '{"mcpServers": {"workspace": {}}}',
    "commands/foo.md": "---\nallowed-tools: [Read]\n---\nbody",
}


def test_clean_repo_has_no_findings(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(_CLEAN_REPO_FILES)
    report = check_repo(repo, load_default_spec())
    assert report.findings == [], f"unexpected findings: {report.findings}"
    assert report.error_count == 0
    assert report.warn_count == 0
    assert report.info_count == 0
