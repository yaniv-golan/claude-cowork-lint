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

  it("scans past a suppressed fence to a later qualifying fence in the same cue window", () => {
    // Cue at line 4. Cue's 30-line window covers fences at line 8 (F1,
    // suppressed via main-thread note above) and line 20 (F2, clean).
    // Expected: exactly 1 finding, on F2 at line 20.
    const body = [
      "---", // 1
      "user-invocable: true", // 2
      "---", // 3
      "Spawn: Task(subagent_type='r')", // 4 — cue
      "", // 5
      "This is a main-thread helper, not a dispatch.", // 6
      "", // 7
      "```bash", // 8 — F1 (suppressed by main-thread on line 6)
      "ls", // 9
      "```", // 10
      "", // 11
      "More prose with no dispatch words at all.", // 12
      "Plain narrative continues here.", // 13
      "Still narrative.", // 14
      "More narrative.", // 15
      "Yet more narrative.", // 16
      "Narrative continues.", // 17
      "Almost at the second fence.", // 18
      "", // 19
      "```bash", // 20 — F2 (clean)
      "pwd", // 21
      "```", // 22
      "", // 23
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW008.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW008");
      expect(findings[0]?.line).toBe(20);
    } finally {
      cleanup();
    }
  });

  it("a cue still emits on F2 when F1 in its window was already reported by an earlier cue", () => {
    // Cue A at line 2 emits on F1 at line 6.
    // Cue B at line 4 has F1 (already reported) AND F2 at line 18 in its
    // window. B should skip F1 (dedup) but still emit on F2.
    const body = [
      "user-invocable: true", // 1
      "Spawn: Task(subagent_type='a')", // 2 — cue A
      "", // 3
      "Then dispatch via /bg foo", // 4 — cue B
      "", // 5
      "```bash", // 6 — F1
      "ls", // 7
      "```", // 8
      "", // 9
      "Plain narrative.", // 10
      "More prose.", // 11
      "Continues.", // 12
      "Continues.", // 13
      "Continues.", // 14
      "Continues.", // 15
      "Continues.", // 16
      "", // 17
      "```bash", // 18 — F2
      "pwd", // 19
      "```", // 20
      "", // 21
    ].join("\n");
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW008.check(discover(root), spec);
      // A → F1, B → F2 (B skips F1 via reportedFences dedup but continues).
      expect(findings).toHaveLength(2);
      const lines = findings.map((f) => f.line).sort((a, b) => a - b);
      expect(lines).toEqual([6, 18]);
    } finally {
      cleanup();
    }
  });
});
