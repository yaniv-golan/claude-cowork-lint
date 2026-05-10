export type Severity = "error" | "warn" | "info";

export interface Finding {
  ruleId: string;
  severity: Severity;
  path: string;
  line: number;
  message: string;
  detail?: string;
  suggestion?: string;
}

export interface Report {
  specVersion: string;
  claudeAppVersion: string;
  findings: Finding[];
}

export function summarise(report: Report): {
  error: number;
  warn: number;
  info: number;
} {
  return {
    error: report.findings.filter((f) => f.severity === "error").length,
    warn: report.findings.filter((f) => f.severity === "warn").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };
}

export function hasErrors(report: Report): boolean {
  return report.findings.some((f) => f.severity === "error");
}

export function exitCode(report: Report, opts: { strict: boolean }): number {
  return opts.strict && hasErrors(report) ? 1 : 0;
}
