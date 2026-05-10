/**
 * CW010 — plugin userConfig option name matches a legacy reserved kernel-secret
 * name (e.g. ANTHROPIC_API_KEY).
 *
 * History: in older Claude.app versions, the Operon kernel imposed strict
 * validation on user-secret names (regex, max-length, reserved-literal set
 * including ANTHROPIC_API_KEY, DATABASE_URL, etc.). Verified against
 * Claude.app 1.6608.2: the OperonSecrets IPC and the entire user-secrets
 * subsystem have been removed (zero occurrences of `OperonSecrets` /
 * `claude.operon` in the desktop bundle — see
 * `docs/internal/CONTRACT-AUDIT-1.6608.2.md`). Plugin `userConfig` is now
 * validated by the extension manifest schema, not the contract field this
 * rule reads.
 *
 * The rule stays useful as a hygiene check (using a reserved-looking name
 * like ANTHROPIC_API_KEY for your plugin's config field is still bad
 * practice, even if the runtime no longer rejects it). Severity demoted to
 * `info` to reflect the lack of runtime enforcement. Marked `deprecated` in
 * `src/rules/_meta.ts`.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { escapeRegex, type Rule, rel } from "./_helpers.js";

export const CW010: Rule = {
  ruleId: "CW010",
  severity: "info",
  summary: "Plugin userConfig option name matches a legacy reserved kernel-secret name",
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
        const example = optionName.startsWith("ANTHROPIC_")
          ? optionName.replace(/^ANTHROPIC_/, "MY_PLUGIN_")
          : `MY_PLUGIN_${optionName.replace(/^[^A-Za-z]+/, "")}`;
        findings.push({
          ruleId: "CW010",
          severity: "info",
          path: rel(layout.root, path),
          line: lineNo,
          message: `userConfig name '${optionName}' overlaps a legacy Operon reserved name`,
          detail:
            "The Operon kernel-secrets validation that originally enforced this " +
            "is gone in Claude.app 1.6608.2. The name is no longer rejected at " +
            "runtime, but using high-entropy reserved names like ANTHROPIC_API_KEY " +
            "for plugin config remains poor hygiene. (Underlying violations: " +
            `${violations.join("; ")}.)`,
          suggestion: `Rename to something plugin-specific, e.g. \`${example}\`.`,
        });
      }
    }
    return findings;
  },
};
