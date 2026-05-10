/**
 * Human-readable text formatter for terminal output.
 *
 * Port of `_legacy/python/cwlint/output/text.py`. Findings are grouped by
 * file path; each group prints a header (the relative path) followed by one
 * line per finding shaped as `  <icon> <line>  <ruleId>  <message>` with
 * optional indented `detail` and `→ suggestion` follow-up lines. The trailing
 * `Summary:` line carries the per-severity counts and the contract version.
 */

import type { Finding, Report, Severity } from "../findings.js";
import { summarise } from "../findings.js";

const ICON: Record<Severity, string> = {
  error: "✗",
  warn: "!",
  info: "i",
};

/**
 * Render a `checkRepo()` report as human-readable text.
 *
 * The `color` option is reserved for future ANSI work: the text formatter
 * currently emits plain ASCII unconditionally, so passing `color: false`
 * has no visible effect today. The signature is in place so when ANSI
 * lands, only this function changes — call sites are already gated by
 * `shouldColor()` in `src/cli.ts`.
 */
export function formatText(report: Report, _opts: { color: boolean } = { color: true }): string {
  if (report.findings.length === 0) {
    return `✓ no findings  (spec: claude-app ${report.claudeAppVersion})`;
  }

  const byPath = new Map<string, Finding[]>();
  for (const f of report.findings) {
    const bucket = byPath.get(f.path);
    if (bucket) {
      bucket.push(f);
    } else {
      byPath.set(f.path, [f]);
    }
  }

  const out: string[] = [];
  const sortedPaths = [...byPath.keys()].sort();
  for (const path of sortedPaths) {
    out.push(`\n${path}`);
    const findings = byPath.get(path) ?? [];
    for (const f of findings) {
      const icon = ICON[f.severity];
      const line = String(f.line).padStart(4, " ");
      out.push(`  ${icon} ${line}  ${f.ruleId}  ${f.message}`);
      if (f.detail) {
        out.push(`          ${f.detail}`);
      }
      if (f.suggestion) {
        out.push(`          → ${f.suggestion}`);
      }
    }
  }

  const s = summarise(report);
  out.push("");
  out.push(
    `Summary: ${s.error} error, ${s.warn} warn, ${s.info} info  (spec: claude-app ${report.claudeAppVersion})`,
  );
  return out.join("\n");
}
