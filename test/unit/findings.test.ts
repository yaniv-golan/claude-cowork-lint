/**
 * Tests for the Severity / Finding / Report types and helpers.
 * Ported from `_legacy/python/tests/unit/test_findings.py`. The TS port
 * lacks Pydantic validation, so the "immutable" check from the Python
 * suite drops out — Finding is a plain interface. We instead exercise the
 * `summarise` / `hasErrors` / `exitCode` helpers that took its place.
 */

import { describe, expect, it } from "vitest";

import type { Finding, Report } from "../../src/findings.js";
import { exitCode, hasErrors, summarise } from "../../src/findings.js";

function f(ruleId: string, severity: "error" | "warn" | "info", path = "a"): Finding {
  return { ruleId, severity, path, line: 1, message: "" };
}

describe("Report aggregations", () => {
  it("summarise counts severities", () => {
    const r: Report = {
      specVersion: "0",
      claudeAppVersion: "1.6259.1",
      findings: [
        f("CW001", "error"),
        f("CW003", "warn", "b"),
        f("CW003", "warn", "c"),
        f("CW009", "info", "d"),
      ],
    };
    const s = summarise(r);
    expect(s.error).toBe(1);
    expect(s.warn).toBe(2);
    expect(s.info).toBe(1);
    expect(hasErrors(r)).toBe(true);
  });

  it("strict exit code is 1 when errors exist", () => {
    const r: Report = {
      specVersion: "0",
      claudeAppVersion: "1.6259.1",
      findings: [f("CW001", "error")],
    };
    expect(exitCode(r, { strict: true })).toBe(1);
    expect(exitCode(r, { strict: false })).toBe(0);
  });

  it("strict exit code is 0 when only warnings exist", () => {
    const r: Report = {
      specVersion: "0",
      claudeAppVersion: "1.6259.1",
      findings: [f("CW003", "warn")],
    };
    expect(exitCode(r, { strict: true })).toBe(0);
    expect(exitCode(r, { strict: false })).toBe(0);
  });
});
