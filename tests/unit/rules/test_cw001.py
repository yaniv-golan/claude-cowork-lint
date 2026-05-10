"""CW001 — runtime-gate tool allowlist."""

from __future__ import annotations

import textwrap
from typing import TYPE_CHECKING

from cwlint import load_default_spec
from cwlint.discovery import discover
from cwlint.rules.cw001_async_tool_allowlist import CW001AsyncToolAllowlist

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

MakeRepo = "Callable[[dict[str, str]], Path]"


def test_clean_agent_with_allowed_tools(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {
            "agents/foo.md": "---\ntools: [Read, Write, TodoWrite]\n---\nbody",
        }
    )
    findings = list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec()))
    assert findings == []


def test_taskoutput_flagged(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    """TaskOutput is in drop_set — always stripped."""
    repo = make_skill_repo({"agents/bad.md": "---\ntools: [TaskOutput]\n---\nx"})
    findings = list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW001"
    assert findings[0].path.name == "bad.md"
    assert "always-dropped" in (findings[0].detail or "")


def test_bash_flagged_with_host_loop_message(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    """Bash IS in async_dispatch_allowlist (Ys_) but ALSO in host_loop_excluded_builtins."""
    repo = make_skill_repo({"agents/bad.md": "---\ntools: [Bash, Read]\n---\nx"})
    findings = list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW001"
    assert "mcp__workspace__bash" in (findings[0].suggestion or "")


def test_top_level_only_tool_flagged_for_subagent(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    """Task is in host_loop_safe_set but NOT in async_dispatch_allowlist."""
    repo = make_skill_repo({"agents/bad.md": "---\ntools: [Task]\n---\nx"})
    findings = list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW001"


def test_mcp_tools_always_pass(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"agents/foo.md": "---\ntools: [mcp__workspace__bash, Read]\n---\nx"})
    assert list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec())) == []


def test_suppression_inline(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = textwrap.dedent("""\
        ---
        tools:
          - TaskOutput  # cwlint: ignore CW001 reason="legacy agent"
        ---
        x
        """)
    repo = make_skill_repo({"agents/foo.md": body})
    assert list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec())) == []


def test_suppression_line_above(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = textwrap.dedent("""\
        ---
        tools:
          # cwlint: ignore CW001 reason="legacy agent"
          - TaskOutput
        ---
        x
        """)
    repo = make_skill_repo({"agents/foo.md": body})
    assert list(CW001AsyncToolAllowlist().check(discover(repo), load_default_spec())) == []
