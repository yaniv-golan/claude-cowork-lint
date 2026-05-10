/**
 * JSON formatter — B1 implementation of the stable shape from `docs/CLI.md`.
 *
 * Returns the exact public shape (snake_case keys, summary block, version
 * envelope) so consumers can already start integrating. Task B2 adds
 * polish + tests; the shape itself is fixed by the CLI contract doc.
 */

import { VERSION } from "../about.js";
import type { Report } from "../findings.js";
import { summarise } from "../findings.js";

export interface JsonFinding {
  rule_id: string;
  severity: "error" | "warn" | "info";
  path: string;
  line: number;
  message: string;
  detail: string | null;
  suggestion: string | null;
}

export interface JsonReport {
  cwlint_version: string;
  spec_version: string;
  claude_app_version: string;
  findings: JsonFinding[];
  summary: { error: number; warn: number; info: number };
}

export function formatJson(report: Report): JsonReport {
  return {
    cwlint_version: VERSION,
    spec_version: report.specVersion,
    claude_app_version: report.claudeAppVersion,
    findings: report.findings.map((f) => ({
      rule_id: f.ruleId,
      severity: f.severity,
      path: f.path,
      line: f.line,
      message: f.message,
      detail: f.detail ?? null,
      suggestion: f.suggestion ?? null,
    })),
    summary: summarise(report),
  };
}
