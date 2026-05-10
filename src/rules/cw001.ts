/**
 * CW001 — agent declares a tool stripped by Cowork's runtime gates.
 *
 * Reads agents/*.md frontmatter; cross-checks each declared tool against the
 * spec's drop_set, host_loop_excluded_builtins, and async_dispatch_allowlist
 * to determine whether the tool will actually reach the sub-agent.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { findTokenLine, parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import {
  getStringList,
  hostLoopDroppedBuiltins,
  hostLoopReplacements,
  type Rule,
  rel,
  subagentSurvivors,
} from "./_helpers.js";

export const CW001: Rule = {
  ruleId: "CW001",
  severity: "error",
  summary: "Agent declares a tool stripped by Cowork's runtime gates",
  check(layout, spec) {
    const survivors = subagentSurvivors(spec);
    const f = spec.subagent_tool_filter;
    const dropSet = new Set(f.drop_set.names);
    const asyncAllow = new Set(f.async_dispatch_allowlist.names);
    const replacements = hostLoopReplacements(spec);
    const droppedNoReplacement = hostLoopDroppedBuiltins(spec);
    const hostReplaced = new Set(Object.keys(replacements));

    const findings: Finding[] = [];
    for (const path of layout.agents) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      const tools = getStringList(fm.data, "tools");
      if (!tools) continue;

      for (const tool of tools) {
        if (tool.startsWith("mcp__")) continue;
        if (survivors.has(tool)) continue;
        const lineNo = findTokenLine(text, tool, fm.bodyStartLine);
        if (isSuppressed(sups, "CW001", lineNo)) continue;
        let detail: string;
        let suggestion: string;
        if (dropSet.has(tool)) {
          detail = "name is in the always-dropped set; never reaches a sub-agent.";
          suggestion = `Remove '${tool}' from this agent's tools.`;
        } else if (hostReplaced.has(tool)) {
          const repl = replacements[tool] as string;
          detail = `excluded from registered built-ins in Cowork mode; use '${repl}' instead.`;
          suggestion = `Replace '${tool}' with '${repl}' in this agent's tools.`;
        } else if (droppedNoReplacement.has(tool)) {
          detail = `'${tool}' has no Cowork equivalent — the desktop drops it without registering an MCP replacement.`;
          suggestion = `Remove '${tool}' from this agent's tools; Cowork has no equivalent.`;
        } else if (!asyncAllow.has(tool)) {
          detail = "not in the async-dispatch allowlist (Ys_/LW8).";
          suggestion = `Remove '${tool}' or replace with an allowlist member.`;
        } else {
          detail = "not in sub-agent survivor set";
          suggestion = `Remove '${tool}'.`;
        }
        findings.push({
          ruleId: "CW001",
          severity: "error",
          path: rel(layout.root, path),
          line: lineNo,
          message: `tool '${tool}' will not be available to a Cowork sub-agent`,
          detail,
          suggestion,
        });
      }
    }
    return findings;
  },
};
