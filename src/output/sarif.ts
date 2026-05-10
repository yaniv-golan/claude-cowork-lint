/**
 * SARIF 2.1.0 formatter — B1 stub envelope.
 *
 * Produces a valid SARIF 2.1.0 document with the documented severity mapping
 * (`error→error`, `warn→warning`, `info→note`). Task B2 will add proper
 * help URIs, ruleIndex linkage, and full schema validation; the envelope
 * shape here is sufficient for `github/codeql-action/upload-sarif@v3`.
 */

import { VERSION } from "../about.js";
import type { Finding, Report, Severity } from "../findings.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  error: "error",
  warn: "warning",
  info: "note",
};

export function formatSarif(report: Report): object {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "claude-cowork-lint",
            version: VERSION,
            informationUri: "https://github.com/yaniv-golan/claude-cowork-lint",
          },
        },
        results: report.findings.map(toResult),
      },
    ],
  };
}

function toResult(f: Finding): object {
  return {
    ruleId: f.ruleId,
    level: LEVEL[f.severity],
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.path },
          region: { startLine: f.line },
        },
      },
    ],
  };
}
