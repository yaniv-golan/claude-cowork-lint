import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discover } from "../../../src/discovery.js";
import { CW006 } from "../../../src/rules/cw006.js";
import { loadDefaultSpec } from "../../../src/spec.js";
import { makeRepo } from "../../helpers.js";

const spec = loadDefaultSpec();

describe("CW006", () => {
  it("ignores tool-name-shaped tokens in 'prompt:' field values", () => {
    const fixture = readFileSync("test/fixtures/dogfood/hook-with-prompt-field.json", "utf-8");
    const { root, cleanup } = makeRepo({ "hooks/hooks.json": fixture });
    try {
      const findings = CW006.check(discover(root), spec);
      const cw006Findings = findings.filter((f) => f.ruleId === "CW006");
      // Exactly one finding: the 'command:' field contains "WriteFile".
      expect(cw006Findings).toHaveLength(1);
      expect(cw006Findings[0]?.message).toContain("WriteFile");
      // The 'prompt:' field contains "Real", "Read" — must not fire.
      expect(cw006Findings.some((f) => f.message.includes("Real"))).toBe(false);
      expect(cw006Findings.some((f) => f.message.includes("Read"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("still fires on commands referencing typo'd tool names", () => {
    const { root, cleanup } = makeRepo({
      "hooks/hooks.json": '{"hooks": {"PreToolUse": [{"command": "echo WriteFile"}]}}',
    });
    try {
      const findings = CW006.check(discover(root), spec);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("WriteFile");
    } finally {
      cleanup();
    }
  });
});
