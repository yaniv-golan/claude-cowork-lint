import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { CW003 } from "../../../src/rules/cw003.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();

describe("CW003", () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${CLAUDE_PLUGIN_ROOT} is the runtime-substituted form CW003 expects, not a JS template placeholder
  it("clean with the supported `${...}` form (CLAUDE_PLUGIN_ROOT)", () => {
    const { root, cleanup } = makeRepo({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${CLAUDE_PLUGIN_ROOT} is part of the SKILL.md fixture content
      "SKILL.md": "---\nuser-invocable: true\n---\nuse ${CLAUDE_PLUGIN_ROOT}/foo",
    });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${CLAUDE_PLUGIN_DATA} is the runtime-substituted form CW003 expects, not a JS template placeholder
  it("clean with the supported `${...}` form (CLAUDE_PLUGIN_DATA)", () => {
    const { root, cleanup } = makeRepo({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${CLAUDE_PLUGIN_DATA} is part of the SKILL.md fixture content
      "SKILL.md": "---\nuser-invocable: true\n---\nwrite ${CLAUDE_PLUGIN_DATA}/state.json",
    });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags the bare `$CLAUDE_PLUGIN_ROOT` form", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nuse $CLAUDE_PLUGIN_ROOT/foo",
    });
    try {
      const findings = CW003.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW003");
      expect(findings[0]?.message).toContain("CLAUDE_PLUGIN_ROOT");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the rule's message recommends the literal ${CLAUDE_PLUGIN_ROOT} form
      expect(findings[0]?.message).toContain("${CLAUDE_PLUGIN_ROOT}");
    } finally {
      cleanup();
    }
  });

  it("flags bare $CLAUDE_PLUGIN_DATA the same as $CLAUDE_PLUGIN_ROOT", () => {
    // Round-5 binary verification (Claude.app 1.6608.2) confirmed
    // ${CLAUDE_PLUGIN_DATA} is substituted via an identical regex to
    // ${CLAUDE_PLUGIN_ROOT}, and both env vars are set in the same place
    // on the hook-execution env. The bare-vs-braced silent-failure risk
    // is the same.
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nwrite $CLAUDE_PLUGIN_DATA/state.json",
    });
    try {
      const findings = CW003.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("CW003");
      expect(findings[0]?.message).toContain("CLAUDE_PLUGIN_DATA");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the rule's message recommends the literal ${CLAUDE_PLUGIN_DATA} form
      expect(findings[0]?.message).toContain("${CLAUDE_PLUGIN_DATA}");
    } finally {
      cleanup();
    }
  });

  it("does not match a longer identifier (`$CLAUDE_PLUGIN_ROOT_OTHER`)", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nuse $CLAUDE_PLUGIN_ROOT_OTHER/foo",
    });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("does not match a longer identifier (`$CLAUDE_PLUGIN_DATA_OTHER`)", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\nuse $CLAUDE_PLUGIN_DATA_OTHER/foo",
    });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("respects suppression markers", () => {
    const body =
      "---\n" +
      "user-invocable: true\n" +
      "---\n" +
      '<!-- cwlint: ignore CW003 reason="intentional" -->\n' +
      "$CLAUDE_PLUGIN_ROOT/foo\n";
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("respects suppression markers for $CLAUDE_PLUGIN_DATA too", () => {
    const body =
      "---\n" +
      "user-invocable: true\n" +
      "---\n" +
      '<!-- cwlint: ignore CW003 reason="intentional" -->\n' +
      "$CLAUDE_PLUGIN_DATA/foo\n";
    const { root, cleanup } = makeRepo({ "SKILL.md": body });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("flags multiple bare env vars on the same line", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md":
        "---\nuser-invocable: true\n---\nRun $CLAUDE_PLUGIN_ROOT/a and $CLAUDE_PLUGIN_DATA/b on the same line.",
    });
    try {
      const findings = CW003.check(discover(root), spec);
      expect(findings).toHaveLength(2);
      const messages = findings.map((f) => f.message).join("\n");
      expect(messages).toContain("CLAUDE_PLUGIN_ROOT");
      expect(messages).toContain("CLAUDE_PLUGIN_DATA");
    } finally {
      cleanup();
    }
  });

  it("flags both occurrences when the same env var appears twice on a line", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\n---\ncp $CLAUDE_PLUGIN_DATA/a $CLAUDE_PLUGIN_DATA/b",
    });
    try {
      const findings = CW003.check(discover(root), spec);
      expect(findings).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("respects a same-line suppression marker", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md":
        '---\nuser-invocable: true\n---\nUse $CLAUDE_PLUGIN_DATA/foo <!-- cwlint: ignore CW003 reason="shell context" -->',
    });
    try {
      expect(CW003.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
