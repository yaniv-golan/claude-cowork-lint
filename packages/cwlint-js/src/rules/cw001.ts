/**
 * CW001 — runtime-gate tool allowlist (TypeScript proof of concept).
 *
 * Mirrors the Python implementation. The Node port ships only this rule in
 * v0.1 to validate the architecture; CW002–CW012 follow in v0.4.
 */

import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import type { Spec } from "../spec.js";

const FRONTMATTER = /^---\n(?<body>[\s\S]*?)\n---/;

export function checkCw001(agentPath: string, spec: Spec): Finding[] {
  const text = readFileSync(agentPath, "utf-8");
  const match = FRONTMATTER.exec(text);
  if (!match || !match.groups) return [];

  const tools = parseTools(match.groups["body"] ?? "");
  if (!tools) return [];

  const f = spec.subagent_tool_filter;
  const h = spec.host_loop_tool_substitution;
  const asyncAllow = new Set(f.async_dispatch_allowlist.names);
  const dropSet = new Set(f.drop_set.names);
  const hostExcluded = new Set(h.host_loop_excluded_builtins.names);
  const survivors = new Set<string>();
  for (const n of asyncAllow) {
    if (!hostExcluded.has(n) && !dropSet.has(n)) survivors.add(n);
  }

  const findings: Finding[] = [];
  for (const tool of tools) {
    if (tool.startsWith("mcp__")) continue;
    if (survivors.has(tool)) continue;
    findings.push({
      ruleId: "CW001",
      severity: "error",
      path: agentPath,
      line: findTokenLine(text, tool),
      message: `tool '${tool}' will not be available to a Cowork sub-agent`,
      detail: explain(tool, dropSet, hostExcluded, h.host_loop_excluded_builtins.mcp_replacements),
    });
  }
  return findings;
}

function parseTools(body: string): string[] | null {
  // Tiny YAML subset: `tools: [a, b, c]` or `tools:\n  - a\n  - b`.
  const inlineMatch = /tools\s*:\s*\[([^\]]*)\]/m.exec(body);
  if (inlineMatch) {
    return (inlineMatch[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const blockMatch = /tools\s*:\s*\n((?:\s+-\s+.+\n?)+)/m.exec(body);
  if (blockMatch) {
    return (blockMatch[1] ?? "")
      .split("\n")
      .map((s) => s.match(/^\s+-\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => (m[1] ?? "").trim().replace(/^["']|["']$/g, ""));
  }
  return null;
}

function findTokenLine(text: string, token: string): number {
  const lines = text.split("\n");
  const re = new RegExp(`\\b${escapeRegex(token)}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) return i + 1;
  }
  return 1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explain(
  tool: string,
  dropSet: Set<string>,
  hostExcluded: Set<string>,
  replacements: Record<string, string>,
): string {
  if (dropSet.has(tool)) {
    return "name is in the always-dropped set; never reaches a sub-agent.";
  }
  if (hostExcluded.has(tool)) {
    const repl = replacements[tool];
    return repl
      ? `excluded from registered built-ins in Cowork mode; use '${repl}' instead.`
      : "excluded from registered built-ins in Cowork mode.";
  }
  return "not in the async-dispatch allowlist.";
}
