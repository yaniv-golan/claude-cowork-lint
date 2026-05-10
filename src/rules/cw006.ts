import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import type { Spec } from "../spec.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

const TOOL_TOKEN = /\b([A-Z][a-zA-Z]{1,39})\b/g;

export const CW006: Rule = {
  ruleId: "CW006",
  severity: "warn",
  summary: "Hook command references a tool name not in any allowlist (typo detector)",
  check(layout, spec) {
    const known = buildKnownTools(spec);
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const path of [...layout.pluginHooksFiles, ...layout.settingsFiles]) {
      const text = readFileSync(path, "utf-8");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      walkStrings(payload, (s) => {
        const m = TOOL_TOKEN.exec(s);
        TOOL_TOKEN.lastIndex = 0;
        if (!m) return;
        for (const match of s.matchAll(/\b([A-Z][a-zA-Z]{1,39})\b/g)) {
          const candidate = match[1] ?? "";
          if (!candidate || known.has(candidate)) continue;
          const suggestion = closestMatch(candidate, known);
          if (!suggestion) continue;
          const key = `${path}:${candidate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let lineNo = 1;
          for (let i = 0; i < lines.length; i++) {
            if ((lines[i] ?? "").includes(candidate)) {
              lineNo = i + 1;
              break;
            }
          }
          if (isSuppressed(sups, "CW006", lineNo)) continue;
          findings.push({
            ruleId: "CW006",
            severity: "warn",
            path: rel(layout.root, path),
            line: lineNo,
            message: `unknown tool name '${candidate}' — did you mean '${suggestion}'?`,
            suggestion: `Replace '${candidate}' with '${suggestion}'.`,
          });
        }
      });
    }
    return findings;
  },
};

function buildKnownTools(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const n of spec.subagent_tool_filter.async_dispatch_allowlist.names) out.add(n);
  for (const n of spec.subagent_tool_filter.drop_set.names) out.add(n);
  for (const n of spec.subagent_tool_filter.fork_subagent_allowlist.names) out.add(n);
  for (const n of spec.subagent_tool_filter.experimental_fallback_allowlist.names) out.add(n);
  for (const n of spec.host_loop_tool_substitution.host_loop_safe_set.names) out.add(n);
  for (const n of spec.host_loop_tool_substitution.host_loop_excluded_builtins.names) out.add(n);
  return out;
}

function closestMatch(s: string, known: Set<string>): string | null {
  // Mirror Python's difflib semantics: similarity ratio = 2 * LCS / (len(a) + len(b)).
  // Threshold 0.7 keeps "WriteFile" -> "Write" (0.71) and rejects "Docker" -> any.
  let best: { name: string; ratio: number } | null = null;
  for (const k of known) {
    const r = ratio(s, k);
    if (r >= 0.7 && (best === null || r > best.ratio)) {
      best = { name: k, ratio: r };
    }
  }
  return best ? best.name : null;
}

function ratio(a: string, b: string): number {
  if (a === b) return 1;
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * lcs(a, b)) / total;
}

function lcs(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] =
        a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, cur[j - 1] ?? 0);
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return prev[n] ?? 0;
}

function walkStrings(node: unknown, cb: (s: string) => void): void {
  if (typeof node === "string") {
    cb(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) walkStrings(v, cb);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) walkStrings(v, cb);
  }
}
