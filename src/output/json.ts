/**
 * JSON formatter — stable public shape documented in `docs/CLI.md`.
 *
 * Snake_case keys (mirroring the Python original) and a fixed top-level
 * envelope so downstream consumers can pin against the schema. Driven by
 * `summarise()` for the counts, and `VERSION` from `src/about.ts` for the
 * `cwlint_version` field.
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
