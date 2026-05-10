/**
 * Tests for CW009 — agent declares an MCP tool whose server isn't registered.
 *
 * Extracted from `other.test.ts` in Task B5 alongside the contract-driven
 * refresh of the Cowork built-in MCP server list (3 -> 9 names). The B5 case
 * (`mcp__skills__list`) is the regression guard: it would have fired under
 * the old 3-name hardcoded allowlist.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { CW009 } from "../../../src/rules/index.js";
import { loadDefaultSpec, loadSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();
const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("CW009", () => {
  it("clean — no MCP tools at all", () => {
    const { root, cleanup } = makeRepo({ "agents/a.md": "---\ntools: [Read, Write]\n---\nx" });
    try {
      expect(CW009.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("workspace MCP server is built-in (no .mcp.json needed)", () => {
    const { root, cleanup } = makeRepo({
      "agents/a.md": "---\ntools: [mcp__workspace__bash]\n---\nx",
    });
    try {
      expect(CW009.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("registered server in .mcp.json passes", () => {
    const { root, cleanup } = makeRepo({
      "agents/a.md": "---\ntools: [mcp__myserver__tool]\n---\nx",
      ".mcp.json": '{"mcpServers": {"myserver": {}}}',
    });
    try {
      expect(CW009.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("unregistered server is flagged", () => {
    const { root, cleanup } = makeRepo({
      "agents/a.md": "---\ntools: [mcp__myserver__tool]\n---\nx",
    });
    try {
      const findings = CW009.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW009");
    } finally {
      cleanup();
    }
  });

  // --- B5 regression: 6 additional built-ins shipped in v1.6608.2. ---

  it("does not fire on cowork built-in mcp__skills__*", () => {
    const { root, cleanup } = makeRepo({
      "agents/x.md": "---\ntools: [mcp__skills__list]\n---\nbody",
    });
    try {
      expect(CW009.check(discover(root), spec)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it.each([
    "mcp__plugins__list",
    "mcp__terminal__open",
    "mcp__radar__ping",
    "mcp__scheduled-tasks__create",
    "mcp__mcp-registry__list",
    "mcp__cowork-onboarding__show",
    "mcp__cowork__create_artifact",
  ])("does not fire on cowork built-in %s", (tool) => {
    const { root, cleanup } = makeRepo({
      "agents/x.md": `---\ntools: [${tool}]\n---\nbody`,
    });
    try {
      expect(CW009.check(discover(root), spec)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("falls back to the legacy 3-name built-in set on pre-1.6608.2 contracts", () => {
    // Older contracts (e.g. cowork-v2.1.121.json) predate the
    // `cowork_builtin_mcp_servers` field. The rule must fall back to the
    // historical 3-name set (workspace, cowork, cowork-onboarding) so that
    // legitimate built-in references don't get false-positived. Regression
    // guard for the `?? []` collapse-to-empty bug spotted in B5 review.
    const oldSpec = loadSpec(join(REPO_ROOT, "contracts", "cowork-v2.1.121.json"));
    const { root, cleanup } = makeRepo({
      "agents/x.md": "---\ntools: [mcp__workspace__bash]\n---\nbody",
    });
    try {
      expect(CW009.check(discover(root), oldSpec)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("still fires on an unknown third-party server (mcp__github__*)", () => {
    // github is NOT a Cowork built-in — the rule must still flag this when
    // no .mcp.json registers `github`.
    const { root, cleanup } = makeRepo({
      "agents/x.md": "---\ntools: [mcp__github__create_issue]\n---\nbody",
    });
    try {
      const findings = CW009.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW009");
      expect(findings[0]?.message).toContain("mcp__github__create_issue");
    } finally {
      cleanup();
    }
  });
});
