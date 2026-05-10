/**
 * Tests for CW008 — sub-agent dispatch cue followed by a fenced bash block.
 *
 * Extracted from `other.test.ts` so the dedup-per-fence behaviour has a
 * dedicated home alongside the baseline heuristic cases.
 */

import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { CW008 } from "../../../src/rules/index.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();

describe("CW008", () => {
  it("clean — bash fence with no dispatch cue", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "Some prose here.",
      "",
      "```bash",
      "ls",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW008.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags dispatch cue + bash fence", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "Spawn a sub-agent: Task(subagent_type='reviewer')",
      "",
      "```bash",
      "ls",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW008.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW008");
    } finally {
      cleanup();
    }
  });

  it("main-thread comment silences CW008", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "Spawn: Task(subagent_type='r')",
      "",
      "Note: this main-thread block doesn't dispatch.",
      "```bash",
      "ls",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW008.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("does not fire on the prose word 'background'", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "We run the build in the background and check logs.",
      "",
      "```bash",
      "ls",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW008.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe("CW008 dedup", () => {
  it("emits one finding per fence even when multiple cues match", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "Spawn: Task(subagent_type='r')", // cue 1, line 4
      "Then dispatch via /bg foo", // cue 2, line 5
      "Also spawn_subagent later", // cue 3, line 6
      "",
      "```bash",
      "ls",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW008.check(discover(root), spec);
      // All three cues precede the same fence — we want ONE finding.
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW008");
      // Fence sits at line 8 (1-indexed) in the body above.
      expect(findings[0]?.line).toBe(8);
    } finally {
      cleanup();
    }
  });

  it("emits one finding per fence when there are multiple fences", () => {
    const body = [
      "---",
      "user-invocable: true",
      "---",
      "Spawn: Task(subagent_type='r')", // cue 1, line 4
      "Then dispatch via /bg foo", // cue 2, line 5
      "",
      "```bash",
      "ls",
      "```",
      "",
      "More prose then another dispatch: /fork worker",
      "",
      "```bash",
      "pwd",
      "```",
      "",
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW008.check(discover(root), spec);
      // Two distinct fences → two findings.
      expect(findings).toHaveLength(2);
      const lines = findings.map((f) => f.line).sort((a, b) => a - b);
      expect(lines).toEqual([7, 13]);
    } finally {
      cleanup();
    }
  });
});
