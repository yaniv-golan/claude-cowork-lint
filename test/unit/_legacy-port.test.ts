/**
 * End-to-end tests ported from Node's built-in test runner to vitest.
 * Kept as a sanity test until Task E1 supersedes it; renamed so it isn't
 * auto-picked-up as the canonical smoke test.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it, expect } from "vitest";

import {
  ALL_RULES,
  checkRepo,
  loadDefaultSpec,
  parseSuppressions,
  isSuppressed,
} from "../../src/index.js";

function makeRepo(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "cwlint-js-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(full.split(sep).slice(0, -1).join(sep), { recursive: true });
    writeFileSync(full, content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("ALL_RULES", () => {
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
    expect(!ids.includes("CW007"), "CW007 is reserved/deferred").toBeTruthy();
  });
});

describe("loadDefaultSpec", () => {
  it("loads v2.1.121 contract", () => {
    const spec = loadDefaultSpec();
    expect(spec.spec_version).toBe("0");
    expect(spec.claude_app_version).toBe("1.6259.1");
    expect(spec.subagent_tool_filter.async_dispatch_allowlist.names.includes("Bash")).toBeTruthy();
  });
});

describe("parseSuppressions", () => {
  it("parses html-comment marker", () => {
    const sups = parseSuppressions([
      "<!-- cwlint: ignore CW001 reason=\"legacy\" -->",
    ]);
    expect(sups.length).toBe(1);
    expect(sups[0]?.ruleIds).toEqual(["CW001"]);
  });
  it("respects same-line suppression", () => {
    const sups = parseSuppressions(["foo  # cwlint: ignore CW001 reason=\"x\""]);
    expect(isSuppressed(sups, "CW001", 1)).toBeTruthy();
  });
  it("respects line-above suppression", () => {
    const sups = parseSuppressions([
      "# cwlint: ignore CW001 reason=\"x\"",
      "TaskOutput",
    ]);
    expect(isSuppressed(sups, "CW001", 2)).toBeTruthy();
  });
});

describe("checkRepo", () => {
  it("returns no findings for a clean repo", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nbody",
      "agents/foo.md": "---\ntools: [Read, Write, TodoWrite]\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(report.findings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags CW004 (disable-model-invocation: true)", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md":
        "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const cw004 = report.findings.filter((f) => f.ruleId === "CW004");
      expect(cw004.length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("flags CW001 for Bash (host-loop excluded)", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [Bash, Read]\n---\nx",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const cw001 = report.findings.filter((f) => f.ruleId === "CW001");
      expect(cw001.length).toBe(1);
      expect(cw001[0]?.suggestion?.includes("mcp__workspace__bash")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("flags CW002 when neither Write nor Edit is present", () => {
    const { root, cleanup } = makeRepo({
      "agents/bad.md": "---\ntools: [Read, Grep]\n---\nx",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(report.findings.some((f) => f.ruleId === "CW002")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("flags CW011 for plugin hooks file", () => {
    const { root, cleanup } = makeRepo({
      "hooks/hooks.json": '{"hooks": {}}',
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(report.findings.some((f) => f.ruleId === "CW011")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("--ignore skips a rule", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md":
        "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec(), { ignore: ["CW004"] });
      expect(!report.findings.some((f) => f.ruleId === "CW004")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("triggers every rule on a known-bad fixture", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md":
        "---\ndisable-model-invocation: true\n---\nUse $CLAUDE_PLUGIN_ROOT/foo\n",
      ".claude-plugin/plugin.json":
        '{"name":"x","version":"0.1.0","userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}',
      "hooks/hooks.json": '{"hooks": {"Stop": [{"command": "echo WriteFile here"}]}}',
      "agents/bad.md": "---\ntools: [TaskOutput, Bash, mcp__unknown__tool]\n---\nbody",
      "skills/dispatch/SKILL.md":
        "---\nuser-invocable: true\n---\nSpawn: Task(subagent_type='r')\n\n```bash\nls\n```\n",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const fired = new Set(report.findings.map((f) => f.ruleId));
      const expected = [
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
      ];
      const missing = expected.filter((r) => !fired.has(r));
      expect(missing, `missing: ${missing.join(",")} fired: ${[...fired].sort().join(",")}`).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
