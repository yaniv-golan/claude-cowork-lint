/**
 * Unit tests for the contract differ.
 *
 * Ported line-for-line from `_legacy/python/tests/unit/test_diff.py`.
 */

import { describe, expect, it } from "vitest";

import { diffSpecs, renderMarkdownDiff } from "../../src/diff.js";

describe("diffSpecs", () => {
  it("reports metadata changes", () => {
    const old = {
      claude_app_version: "1.6259.1",
      operon_core_version: "2.1.121",
    };
    const next = {
      claude_app_version: "1.6608.2",
      operon_core_version: "2.1.121",
    };
    const diff = diffSpecs(old, next);
    expect(diff.meta_changed.claude_app_version).toEqual({
      old: "1.6259.1",
      new: "1.6608.2",
    });
    expect(diff.meta_changed.operon_core_version).toBeUndefined();
  });

  it("walks named-set additions and removals", () => {
    const old = {
      subagent_tool_filter: {
        drop_set: { names: ["A", "B", "C"] },
      },
    };
    const next = {
      subagent_tool_filter: {
        drop_set: { names: ["A", "C", "D"] },
      },
    };
    const diff = diffSpecs(old, next);
    expect(diff.sets_changed["subagent_tool_filter.drop_set"]).toEqual({
      added: ["D"],
      removed: ["B"],
    });
  });
});

describe("renderMarkdownDiff", () => {
  it("renders header, metadata, and named-set additions", () => {
    const out = renderMarkdownDiff(
      {
        meta_changed: { claude_app_version: { old: "1.0.0", new: "1.0.1" } },
        sets_changed: { "x.y": { added: ["foo"], removed: [] } },
        other_changed: {},
      },
      "1.0.0",
      "1.0.1",
    );
    expect(out).toContain("# Cowork contract: 1.0.0 → 1.0.1");
    expect(out).toContain("claude_app_version");
    expect(out).toContain("Added");
    expect(out).toContain("`foo`");
  });

  it("emits the no-difference sentinel when everything matches", () => {
    const out = renderMarkdownDiff(
      { meta_changed: {}, sets_changed: {}, other_changed: {} },
      "v",
      "v",
    );
    expect(out).toContain("_No differences detected._");
  });
});
