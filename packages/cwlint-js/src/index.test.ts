/**
 * End-to-end tests using Node's built-in test runner.
 * Run via `npm test` from `packages/cwlint-js/`.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_RULES,
  checkRepo,
  loadDefaultSpec,
  parseSuppressions,
  isSuppressed,
} from "./index.js";

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
    assert.deepEqual(ids, [
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
    assert(!ids.includes("CW007"), "CW007 is reserved/deferred");
  });
});

describe("loadDefaultSpec", () => {
  it("loads v2.1.121 contract", () => {
    const spec = loadDefaultSpec();
    assert.equal(spec.spec_version, "0");
    assert.equal(spec.claude_app_version, "1.6259.1");
    assert(spec.subagent_tool_filter.async_dispatch_allowlist.names.includes("Bash"));
  });
});

describe("parseSuppressions", () => {
  it("parses html-comment marker", () => {
    const sups = parseSuppressions([
      "<!-- cwlint: ignore CW001 reason=\"legacy\" -->",
    ]);
    assert.equal(sups.length, 1);
    assert.deepEqual(sups[0]?.ruleIds, ["CW001"]);
  });
  it("respects same-line suppression", () => {
    const sups = parseSuppressions(["foo  # cwlint: ignore CW001 reason=\"x\""]);
    assert(isSuppressed(sups, "CW001", 1));
  });
  it("respects line-above suppression", () => {
    const sups = parseSuppressions([
      "# cwlint: ignore CW001 reason=\"x\"",
      "TaskOutput",
    ]);
    assert(isSuppressed(sups, "CW001", 2));
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
      assert.deepEqual(report.findings, []);
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
      assert.equal(cw004.length, 1);
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
      assert.equal(cw001.length, 1);
      assert(cw001[0]?.suggestion?.includes("mcp__workspace__bash"));
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
      assert(report.findings.some((f) => f.ruleId === "CW002"));
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
      assert(report.findings.some((f) => f.ruleId === "CW011"));
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
      assert(!report.findings.some((f) => f.ruleId === "CW004"));
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
      assert.deepEqual(missing, [], `missing: ${missing.join(",")} fired: ${[...fired].sort().join(",")}`);
    } finally {
      cleanup();
    }
  });
});
