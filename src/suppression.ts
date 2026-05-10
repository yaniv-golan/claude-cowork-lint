/**
 * Parse `# cwlint: ignore CWxxx[,CWyyy] reason="..."` markers.
 * Same semantics as the Python implementation.
 */

const MARKER = /cwlint:\s+ignore\s+(CW\d{3}(?:\s*,\s*CW\d{3})*)\s+reason="([^"]+)"/;

export interface Suppression {
  line: number;
  ruleIds: string[];
  reason: string;
}

export function parseSuppressions(lines: string[]): Suppression[] {
  const out: Suppression[] = [];
  lines.forEach((line, idx) => {
    const m = MARKER.exec(line);
    if (!m) return;
    const ids = (m[1] ?? "").split(",").map((s) => s.trim());
    out.push({ line: idx + 1, ruleIds: ids, reason: m[2] ?? "" });
  });
  return out;
}

export function isSuppressed(sups: Suppression[], ruleId: string, lineNo: number): boolean {
  return sups.some(
    (s) => s.ruleIds.includes(ruleId) && (s.line === lineNo || s.line === lineNo - 1),
  );
}
