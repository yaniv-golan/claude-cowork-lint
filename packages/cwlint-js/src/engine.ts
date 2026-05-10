/**
 * Run all rules against a target repo and produce a Report.
 * Mirrors `cwlint.engine.check_repo`.
 */

import { discover } from "./discovery.js";
import type { Finding, Report } from "./findings.js";
import { ALL_RULES } from "./rules.js";
import type { Spec } from "./spec.js";

export function checkRepo(root: string, spec: Spec, opts: { ignore?: string[] } = {}): Report {
  const layout = discover(root);
  const ignored = new Set(opts.ignore ?? []);
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    if (ignored.has(rule.ruleId)) continue;
    findings.push(...rule.check(layout, spec));
  }
  findings.sort((a, b) => {
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.line - b.line;
  });
  return {
    specVersion: spec.spec_version,
    claudeAppVersion: spec.claude_app_version,
    findings,
  };
}
