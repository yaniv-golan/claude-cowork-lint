/**
 * Suppression marker parser tests — ported from
 * `_legacy/python/tests/unit/test_suppression.py`.
 */

import { describe, expect, it } from "vitest";

import { isSuppressed, parseSuppressions } from "../../src/suppression.js";

describe("parseSuppressions", () => {
  it("parses an html-comment suppression", () => {
    const src = [
      "hello",
      '<!-- cwlint: ignore CW008 reason="main-thread block, not sub-agent" -->',
      "```python",
      'print("hi")',
      "```",
    ];
    const sups = parseSuppressions(src);
    expect(sups).toEqual([
      { line: 2, ruleIds: ["CW008"], reason: "main-thread block, not sub-agent" },
    ]);
  });

  it("parses a hash-comment suppression with multiple rules", () => {
    const src = ['# cwlint: ignore CW001,CW003 reason="intentional"'];
    expect(parseSuppressions(src)).toEqual([
      { line: 1, ruleIds: ["CW001", "CW003"], reason: "intentional" },
    ]);
  });

  it("rejects a marker missing a reason", () => {
    const src = ["<!-- cwlint: ignore CW001 -->"];
    expect(parseSuppressions(src)).toEqual([]);
  });
});

describe("isSuppressed", () => {
  it("applies on the same line", () => {
    const sups = parseSuppressions(['x  # cwlint: ignore CW001 reason="x"']);
    expect(isSuppressed(sups, "CW001", 1)).toBe(true);
  });

  it("applies on the line directly below", () => {
    const sups = parseSuppressions(['# cwlint: ignore CW001 reason="x"', "y"]);
    expect(isSuppressed(sups, "CW001", 2)).toBe(true);
  });

  it("does not apply two lines below", () => {
    const sups = parseSuppressions(['# cwlint: ignore CW001 reason="x"', "y", "z"]);
    expect(isSuppressed(sups, "CW001", 3)).toBe(false);
  });

  it("does not apply to a different rule", () => {
    const sups = parseSuppressions(['# cwlint: ignore CW001 reason="x"']);
    expect(isSuppressed(sups, "CW002", 1)).toBe(false);
  });
});
