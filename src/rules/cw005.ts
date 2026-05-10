/**
 * CW005 — SKILL.md missing required frontmatter field.
 *
 * Treats both an absent field and one explicitly set to false as triggers.
 * Currently checks `user-invocable`.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

export const CW005: Rule = {
  ruleId: "CW005",
  severity: "warn",
  summary: "SKILL.md missing required frontmatter field",
  check(layout, spec) {
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      for (const field of spec.skill_frontmatter_invariants.required_fields) {
        if (fm && field in fm.data && fm.data[field] !== false) continue;
        const lineNo = fm ? fm.bodyStartLine : 1;
        if (isSuppressed(sups, "CW005", lineNo)) continue;
        findings.push({
          ruleId: "CW005",
          severity: "warn",
          path: rel(layout.root, path),
          line: lineNo,
          message: `required frontmatter field '${field}' missing or false`,
          suggestion: `Add \`${field}: true\` to the SKILL.md frontmatter.`,
        });
      }
    }
    return findings;
  },
};
