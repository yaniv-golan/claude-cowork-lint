/**
 * `cwlint doctor` — audit per-rule contract anchors against the loaded spec.
 *
 * Each rule in `src/rules/_meta.ts` declares the dotted paths it reads from
 * the contract. This module walks every rule's anchors against the current
 * spec and emits a report flagging any anchor that no longer resolves.
 * Catches CW004-style drift the moment a contract field is removed or moved.
 *
 * Status precedence in the per-rule `overall` field:
 *   1. status: "deprecated"   → overall "deprecated" (regardless of anchors)
 *   2. all anchors resolved   → overall "ok"
 *   3. otherwise              → overall "stale"
 */

import { RULE_META, type RuleMeta } from "./rules/_meta.js";
import type { Spec } from "./spec.js";

export interface DoctorAnchor {
  path: string;
  resolved: boolean;
}

export interface DoctorRuleReport {
  ruleId: string;
  status: RuleMeta["status"];
  verified_against: string;
  anchors: DoctorAnchor[];
  overall: "ok" | "stale" | "deprecated";
}

export interface DoctorReport {
  spec_version: string;
  claude_app_version: string;
  rules: DoctorRuleReport[];
}

/**
 * Compute a rule's `overall` doctor status from its lifecycle status and
 * anchor-resolution results.
 *
 * Precedence (matches the runDoctor implementation; exported so tests can
 * exercise the full truth-table without round-tripping through a synthetic
 * spec):
 *   1. status: "deprecated"   → "deprecated" (regardless of anchors)
 *   2. all anchors resolved   → "ok"
 *   3. otherwise              → "stale"
 */
export function computeOverall(
  status: RuleMeta["status"],
  allAnchorsResolved: boolean,
): DoctorRuleReport["overall"] {
  if (status === "deprecated") return "deprecated";
  return allAnchorsResolved ? "ok" : "stale";
}

export function runDoctor(spec: Spec): DoctorReport {
  const rules: DoctorRuleReport[] = [];
  for (const meta of Object.values(RULE_META)) {
    const anchors: DoctorAnchor[] = meta.contractAnchors.map((path) => ({
      path,
      resolved: resolvePath(spec, path) !== undefined,
    }));
    const allResolved = anchors.every((a) => a.resolved);
    const overall = computeOverall(meta.status, allResolved);
    rules.push({
      ruleId: meta.ruleId,
      status: meta.status,
      verified_against: meta.verifiedAgainst,
      anchors,
      overall,
    });
  }
  return {
    spec_version: spec.spec_version,
    claude_app_version: spec.claude_app_version,
    rules,
  };
}

/**
 * Resolve a dotted path against an arbitrary object graph.
 * Returns `undefined` if any segment in the path is missing or non-object.
 */
function resolvePath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const segment of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}
