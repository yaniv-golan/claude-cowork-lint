/**
 * Each Anthropic issue cited in `docs/SPEC.md` has a fixture that triggers
 * the corresponding CW rule. Adding a new issue + fixture here is part of
 * evolving the spec — the suite proves every cited upstream issue actually
 * trips its rule.
 */

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

interface IssueCase {
  issue: string;
  ruleId: string;
  files: Record<string, string>;
}

const ISSUES: IssueCase[] = [
  {
    issue: "https://github.com/anthropics/claude-code/issues/16288",
    ruleId: "CW011",
    files: { "hooks/hooks.json": '{"hooks": {"PreToolUse": [{"command": "echo"}]}}' },
  },
  {
    issue: "https://github.com/anthropics/claude-code/issues/27398",
    ruleId: "CW011",
    files: { "hooks/hooks.json": '{"hooks": {"Stop": [{"command": "echo"}]}}' },
  },
  {
    issue: "https://github.com/anthropics/claude-code/issues/27398#cw012",
    ruleId: "CW012",
    files: { "hooks/hooks.json": '{"hooks": {"SessionStart": [{"command": "echo"}]}}' },
  },
  {
    issue: "spec://subagent_tool_filter.discrepancy_resolution",
    ruleId: "CW001",
    files: { "agents/bad.md": "---\ntools: [Bash, Read]\n---\nbody" },
  },
  {
    issue: "spec://skill_frontmatter_invariants.forbidden_fields[0]",
    ruleId: "CW004",
    files: { "SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody" },
  },
];

describe.each(ISSUES)("anthropic issue $issue", ({ issue, ruleId, files }) => {
  it(`triggers ${ruleId}`, () => {
    const { root, cleanup } = makeRepo(files);
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const fired = new Set(report.findings.map((f) => f.ruleId));
      expect(
        fired.has(ruleId),
        `issue ${issue} expected ${ruleId} to fire; fired: ${[...fired].sort().join(",")}`,
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
