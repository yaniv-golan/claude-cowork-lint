/**
 * SARIF 2.1.0 formatter for GitHub code-scanning.
 *
 * Port of `_legacy/python/cwlint/output/sarif.py`. Builds a minimal but valid
 * 2.1.0 envelope: one `run` whose `tool.driver.rules` is the unique-by-id set
 * of rules that fired (first occurrence wins), and one `results[]` entry per
 * finding. Severity mapping is `error→error`, `warn→warning`, `info→note` —
 * stable, fixed by the contract doc, exercised by `output.test.ts`. Detail
 * and suggestion strings (when present) are attached as `properties` on the
 * result, since SARIF has no first-class slot for them.
 */

import { VERSION } from "../about.js";
import type { Finding, Report, Severity } from "../findings.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  error: "error",
  warn: "warning",
  info: "note",
};

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: "error" | "warning" | "note" };
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number };
    };
  }>;
  properties?: { detail?: string; suggestion?: string };
}

export function formatSarif(report: Report): object {
  const rulesSeen = new Map<string, SarifRule>();
  const results: SarifResult[] = [];
  for (const f of report.findings) {
    if (!rulesSeen.has(f.ruleId)) {
      rulesSeen.set(f.ruleId, {
        id: f.ruleId,
        name: f.ruleId,
        shortDescription: { text: f.message },
        defaultConfiguration: { level: LEVEL[f.severity] },
      });
    }
    results.push(formatResult(f));
  }
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "claude-cowork-lint",
            informationUri: "https://github.com/yaniv-golan/claude-cowork-lint",
            version: VERSION,
            rules: [...rulesSeen.values()],
          },
        },
        results,
        properties: {
          spec_version: report.specVersion,
          claude_app_version: report.claudeAppVersion,
        },
      },
    ],
  };
}

function formatResult(f: Finding): SarifResult {
  const result: SarifResult = {
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
  if (f.detail || f.suggestion) {
    const properties: { detail?: string; suggestion?: string } = {};
    if (f.detail) {
      properties.detail = f.detail;
    }
    if (f.suggestion) {
      properties.suggestion = f.suggestion;
    }
    result.properties = properties;
  }
  return result;
}
