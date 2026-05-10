/**
 * Shared helpers for the per-rule modules.
 *
 * `_helpers.ts` is the leaf of the rules subgraph: each `cw0NN.ts` imports
 * from here, never the reverse. Co-located helpers used by exactly one rule
 * live next to that rule.
 */

import { relative } from "node:path";
import type { RepoLayout } from "../discovery.js";
import type { Finding, Severity } from "../findings.js";
import type { Spec } from "../spec.js";

export interface Rule {
  ruleId: string;
  severity: Severity;
  summary: string;
  check(layout: RepoLayout, spec: Spec): Finding[];
}

export function subagentSurvivors(spec: Spec): Set<string> {
  const f = spec.subagent_tool_filter;
  const h = spec.host_loop_tool_substitution;
  const asyncAllow = new Set(f.async_dispatch_allowlist.names);
  const dropSet = new Set(f.drop_set.names);
  const hostExcluded = new Set(h.host_loop_excluded_builtins.names);
  const out = new Set<string>();
  for (const n of asyncAllow) {
    if (!hostExcluded.has(n) && !dropSet.has(n)) out.add(n);
  }
  return out;
}

export function rel(layoutRoot: string, path: string): string {
  return relative(layoutRoot, path);
}

export function getStringList(fm: Record<string, unknown>, key: string): string[] | null {
  const v = fm[key];
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

// Duplicated in `src/frontmatter.ts`; deduplication is deferred to a later refactor.
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
