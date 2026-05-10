/**
 * CW004 — SKILL.md frontmatter sets a forbidden field.
 *
 * Compares each frontmatter key/value against spec.skill_frontmatter_invariants
 * .forbidden_fields. Currently flags `disable-model-invocation: true`.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { escapeRegex, type Rule, rel } from "./_helpers.js";

export const CW004: Rule = {
  ruleId: "CW004",
  severity: "error",
  summary: "SKILL.md frontmatter sets a forbidden field",
  check(layout, spec) {
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      for (const ff of spec.skill_frontmatter_invariants.forbidden_fields) {
        if (!(ff.field in fm.data) || fm.data[ff.field] !== ff.value) continue;
        const re = new RegExp(`^\\s*${escapeRegex(ff.field)}\\s*:`);
        let lineNo = fm.bodyStartLine;
        for (let i = fm.bodyStartLine - 1; i < lines.length; i++) {
          if (re.test(lines[i] ?? "")) {
            lineNo = i + 1;
            break;
          }
        }
        if (isSuppressed(sups, "CW004", lineNo)) continue;
        findings.push({
          ruleId: "CW004",
          severity: "error",
          path: rel(layout.root, path),
          line: lineNo,
          message: `frontmatter field '${ff.field}: true' blocks model-driven invocation of this skill`,
          detail:
            "Verified against Claude Code CLI 2.1.138: when present and true, the runtime " +
            "returns skill_invoke_model_disabled, preventing the model from invoking this skill. " +
            "Almost certainly not what you want for a skill in a public repo.",
          suggestion: `Remove \`${ff.field}: true\` from the frontmatter (the default is false).`,
        });
      }
    }
    return findings;
  },
};
