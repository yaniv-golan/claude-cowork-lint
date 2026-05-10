import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { findTokenLine, parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { getStringList, type Rule, rel, subagentSurvivors } from "./_helpers.js";

export const CW002: Rule = {
  ruleId: "CW002",
  severity: "error",
  summary: "Agent has neither Write nor Edit after the runtime gates apply",
  check(layout, spec) {
    const survivors = subagentSurvivors(spec);
    const findings: Finding[] = [];
    for (const path of layout.agents) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      const tools = getStringList(fm.data, "tools");
      if (!tools) continue;
      const declared = new Set(tools);
      const survivesSet = new Set<string>();
      for (const t of declared) {
        if (t.startsWith("mcp__") || survivors.has(t)) survivesSet.add(t);
      }
      if (survivesSet.has("Write") || survivesSet.has("Edit")) continue;
      const lineNo = findTokenLine(text, "tools", fm.bodyStartLine);
      if (isSuppressed(sups, "CW002", lineNo)) continue;
      findings.push({
        ruleId: "CW002",
        severity: "error",
        path: rel(layout.root, path),
        line: lineNo,
        message: "agent has no persistence tool (Write or Edit) available in Cowork",
        suggestion: "Add 'Write' or 'Edit' to this agent's tools.",
      });
    }
    return findings;
  },
};
