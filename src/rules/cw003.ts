import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { escapeRegex, type Rule, rel } from "./_helpers.js";

export const CW003: Rule = {
  ruleId: "CW003",
  severity: "warn",
  summary: "SKILL.md uses bare $CLAUDE_PLUGIN_ROOT instead of ${CLAUDE_PLUGIN_ROOT}",
  check(layout, spec) {
    const target = spec.skill_frontmatter_invariants.env_var_substitution;
    const bare = target.unsupported_form.replace(/^\$/, "");
    const re = new RegExp(`\\$(?!\\{)${escapeRegex(bare)}(?![A-Za-z0-9_])`);
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      lines.forEach((line, idx) => {
        if (!re.test(line)) return;
        const lineNo = idx + 1;
        if (isSuppressed(sups, "CW003", lineNo)) return;
        findings.push({
          ruleId: "CW003",
          severity: "warn",
          path: rel(layout.root, path),
          line: lineNo,
          message: `bare '${target.unsupported_form}' found`,
          detail: target.reason ?? "",
          suggestion: `Use '${target.supported_form}' instead.`,
        });
      });
    }
    return findings;
  },
};
