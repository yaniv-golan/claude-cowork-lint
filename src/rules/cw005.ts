/**
 * CW005 — SKILL.md frontmatter explicitly opts out of user invocability.
 *
 * Background (verified against Claude.app 1.6608.2 desktop bundle):
 * the runtime parses `user-invocable` as
 * `(value?.toLowerCase() !== "false")` — meaning the field DEFAULTS to
 * `true` when absent, and only the literal string `"false"` opts a skill
 * out. Anthropic's own 17 official skills omit this field entirely; the
 * earlier "missing → fire CW005" interpretation was a bug that produced
 * 17/17 false positives on dogfood.
 *
 * This rule now fires only when a skill EXPLICITLY sets `user-invocable: false`
 * (the actual user-visible footgun: an author who copy-pasted the field
 * thinking they needed to opt-IN, and got the polarity wrong).
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

function isExplicitFalse(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === "string" && value.toLowerCase() === "false") return true;
  return false;
}

export const CW005: Rule = {
  ruleId: "CW005",
  severity: "warn",
  summary: "SKILL.md explicitly opts out of user invocability",
  check(layout, spec) {
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      for (const field of spec.skill_frontmatter_invariants.required_fields) {
        if (!(field in fm.data)) continue; // absent → defaults to true → no finding
        if (!isExplicitFalse(fm.data[field])) continue;
        const lineNo = fm.bodyStartLine;
        if (isSuppressed(sups, "CW005", lineNo)) continue;
        findings.push({
          ruleId: "CW005",
          severity: "warn",
          path: rel(layout.root, path),
          line: lineNo,
          message: `frontmatter field '${field}' is explicitly set to false`,
          detail:
            "The runtime defaults this field to true. Setting it to false opts the skill out " +
            "of user invocability — common mistake when an author thinks they need to opt IN.",
          suggestion: `Remove \`${field}: false\` (or change to \`${field}: true\`) in the SKILL.md frontmatter.`,
        });
      }
    }
    return findings;
  },
};
