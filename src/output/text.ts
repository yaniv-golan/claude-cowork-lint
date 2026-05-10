/**
 * Plain-text formatter — minimal B1 stub.
 *
 * Produces one line per finding plus a trailing summary line. Task B2 will
 * replace this with a colourised, padded, terminal-friendly renderer. The
 * shape here exists only so `src/cli.ts` compiles end-to-end during B1.
 */

import type { Report } from "../findings.js";
import { summarise } from "../findings.js";

export function formatText(report: Report): string {
  const lines: string[] = [];
  for (const f of report.findings) {
    lines.push(`[${f.severity}] ${f.ruleId} ${f.path}:${f.line} ${f.message}`);
  }
  const s = summarise(report);
  lines.push(`summary: ${s.error} error, ${s.warn} warn, ${s.info} info`);
  return lines.join("\n");
}
