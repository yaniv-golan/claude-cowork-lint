/**
 * Tests for `cwlint doctor` — per-rule contract-anchor drift detection.
 *
 * Covers:
 *  1. The currently-shipped contract resolves every declared anchor.
 *  2. The `deprecated` status takes precedence over `stale` in `overall`.
 *  3. A spec missing a field the rules expect surfaces as `stale`.
 */

import { describe, expect, it } from "vitest";

import { computeOverall, runDoctor } from "../../src/doctor.js";
import { loadDefaultSpec, type Spec } from "../../src/spec.js";

describe("cwlint doctor", () => {
  it("reports overall=ok for every rule against the current contract", () => {
    const report = runDoctor(loadDefaultSpec());
    const stale = report.rules.filter((r) => r.overall === "stale");
    expect(stale, `stale rules: ${JSON.stringify(stale, null, 2)}`).toEqual([]);
  });

  it("computeOverall enforces deprecated > anchor-resolution precedence", () => {
    // Constructive truth-table for the precedence logic. Avoids depending on
    // any rule in RULE_META actually being deprecated today — the previous
    // form iterated `report.rules` filtering for status==="deprecated" and
    // passed by vacuous truth when no such rule existed.
    const cases: Array<{
      status: "stable" | "deprecated" | "experimental";
      allResolved: boolean;
      expected: "ok" | "stale" | "deprecated";
    }> = [
      { status: "deprecated", allResolved: true, expected: "deprecated" },
      { status: "deprecated", allResolved: false, expected: "deprecated" },
      { status: "stable", allResolved: true, expected: "ok" },
      { status: "stable", allResolved: false, expected: "stale" },
    ];
    for (const c of cases) {
      expect(computeOverall(c.status, c.allResolved), JSON.stringify(c)).toBe(c.expected);
    }
  });

  it("would report stale if a rule's anchor is missing", () => {
    // Synthetic spec: wipe skill_frontmatter_invariants so CW003/CW004/CW005
    // anchors all fail to resolve. Each of those rules must surface in the
    // stale set.
    const base = loadDefaultSpec();
    const synthetic = {
      ...base,
      skill_frontmatter_invariants: {},
    } as unknown as Spec;
    const report = runDoctor(synthetic);
    const stale = report.rules.filter((r) => r.overall === "stale");
    expect(stale.length).toBeGreaterThan(0);
    const staleIds = new Set(stale.map((r) => r.ruleId));
    expect(staleIds.has("CW003")).toBe(true);
    expect(staleIds.has("CW004")).toBe(true);
    expect(staleIds.has("CW005")).toBe(true);
  });
});
