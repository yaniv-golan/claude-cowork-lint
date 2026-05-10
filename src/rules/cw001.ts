import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { findTokenLine, parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { getStringList, type Rule, rel, subagentSurvivors } from "./_helpers.js";

export const CW001: Rule = {
  ruleId: "CW001",
  severity: "error",
  summary: "Agent declares a tool stripped by Cowork's runtime gates",
  check(layout, spec) {
    const survivors = subagentSurvivors(spec);
    const f = spec.subagent_tool_filter;
    const h = spec.host_loop_tool_substitution;
    const dropSet = new Set(f.drop_set.names);
    const hostExcluded = new Set(h.host_loop_excluded_builtins.names);
    const asyncAllow = new Set(f.async_dispatch_allowlist.names);
    const replacements = h.host_loop_excluded_builtins.mcp_replacements;

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
        } else if (hostExcluded.has(tool)) {
          const repl = replacements[tool];
          detail = repl
            ? `excluded from registered built-ins in Cowork mode; use '${repl}' instead.`
            : "excluded from registered built-ins in Cowork mode.";
          suggestion = repl
            ? `Replace '${tool}' with '${repl}' in this agent's tools.`
            : `Remove '${tool}' from this agent's tools.`;
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
