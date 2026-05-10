"""Integration test: each Anthropic issue cited in `docs/internal/SPEC.md` has a
fixture that triggers the corresponding CW rule.

This is the v1.0 deliverable from the project ROADMAP. When the spec evolves to
cover a new Anthropic issue, add the issue + a corresponding fixture here so we
have living evidence that the rule fires on the documented failure mode.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from cwlint import load_default_spec
from cwlint.engine import check_repo

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path


# Each tuple: (issue_url, expected_rule_id, fixture_files).
# When `fixture_files` is run through `make_skill_repo`, the engine must
# produce at least one finding with `rule_id == expected_rule_id`.
ANTHROPIC_ISSUES: list[tuple[str, str, dict[str, str]]] = [
    (
        # SPEC §cli_launch_args_in_cowork.consequences.plugin_hooks_excluded
        "https://github.com/anthropics/claude-code/issues/16288",
        "CW011",
        {"hooks/hooks.json": '{"hooks": {"PreToolUse": [{"command": "echo"}]}}'},
    ),
    (
        # SPEC §cli_launch_args_in_cowork.consequences.plugin_hooks_excluded —
        # closed-as-duplicate of #16288 but more specific to Cowork.
        "https://github.com/anthropics/claude-code/issues/27398",
        "CW011",
        {"hooks/hooks.json": '{"hooks": {"Stop": [{"command": "echo"}]}}'},
    ),
    (
        # CW012 — same set of issues; stronger signal for known-broken events.
        "https://github.com/anthropics/claude-code/issues/27398#cw012",
        "CW012",
        {"hooks/hooks.json": '{"hooks": {"SessionStart": [{"command": "echo"}]}}'},
    ),
    (
        # SPEC §subagent_tool_filter.discrepancy_resolution: empirical
        # observation that Bash isn't in a Cowork sub-agent's tool list.
        "spec://subagent_tool_filter.discrepancy_resolution",
        "CW001",
        {"agents/bad.md": "---\ntools: [Bash, Read]\n---\nbody"},
    ),
    (
        # SPEC §skill_frontmatter_invariants.forbidden_fields[0]: founder-skills v0.4.0 incident.
        "spec://skill_frontmatter_invariants.forbidden_fields[0]",
        "CW004",
        {"SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"},
    ),
]


@pytest.mark.parametrize(("issue", "rule_id", "files"), ANTHROPIC_ISSUES)
def test_issue_triggers_rule(
    issue: str,
    rule_id: str,
    files: dict[str, str],
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(files)
    report = check_repo(repo, load_default_spec())
    fired = {f.rule_id for f in report.findings}
    assert rule_id in fired, (
        f"issue {issue!r} expected {rule_id!r} to fire, but it did not. "
        f"Fired rules: {sorted(fired)}"
    )
