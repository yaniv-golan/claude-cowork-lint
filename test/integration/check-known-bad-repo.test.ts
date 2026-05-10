/**
 * End-to-end test: a deliberately bad repo that triggers every rule we ship.
 * Ported from `_legacy/python/tests/integration/test_check_known_bad_repo.py`.
 */

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { exitCode, summarise } from "../../src/findings.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

const BAD_REPO_FILES: Record<string, string> = {
  // CW003 ($CLAUDE_PLUGIN_ROOT bare), CW004 (disable-model-invocation: true), CW005 absent
  "SKILL.md": "---\ndisable-model-invocation: true\n---\nReference: $CLAUDE_PLUGIN_ROOT/foo\n",
  // CW010 (reserved-name userConfig)
  ".claude-plugin/plugin.json":
    '{"name":"x","version":"0.1.0","userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}',
  // CW011 (plugin hooks file present), CW012 (Stop event), CW006 (typo: WriteFile)
  "hooks/hooks.json": '{"hooks": {"Stop": [{"command": "echo WriteFile here"}]}}',
  // CW001 (TaskOutput drop_set + Bash host_loop_excluded), CW002 (no Write/Edit), CW009 (mcp__unknown)
  "agents/bad.md": "---\ntools: [TaskOutput, Bash, mcp__unknown__tool]\n---\nbody",
  // CW008 (sub-agent dispatch + bash fence)
  "skills/dispatch/SKILL.md":
    "---\nuser-invocable: true\n---\nSpawn: Task(subagent_type='r')\n\n```bash\nls\n```\n",
};

const EXPECTED = new Set([
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

describe("known-bad repo", () => {
  it("every rule fires at least once", () => {
    const { root, cleanup } = makeRepo(BAD_REPO_FILES);
    try {
      const report = checkRepo(root, loadDefaultSpec());
      const fired = new Set(report.findings.map((f) => f.ruleId));
      const missing = [...EXPECTED].filter((r) => !fired.has(r)).sort();
      expect(
        missing,
        `rules that did NOT fire: ${missing.join(",")}; all fired: ${[...fired].sort().join(",")}`,
      ).toEqual([]);
      // Sanity: the set of fired rules covers the 11-rule expected set.
      expect(new Set([...fired].filter((r) => EXPECTED.has(r)))).toEqual(EXPECTED);
    } finally {
      cleanup();
    }
  });

  it("strict mode exits 1 with at least one error-level finding", () => {
    const { root, cleanup } = makeRepo(BAD_REPO_FILES);
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(exitCode(report, { strict: true })).toBe(1);
      expect(summarise(report).error).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});
