/**
 * CW010 — post-deprecation tests.
 *
 * Task B4: the Operon kernel-secrets subsystem was removed in Claude.app
 * 1.6608.2, so CW010 is demoted from `error` to `info` and marked
 * `deprecated` in `src/rules/_meta.ts`. The match criteria (which
 * `userConfig` names trigger) are unchanged — only severity and message
 * framing changed.
 */
import { describe, expect, it } from "vitest";

import { discover } from "../../../src/discovery.js";
import { CW010 } from "../../../src/rules/cw010.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();

describe("CW010 (post-deprecation)", () => {
  it("declared severity is info", () => {
    expect(CW010.severity).toBe("info");
  });

  it("fires on reserved-name userConfig with deprecation-flavoured message", () => {
    const { root, cleanup } = makeRepo({
      ".claude-plugin/plugin.json":
        '{"name":"x","version":"0.1.0","userConfig":{"ANTHROPIC_API_KEY":{"type":"string"}}}',
    });
    try {
      const findings = CW010.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      const f = findings[0];
      expect(f?.severity).toBe("info");
      expect(f?.message).toContain("legacy Operon reserved name");
      expect((f?.detail ?? "").toLowerCase()).toContain("no longer rejected");
      expect(f?.suggestion ?? "").toContain("MY_PLUGIN_API_KEY");
    } finally {
      cleanup();
    }
  });

  it("suggests a different name for non-ANTHROPIC reserved literals", () => {
    const { root, cleanup } = makeRepo({
      ".claude-plugin/plugin.json":
        '{"name":"x","version":"0.1.0","userConfig":{"DATABASE_URL":{"type":"string"}}}',
    });
    try {
      const findings = CW010.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      const suggestion = findings[0]?.suggestion ?? "";
      // The bug: pre-fix, the suggestion echoed the offending name verbatim
      // ("Rename to ... e.g. `DATABASE_URL`."). The backtick-quoted example
      // must not be the bare violating name.
      expect(suggestion).not.toContain("`DATABASE_URL`");
      expect(suggestion).toContain("MY_PLUGIN_");
    } finally {
      cleanup();
    }
  });

  it("clean userConfig produces no findings", () => {
    const { root, cleanup } = makeRepo({
      ".claude-plugin/plugin.json":
        '{"name":"x","version":"0.1.0","userConfig":{"MY_API_KEY":{"type":"string"}}}',
    });
    try {
      expect(CW010.check(discover(root), spec)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
