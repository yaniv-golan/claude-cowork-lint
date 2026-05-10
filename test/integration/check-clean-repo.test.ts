/**
 * End-to-end test for a realistic clean repo — ported from
 * `_legacy/python/tests/integration/test_check_clean_repo.py`.
 */

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { summarise } from "../../src/findings.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

const CLEAN_REPO_FILES: Record<string, string> = {
  "SKILL.md":
    "---\nuser-invocable: true\n---\n# Hello\n\nUse ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh.\n",
  ".claude-plugin/plugin.json":
    '{"name":"my-plugin","version":"0.1.0","userConfig":{"MY_TOKEN":{"type":"string"}}}',
  "agents/reviewer.md": "---\ntools: [Read, Write, Grep, Glob, TodoWrite]\n---\nbody",
  ".mcp.json": '{"mcpServers": {"workspace": {}}}',
  "commands/foo.md": "---\nallowed-tools: [Read]\n---\nbody",
};

describe("clean repo", () => {
  it("produces no findings", () => {
    const { root, cleanup } = makeRepo(CLEAN_REPO_FILES);
    try {
      const report = checkRepo(root, loadDefaultSpec());
      expect(report.findings, `unexpected findings: ${JSON.stringify(report.findings)}`).toEqual(
        [],
      );
      const s = summarise(report);
      expect(s.error).toBe(0);
      expect(s.warn).toBe(0);
      expect(s.info).toBe(0);
    } finally {
      cleanup();
    }
  });
});
