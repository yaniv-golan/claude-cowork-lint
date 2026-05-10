"""Tests for the contract differ."""

from __future__ import annotations

from cwlint.diff import diff_specs, render_markdown_diff


def test_meta_change() -> None:
    old = {"claude_app_version": "1.6259.1", "operon_core_version": "2.1.121"}
    new = {"claude_app_version": "1.6608.2", "operon_core_version": "2.1.121"}
    diff = diff_specs(old, new)
    assert diff["meta_changed"]["claude_app_version"] == {
        "old": "1.6259.1",
        "new": "1.6608.2",
    }
    assert "operon_core_version" not in diff["meta_changed"]


def test_named_set_addition_and_removal() -> None:
    old = {
        "subagent_tool_filter": {
            "drop_set": {"names": ["A", "B", "C"]},
        },
    }
    new = {
        "subagent_tool_filter": {
            "drop_set": {"names": ["A", "C", "D"]},
        },
    }
    diff = diff_specs(old, new)
    sets = diff["sets_changed"]
    key = "subagent_tool_filter.drop_set"
    assert sets[key] == {"added": ["D"], "removed": ["B"]}


def test_render_markdown_diff_smoke() -> None:
    diff = {
        "meta_changed": {"claude_app_version": {"old": "1.0.0", "new": "1.0.1"}},
        "sets_changed": {"x.y": {"added": ["foo"], "removed": []}},
        "other_changed": {},
    }
    out = render_markdown_diff(diff, "1.0.0", "1.0.1")
    assert "# Cowork contract: 1.0.0 → 1.0.1" in out
    assert "claude_app_version" in out
    assert "Added" in out
    assert "`foo`" in out


def test_no_changes_renders_empty_message() -> None:
    out = render_markdown_diff(
        {"meta_changed": {}, "sets_changed": {}, "other_changed": {}}, "v", "v"
    )
    assert "_No differences detected._" in out
