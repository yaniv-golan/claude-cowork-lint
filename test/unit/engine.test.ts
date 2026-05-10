/**
 * Engine tests — ported from `_legacy/python/tests/unit/test_engine.py`.
 */

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { summarise } from "../../src/findings.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

describe("checkRepo", () => {
  it("returns no findings on a clean repo", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nbody",
      "agents/foo.md": "---\ntools: [Read, Write, TodoWrite]\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(report.findings).toEqual([]);
      expect(summarise(report).error).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("picks up CW004 when disable-model-invocation is true", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const cw004 = report.findings.filter((f) => f.ruleId === "CW004");
      expect(cw004).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("ignore option skips a rule", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec(), { ignore: ["CW004"] });
      expect(report.findings.every((f) => f.ruleId !== "CW004")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("findings are sorted by ruleId", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\n---\n$CLAUDE_PLUGIN_ROOT/foo",
      "agents/a.md": "---\ntools: [Read, Grep]\n---\nx",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const ruleIds = report.findings.map((f) => f.ruleId);
      const sorted = [...ruleIds].sort();
      expect(ruleIds).toEqual(sorted);
    } finally {
      cleanup();
    }
  });
});
