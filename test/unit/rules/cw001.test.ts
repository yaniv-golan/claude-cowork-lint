/**
 * CW001 — runtime-gate tool allowlist.
 *
 * Ported from `_legacy/python/tests/unit/rules/test_cw001.py`. Also subsumes
 * `test_registry.py` (the v0.1 registry assertion) since the per-rule and
 * registry checks share the same setup.
 */

import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { ALL_RULES, CW001 } from "../../../src/rules/index.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

describe("ALL_RULES (registry)", () => {
  it("ships exactly the v0.1 rule set", () => {
    const ids = ALL_RULES.map((r) => r.ruleId).sort();
    expect(ids).toEqual([
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
    ]);
    expect(ids).not.toContain("CW007");
  });

  it("every rule has required metadata", () => {
    for (const rule of ALL_RULES) {
      expect(typeof rule.ruleId).toBe("string");
      expect(rule.ruleId.startsWith("CW")).toBe(true);
      expect(typeof rule.summary).toBe("string");
      expect(rule.summary.length).toBeGreaterThan(0);
    }
  });
});

describe("CW001", () => {
  it("clean agent with allowed tools produces no findings", () => {
    const { root, cleanup } = makeRepo({
      "agents/foo.md": "---\ntools: [Read, Write, TodoWrite]\n---\nbody",
    });
    try {
      expect(CW001.check(discover(root), loadDefaultSpec())).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags TaskOutput (drop_set, always-stripped)", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [TaskOutput]\n---\nx",
    });
    try {
      const findings = CW001.check(discover(root), loadDefaultSpec());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW001");
      expect(findings[0]?.path.endsWith("bad.md")).toBe(true);
      expect(findings[0]?.detail ?? "").toContain("always-dropped");
    } finally {
      cleanup();
    }
  });

  it("flags Bash with the host-loop replacement message", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [Bash, Read]\n---\nx",
    });
    try {
      const findings = CW001.check(discover(root), loadDefaultSpec());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW001");
      expect(findings[0]?.suggestion ?? "").toContain("mcp__workspace__bash");
    } finally {
      cleanup();
    }
  });

  it("flags top-level-only tools (Task) when listed for a sub-agent", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [Task]\n---\nx",
    });
    try {
      const findings = CW001.check(discover(root), loadDefaultSpec());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW001");
    } finally {
      cleanup();
    }
  });

  it("MCP tools always pass", () => {
    const { root, cleanup } = makeRepo({
      "agents/foo.md": "---\ntools: [mcp__workspace__bash, Read]\n---\nx",
    });
    try {
      expect(CW001.check(discover(root), loadDefaultSpec())).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("inline same-line suppression silences CW001", () => {
    const body =
      "---\n" +
      "tools:\n" +
      '  - TaskOutput  # cwlint: ignore CW001 reason="legacy agent"\n' +
      "---\n" +
      "x\n";
    const { root, cleanup } = makeRepo({ "agents/foo.md": body });
    try {
      expect(CW001.check(discover(root), loadDefaultSpec())).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("line-above suppression silences CW001", () => {
    const body =
      "---\n" +
      "tools:\n" +
      '  # cwlint: ignore CW001 reason="legacy agent"\n' +
      "  - TaskOutput\n" +
      "---\n" +
      "x\n";
    const { root, cleanup } = makeRepo({ "agents/foo.md": body });
    try {
      expect(CW001.check(discover(root), loadDefaultSpec())).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
