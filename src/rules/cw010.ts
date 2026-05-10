import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { escapeRegex, type Rule, rel } from "./_helpers.js";

export const CW010: Rule = {
  ruleId: "CW010",
  severity: "error",
  summary: "Plugin userConfig option name violates user-secret validation rules",
  check(layout, spec) {
    const rules = spec.user_secrets_injection?.validation;
    if (!rules) return [];
    const nameRe = new RegExp(rules.name_regex);
    const reserved = new Set(rules.reserved_name_literals);
    const findings: Finding[] = [];
    for (const path of layout.plugins) {
      const text = readFileSync(path, "utf-8");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const userConfig =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).userConfig
          : null;
      if (!userConfig || typeof userConfig !== "object" || Array.isArray(userConfig)) continue;
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      for (const optionName of Object.keys(userConfig)) {
        const violations: string[] = [];
        if (!nameRe.test(optionName)) violations.push(`does not match regex ${rules.name_regex}`);
        if (optionName.length > rules.name_max_length)
          violations.push(`length ${optionName.length} > ${rules.name_max_length}`);
        if (reserved.has(optionName.toUpperCase()))
          violations.push(`reserved name '${optionName.toUpperCase()}'`);
        if (violations.length === 0) continue;
        let lineNo = 1;
        const re = new RegExp(`"${escapeRegex(optionName)}"\\s*:`);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i] ?? "")) {
            lineNo = i + 1;
            break;
          }
        }
        if (isSuppressed(sups, "CW010", lineNo)) continue;
        findings.push({
          ruleId: "CW010",
          severity: "error",
          path: rel(layout.root, path),
          line: lineNo,
          message: `userConfig option name '${optionName}': ${violations[0]}`,
          detail: violations.join("; "),
          suggestion: "Use [A-Za-z][A-Za-z0-9_]* (≤128 chars), avoid reserved names.",
        });
      }
    }
    return findings;
  },
};
