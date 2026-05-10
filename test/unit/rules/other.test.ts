/**
 * Tests for CW002, CW004, CW005, CW006, CW010, CW011, CW012.
 * (CW003 lives in `cw003.test.ts`; CW008 lives in `cw008.test.ts`;
 * CW009 lives in `cw009.test.ts`.)
 * Ported from `_legacy/python/tests/unit/rules/test_other_rules.py`.
 */

import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { CW002, CW004, CW005, CW006, CW010, CW011, CW012 } from "../../../src/rules/index.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();

// ---------- CW002 ----------

describe("CW002", () => {
  it("clean with Write", () => {
    const { root, cleanup } = makeRepo({ "agents/a.md": "---\ntools: [Read, Write]\n---\nx" });
    try {
      expect(CW002.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("clean with Edit", () => {
    const { root, cleanup } = makeRepo({ "agents/a.md": "---\ntools: [Read, Edit]\n---\nx" });
    try {
      expect(CW002.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags when neither Write nor Edit is present", () => {
    const { root, cleanup } = makeRepo({ "agents/a.md": "---\ntools: [Read, Grep]\n---\nx" });
    try {
      const findings = CW002.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW002");
    } finally {
      cleanup();
    }
  });

  it("mcp__workspace__bash does not satisfy CW002 (not a structured persistence path)", () => {
    const { root, cleanup } = makeRepo({
      "agents/a.md": "---\ntools: [Read, mcp__workspace__bash]\n---\nx",
    });
    try {
      const findings = CW002.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW002");
    } finally {
      cleanup();
    }
  });
});

// CW003 lives in `cw003.test.ts` (extracted in Task B7).

// ---------- CW004 ----------

describe("CW004", () => {
  it("clean (no field)", () => {
    const { root, cleanup } = makeRepo({ "SKILL.md": "---\nuser-invocable: true\n---\nbody" });
    try {
      expect(CW004.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("clean when set to false", () => {
    const body = "---\nuser-invocable: true\ndisable-model-invocation: false\n---\nbody";
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW004.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags when set to true", () => {
    const body = "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody";
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      const findings = CW004.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW004");
    } finally {
      cleanup();
    }
  });
});

// ---------- CW005 ----------

describe("CW005", () => {
  it("clean (user-invocable: true)", () => {
    const { root, cleanup } = makeRepo({ "SKILL.md": "---\nuser-invocable: true\n---\nbody" });
    try {
      expect(CW005.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("clean when the field is absent (defaults to true at runtime)", () => {
    // Verified against Claude.app 1.6608.2: the runtime parses
    // `user-invocable` as `(value?.toLowerCase() !== "false")` — missing → true.
    // Anthropic's own 17 official skills all omit the field entirely.
    const { root, cleanup } = makeRepo({ "SKILL.md": "---\nname: foo\n---\nbody" });
    try {
      expect(CW005.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags when explicitly set to false (boolean)", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: false\n---\nbody",
    });
    try {
      const findings = CW005.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW005");
      expect(findings[0]?.message).toContain("explicitly set to false");
    } finally {
      cleanup();
    }
  });

  it("flags when explicitly set to the string 'false' (case-insensitive)", () => {
    // The runtime lowercases before comparing, so "False"/"FALSE"/"false" all opt out.
    const { root, cleanup } = makeRepo({
      "SKILL.md": '---\nuser-invocable: "False"\n---\nbody',
    });
    try {
      const findings = CW005.check(discover(root), spec);
      expect(findings).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("clean when set to any non-false string (e.g. 'yes')", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": '---\nuser-invocable: "yes"\n---\nbody',
    });
    try {
      expect(CW005.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

// ---------- CW006 ----------

describe("CW006", () => {
  it("flags WriteFile typo", () => {
    const body = '{"hooks": {"PreToolUse": [{"command": "echo WriteFile here"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      const findings = CW006.check(discover(root), spec);
      expect(findings.some((f) => f.ruleId === "CW006" && f.message.includes("WriteFile"))).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it("does not flag a known tool name (Write)", () => {
    const body = '{"hooks": {"PreToolUse": [{"command": "echo Write"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      const findings = CW006.check(discover(root), spec);
      expect(findings.every((f) => f.ruleId !== "CW006")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("does not flag random capitalised words (Docker)", () => {
    const body = '{"hooks": {"PreToolUse": [{"command": "echo Docker hello"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      const findings = CW006.check(discover(root), spec);
      expect(findings.every((f) => f.ruleId !== "CW006")).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// CW009 lives in `cw009.test.ts` (extracted in Task B5).

// ---------- CW010 ----------

describe("CW010", () => {
  it("clean MY_TOKEN userConfig", () => {
    const payload = '{"name":"x","version":"0.1.0","userConfig":{"MY_TOKEN":{"type":"string"}}}';
    const { root, cleanup } = makeRepo({ ".claude-plugin/plugin.json": payload });
    try {
      expect(CW010.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags a name violating the regex", () => {
    const payload = '{"name":"x","version":"0.1.0","userConfig":{"1foo":{"type":"string"}}}';
    const { root, cleanup } = makeRepo({ ".claude-plugin/plugin.json": payload });
    try {
      const findings = CW010.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW010");
    } finally {
      cleanup();
    }
  });

  it("flags a reserved-name literal (ANTHROPIC_API_KEY)", () => {
    const payload =
      '{"name":"x","version":"0.1.0","userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}';
    const { root, cleanup } = makeRepo({ ".claude-plugin/plugin.json": payload });
    try {
      const findings = CW010.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect((findings[0]?.detail ?? "").toLowerCase()).toContain("reserved");
    } finally {
      cleanup();
    }
  });
});

// ---------- CW011 ----------

describe("CW011", () => {
  it("clean — no hooks file", () => {
    const { root, cleanup } = makeRepo({ "SKILL.md": "---\nuser-invocable: true\n---\nx" });
    try {
      expect(CW011.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags any hooks/hooks.json file", () => {
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": '{"hooks": {}}' });
    try {
      const findings = CW011.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW011");
    } finally {
      cleanup();
    }
  });
});

// ---------- CW012 ----------

describe("CW012", () => {
  it("clean PreToolUse event", () => {
    const body = '{"hooks": {"PreToolUse": [{"command": "echo"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      expect(CW012.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags Stop event", () => {
    const body = '{"hooks": {"Stop": [{"command": "echo"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      const findings = CW012.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW012");
    } finally {
      cleanup();
    }
  });

  it("flags SessionStart event", () => {
    const body = '{"hooks": {"SessionStart": [{"command": "echo"}]}}';
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": body });
    try {
      const findings = CW012.check(discover(root), spec);
      expect(findings).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
