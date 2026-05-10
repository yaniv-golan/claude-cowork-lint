/**
 * Discovery tests — ported from `_legacy/python/tests/unit/test_discovery.py`.
 */

import { basename, dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { discover } from "../../src/discovery.js";
import { makeRepo } from "../helpers.js";

function names(paths: string[]): Set<string> {
  return new Set(paths.map((p) => basename(p)));
}

function parentNames(paths: string[]): Set<string> {
  return new Set(paths.map((p) => basename(dirname(p))));
}

describe("discover", () => {
  it("finds a SKILL.md at the root", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nbody",
    });
    try {
      const layout = discover(root);
      expect(names(layout.skills)).toEqual(new Set(["SKILL.md"]));
      expect(layout.plugins).toEqual([]);
      expect(layout.agents).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("finds nested SKILL.md files", () => {
    const { root, cleanup } = makeRepo({
      "skills/foo/SKILL.md": "---\nuser-invocable: true\n---\nx",
      "skills/bar/SKILL.md": "---\nuser-invocable: true\n---\ny",
    });
    try {
      const layout = discover(root);
      expect(layout.skills).toHaveLength(2);
      expect(parentNames(layout.skills)).toEqual(new Set(["foo", "bar"]));
    } finally {
      cleanup();
    }
  });

  it("finds plugin manifests and hooks files", () => {
    const { root, cleanup } = makeRepo({
      ".claude-plugin/plugin.json": '{"name":"x","version":"0.1.0"}',
      "hooks/hooks.json": '{"hooks": {}}',
    });
    try {
      const layout = discover(root);
      expect(layout.plugins).toHaveLength(1);
      expect(layout.pluginHooksFiles.length).toBeGreaterThan(0);
      expect(basename(layout.pluginHooksFiles[0] ?? "")).toBe("hooks.json");
    } finally {
      cleanup();
    }
  });

  it("finds agent files (including nested)", () => {
    const { root, cleanup } = makeRepo({
      "agents/reviewer.md": "---\ntools: [Bash, Read]\n---\nx",
      "agents/sub/specialist.md": "---\ntools: [Edit]\n---\ny",
    });
    try {
      const layout = discover(root);
      expect(layout.agents).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("ignores node_modules and dist", () => {
    const { root, cleanup } = makeRepo({
      "node_modules/junk/SKILL.md": "---\n---\nignored",
      "dist/SKILL.md": "---\n---\nignored",
      "skills/real/SKILL.md": "---\nuser-invocable: true\n---\nreal",
    });
    try {
      const layout = discover(root);
      expect(layout.skills).toHaveLength(1);
      expect(basename(dirname(layout.skills[0] ?? ""))).toBe("real");
    } finally {
      cleanup();
    }
  });

  it("finds .mcp.json", () => {
    const { root, cleanup } = makeRepo({
      ".mcp.json": '{"mcpServers": {"workspace": {}}}',
    });
    try {
      const layout = discover(root);
      expect(layout.mcpConfigs).toHaveLength(1);
      expect(basename(layout.mcpConfigs[0] ?? "")).toBe(".mcp.json");
    } finally {
      cleanup();
    }
  });

  it("finds plugin commands", () => {
    const { root, cleanup } = makeRepo({
      "commands/foo.md": "---\nallowed-tools: [Read]\n---\nbody",
      "commands/sub/bar.md": "---\n---\nbody",
    });
    try {
      const layout = discover(root);
      expect(layout.commands).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("finds settings.json and settings.local.json under .claude/", () => {
    const { root, cleanup } = makeRepo({
      ".claude/settings.json": "{}",
      ".claude/settings.local.json": "{}",
    });
    try {
      const layout = discover(root);
      expect(layout.settingsFiles).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
