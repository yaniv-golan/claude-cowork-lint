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
import { loadDefaultSpec, loadSpec } from "../../../src/spec.js";
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

  it("flags WebFetch with the snake_case mcp__workspace__web_fetch replacement", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [WebFetch, Read]\n---\nx",
    });
    try {
      const findings = CW001.check(discover(root), loadDefaultSpec());
      expect(findings).toHaveLength(1);
      const f = findings[0];
      expect(f?.suggestion ?? "").toContain("mcp__workspace__web_fetch");
      // Guard against a regression to lowercased camelCase (the pre-B6 bug
      // would have produced `mcp__workspace__webfetch`).
      expect(f?.suggestion ?? "").not.toContain("mcp__workspace__webfetch");
    } finally {
      cleanup();
    }
  });

  it.each([
    ["NotebookEdit"],
    ["REPL"],
    ["JavaScript"],
  ])("flags %s with the 'no Cowork equivalent — remove' message (no fictional mcp__workspace__* suggestion)", (toolName) => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": `---\ntools: [${toolName}, Read]\n---\nx`,
    });
    try {
      const findings = CW001.check(discover(root), loadDefaultSpec());
      expect(findings).toHaveLength(1);
      const f = findings[0];
      const lowered = toolName.toLowerCase();
      // The pre-B6 logic emitted no suggestion (mcp_replacements lookup
      // returned undefined), then fell through to a generic "Remove" line.
      // The fictional `mcp__workspace__<lowered>` was never emitted by the
      // current rule, but the message also failed to explain *why*. Now
      // the rule must explicitly say "no Cowork equivalent".
      expect(f?.detail ?? "").toMatch(/no Cowork equivalent/i);
      // Suggestion should clearly tell the user to remove and explain
      // there's no equivalent — wording deliberately flexible.
      expect(f?.suggestion ?? "").toMatch(/remove/i);
      expect(f?.suggestion ?? "").toMatch(/no equivalent|no Cowork equivalent/i);
      // Anti-regression: must NOT invent a non-existent MCP tool.
      expect(f?.suggestion ?? "").not.toContain(`mcp__workspace__${lowered}`);
      expect(f?.detail ?? "").not.toContain(`mcp__workspace__${lowered}`);
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

describe("CW001 — legacy cowork-v2.1.121.json contract", () => {
  it("flags Bash with replacement suggestion", () => {
    const legacySpec = loadSpec("contracts/cowork-v2.1.121.json");
    const { root, cleanup } = makeRepo({
      "agents/x.md": "---\ntools: [Bash]\n---\nbody",
    });
    try {
      const findings = CW001.check(discover(root), legacySpec);
      const cw001 = findings.filter((f) => f.ruleId === "CW001");
      expect(cw001).toHaveLength(1);
      expect(cw001[0]?.suggestion ?? "").toContain("mcp__workspace__bash");
    } finally {
      cleanup();
    }
  });

  it("flags NotebookEdit with 'no Cowork equivalent' on legacy contract via fallback", () => {
    const legacySpec = loadSpec("contracts/cowork-v2.1.121.json");
    const { root, cleanup } = makeRepo({
      "agents/x.md": "---\ntools: [NotebookEdit]\n---\nbody",
    });
    try {
      const findings = CW001.check(discover(root), legacySpec);
      const cw001 = findings.filter((f) => f.ruleId === "CW001");
      expect(cw001).toHaveLength(1);
      expect(cw001[0]?.detail ?? "").toMatch(/no Cowork equivalent|no equivalent/i);
    } finally {
      cleanup();
    }
  });
});
