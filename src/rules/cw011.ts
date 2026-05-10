/**
 * CW011 — plugin has hooks/hooks.json (won't fire in Cowork).
 *
 * Cowork's host-loop CLI launches with --setting-sources=user, which silently
 * excludes plugin-scoped hooks. Reports one finding per hook file present.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

export const CW011: Rule = {
  ruleId: "CW011",
  severity: "warn",
  summary: "Plugin has hooks/hooks.json — won't fire in Cowork",
  check(layout, _spec) {
    const findings: Finding[] = [];
    for (const path of layout.pluginHooksFiles) {
      const text = readFileSync(path, "utf-8");
      const sups = parseSuppressions(text.split("\n"));
      if (isSuppressed(sups, "CW011", 1)) continue;
      findings.push({
        ruleId: "CW011",
        severity: "warn",
        path: rel(layout.root, path),
        line: 1,
        message: "plugin-scoped hooks.json found",
        detail:
          "Cowork spawns the in-VM CLI with --setting-sources=user; plugin-scoped hooks DO NOT FIRE.",
        suggestion: "Move hooks to ~/.claude/settings.json (user scope).",
      });
    }
    return findings;
  },
};
