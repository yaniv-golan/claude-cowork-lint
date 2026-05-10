"""Tests for CW002, CW003, CW004, CW005, CW006, CW008, CW009, CW010, CW011, CW012."""

from __future__ import annotations

import textwrap
from typing import TYPE_CHECKING

from cwlint import load_default_spec
from cwlint.discovery import discover
from cwlint.rules.cw002_no_persistence_path import CW002NoPersistencePath
from cwlint.rules.cw003_bare_env_var import CW003BareEnvVar
from cwlint.rules.cw004_disable_model_invocation import CW004DisableModelInvocation
from cwlint.rules.cw005_missing_user_invocable import CW005MissingUserInvocable
from cwlint.rules.cw006_unknown_tool_name import CW006UnknownToolName
from cwlint.rules.cw008_subagent_bash_heuristic import CW008SubagentBashHeuristic
from cwlint.rules.cw009_mcp_dependency import CW009McpDependency
from cwlint.rules.cw010_user_secret_name import CW010UserSecretName
from cwlint.rules.cw011_plugin_hooks import CW011PluginHooks
from cwlint.rules.cw012_broken_hook_events import CW012BrokenHookEvents

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

MakeRepo = "Callable[[dict[str, str]], Path]"


# ---------- CW002 ----------


def test_cw002_clean_with_write(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [Read, Write]\n---\nx"})
    assert list(CW002NoPersistencePath().check(discover(repo), load_default_spec())) == []


def test_cw002_clean_with_edit(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [Read, Edit]\n---\nx"})
    assert list(CW002NoPersistencePath().check(discover(repo), load_default_spec())) == []


def test_cw002_no_write_or_edit(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [Read, Grep]\n---\nx"})
    findings = list(CW002NoPersistencePath().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW002"


def test_cw002_mcp_workspace_bash_does_not_count(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    """Shell tools aren't a structured persistence path."""
    repo = make_skill_repo({"agents/a.md": "---\ntools: [Read, mcp__workspace__bash]\n---\nx"})
    findings = list(CW002NoPersistencePath().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW002"


# ---------- CW003 ----------


def test_cw003_clean(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {"SKILL.md": "---\nuser-invocable: true\n---\nuse ${CLAUDE_PLUGIN_ROOT}/foo"}
    )
    assert list(CW003BareEnvVar().check(discover(repo), load_default_spec())) == []


def test_cw003_bare_form_flagged(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo(
        {"SKILL.md": "---\nuser-invocable: true\n---\nuse $CLAUDE_PLUGIN_ROOT/foo"}
    )
    findings = list(CW003BareEnvVar().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW003"


def test_cw003_does_not_flag_longer_name(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    """`$CLAUDE_PLUGIN_ROOT_OTHER` should not match `$CLAUDE_PLUGIN_ROOT`."""
    repo = make_skill_repo(
        {"SKILL.md": "---\nuser-invocable: true\n---\nuse $CLAUDE_PLUGIN_ROOT_OTHER/foo"}
    )
    assert list(CW003BareEnvVar().check(discover(repo), load_default_spec())) == []


def test_cw003_suppression(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = (
        "---\n"
        "user-invocable: true\n"
        "---\n"
        '<!-- cwlint: ignore CW003 reason="intentional" -->\n'
        "$CLAUDE_PLUGIN_ROOT/foo\n"
    )
    repo = make_skill_repo({"SKILL.md": body})
    assert list(CW003BareEnvVar().check(discover(repo), load_default_spec())) == []


# ---------- CW004 ----------


def test_cw004_clean(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"SKILL.md": "---\nuser-invocable: true\n---\nbody"})
    assert list(CW004DisableModelInvocation().check(discover(repo), load_default_spec())) == []


def test_cw004_clean_when_set_false(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: false\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    assert list(CW004DisableModelInvocation().check(discover(repo), load_default_spec())) == []


def test_cw004_set_true_flagged(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    findings = list(CW004DisableModelInvocation().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW004"


# ---------- CW005 ----------


def test_cw005_clean(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"SKILL.md": "---\nuser-invocable: true\n---\nbody"})
    assert list(CW005MissingUserInvocable().check(discover(repo), load_default_spec())) == []


def test_cw005_missing_field(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"SKILL.md": "---\nname: foo\n---\nbody"})
    findings = list(CW005MissingUserInvocable().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW005"


def test_cw005_set_false(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = "---\nuser-invocable: false\n---\nbody"
    repo = make_skill_repo({"SKILL.md": body})
    findings = list(CW005MissingUserInvocable().check(discover(repo), load_default_spec()))
    assert len(findings) == 1


# ---------- CW006 ----------


def test_cw006_typo_detection(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = '{"hooks": {"PreToolUse": [{"command": "echo WriteFile here"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    findings = list(CW006UnknownToolName().check(discover(repo), load_default_spec()))
    assert any(f.rule_id == "CW006" and "WriteFile" in f.message for f in findings)


def test_cw006_known_name_passes(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = '{"hooks": {"PreToolUse": [{"command": "echo Write"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    findings = list(CW006UnknownToolName().check(discover(repo), load_default_spec()))
    assert all(f.rule_id != "CW006" for f in findings)


def test_cw006_does_not_flag_random_capwords(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = '{"hooks": {"PreToolUse": [{"command": "echo Docker hello"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    findings = list(CW006UnknownToolName().check(discover(repo), load_default_spec()))
    assert all(f.rule_id != "CW006" for f in findings)


# ---------- CW008 ----------


def test_cw008_clean_no_cue(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = textwrap.dedent("""\
        ---
        user-invocable: true
        ---
        Some prose here.

        ```bash
        ls
        ```
        """)
    repo = make_skill_repo({"SKILL.md": body})
    assert list(CW008SubagentBashHeuristic().check(discover(repo), load_default_spec())) == []


def test_cw008_dispatch_cue_with_bash_flagged(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = textwrap.dedent("""\
        ---
        user-invocable: true
        ---
        Spawn a sub-agent: Task(subagent_type='reviewer')

        ```bash
        ls
        ```
        """)
    repo = make_skill_repo({"SKILL.md": body})
    findings = list(CW008SubagentBashHeuristic().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW008"


def test_cw008_main_thread_comment_silences(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = textwrap.dedent("""\
        ---
        user-invocable: true
        ---
        Spawn: Task(subagent_type='r')

        Note: this main-thread block doesn't dispatch.
        ```bash
        ls
        ```
        """)
    repo = make_skill_repo({"SKILL.md": body})
    findings = list(CW008SubagentBashHeuristic().check(discover(repo), load_default_spec()))
    assert findings == []


def test_cw008_does_not_fire_on_prose_word_background(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    """Plain prose 'background' is too generic — the rule must use structured cues only."""
    body = textwrap.dedent("""\
        ---
        user-invocable: true
        ---
        We run the build in the background and check logs.

        ```bash
        ls
        ```
        """)
    repo = make_skill_repo({"SKILL.md": body})
    assert list(CW008SubagentBashHeuristic().check(discover(repo), load_default_spec())) == []


# ---------- CW009 ----------


def test_cw009_clean_no_mcp(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [Read, Write]\n---\nx"})
    assert list(CW009McpDependency().check(discover(repo), load_default_spec())) == []


def test_cw009_workspace_is_built_in(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [mcp__workspace__bash]\n---\nx"})
    assert list(CW009McpDependency().check(discover(repo), load_default_spec())) == []


def test_cw009_registered_server_passes(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo(
        {
            "agents/a.md": "---\ntools: [mcp__myserver__tool]\n---\nx",
            ".mcp.json": '{"mcpServers": {"myserver": {}}}',
        }
    )
    assert list(CW009McpDependency().check(discover(repo), load_default_spec())) == []


def test_cw009_unregistered_server_flagged(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    repo = make_skill_repo({"agents/a.md": "---\ntools: [mcp__myserver__tool]\n---\nx"})
    findings = list(CW009McpDependency().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW009"


# ---------- CW010 ----------


def test_cw010_clean(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    payload = '{"name":"x","version":"0.1.0","userConfig":{"MY_TOKEN":{"type":"string"}}}'
    repo = make_skill_repo({".claude-plugin/plugin.json": payload})
    assert list(CW010UserSecretName().check(discover(repo), load_default_spec())) == []


def test_cw010_bad_regex(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    payload = '{"name":"x","version":"0.1.0","userConfig":{"1foo":{"type":"string"}}}'
    repo = make_skill_repo({".claude-plugin/plugin.json": payload})
    findings = list(CW010UserSecretName().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW010"


def test_cw010_reserved_name(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    payload = '{"name":"x","version":"0.1.0","userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}'
    repo = make_skill_repo({".claude-plugin/plugin.json": payload})
    findings = list(CW010UserSecretName().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert "reserved" in (findings[0].detail or "").lower()


# ---------- CW011 ----------


def test_cw011_clean_no_hooks(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"SKILL.md": "---\nuser-invocable: true\n---\nx"})
    assert list(CW011PluginHooks().check(discover(repo), load_default_spec())) == []


def test_cw011_flags_hooks_file(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    repo = make_skill_repo({"hooks/hooks.json": '{"hooks": {}}'})
    findings = list(CW011PluginHooks().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW011"


# ---------- CW012 ----------


def test_cw012_clean_with_safe_event(
    make_skill_repo: Callable[[dict[str, str]], Path],
) -> None:
    body = '{"hooks": {"PreToolUse": [{"command": "echo"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    assert list(CW012BrokenHookEvents().check(discover(repo), load_default_spec())) == []


def test_cw012_flags_stop_event(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = '{"hooks": {"Stop": [{"command": "echo"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    findings = list(CW012BrokenHookEvents().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
    assert findings[0].rule_id == "CW012"


def test_cw012_flags_session_start(make_skill_repo: Callable[[dict[str, str]], Path]) -> None:
    body = '{"hooks": {"SessionStart": [{"command": "echo"}]}}'
    repo = make_skill_repo({"hooks/hooks.json": body})
    findings = list(CW012BrokenHookEvents().check(discover(repo), load_default_spec()))
    assert len(findings) == 1
