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

/**
 * Read the host-loop replacement map, preferring the v1.6608.2+
 * `host_loop_tool_substitution.replacements` sibling, falling back to the
 * legacy `host_loop_excluded_builtins.mcp_replacements` map on older
 * contracts. Returns only the entries with string values (the new contract
 * shape carries `_description`/`verified_against` doc keys alongside the
 * real replacement pairs).
 */
export function hostLoopReplacements(spec: Spec): Record<string, string> {
  const h = spec.host_loop_tool_substitution;
  const raw = h.replacements ?? h.host_loop_excluded_builtins.mcp_replacements ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    // Skip doc keys (`_description`, `verified_against`, `_note_others`)
    // and any non-string value. The replacement-name convention is
    // CamelCase built-in → snake_case mcp__workspace__* — both string.
    if (typeof v !== "string") continue;
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Names that the desktop's host-loop layer drops without registering any
 * MCP replacement. Prefers the v1.6608.2+ explicit
 * `host_loop_dropped_builtins.names` field; falls back to deriving it from
 * `host_loop_excluded_builtins.names \ replacements_keys` on legacy
 * contracts.
 */
export function hostLoopDroppedBuiltins(spec: Spec): Set<string> {
  const h = spec.host_loop_tool_substitution;
  if (h.host_loop_dropped_builtins?.names) {
    return new Set(h.host_loop_dropped_builtins.names);
  }
  const excluded = new Set(h.host_loop_excluded_builtins.names);
  for (const k of Object.keys(hostLoopReplacements(spec))) excluded.delete(k);
  return excluded;
}

export function subagentSurvivors(spec: Spec): Set<string> {
  const f = spec.subagent_tool_filter;
  const asyncAllow = new Set(f.async_dispatch_allowlist.names);
  const dropSet = new Set(f.drop_set.names);
  const dropped = hostLoopDroppedBuiltins(spec);
  const replacements = hostLoopReplacements(spec);
  const replaced = new Set(Object.keys(replacements));
  const out = new Set<string>();
  // Tools in the async-dispatch allowlist that aren't in the drop_set and
  // aren't host-loop-excluded (either dropped or replaced) survive as
  // themselves. The host-loop-replaced names are filtered OUT of the
  // built-in survivor set; their mcp__workspace__* counterparts are
  // available separately (and matched via the mcp__ fast-path in callers).
  for (const n of asyncAllow) {
    if (dropSet.has(n)) continue;
    if (dropped.has(n)) continue;
    if (replaced.has(n)) continue;
    out.add(n);
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
