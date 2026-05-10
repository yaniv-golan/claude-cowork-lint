/**
 * CW012 — plugin hooks declare events known broken in Cowork.
 *
 * Stronger signal than CW011 — flags specific event names (Stop, SessionStart,
 * SubagentStop, UserPromptSubmit, PostToolUse, SubagentStart) that the Cowork
 * runtime does not deliver to plugin-scoped handlers.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { escapeRegex, type Rule, rel } from "./_helpers.js";

const BROKEN_EVENTS = new Set([
  "SessionStart",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "UserPromptSubmit",
  "PostToolUse",
]);

export const CW012: Rule = {
  ruleId: "CW012",
  severity: "info",
  summary: "Plugin hooks declare events known broken in Cowork",
  check(layout, _spec) {
    const findings: Finding[] = [];
    for (const path of layout.pluginHooksFiles) {
      const text = readFileSync(path, "utf-8");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const hooksObj =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? ((payload as Record<string, unknown>).hooks ?? payload)
          : payload;
      if (!hooksObj || typeof hooksObj !== "object" || Array.isArray(hooksObj)) continue;
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      for (const event of Object.keys(hooksObj)) {
        if (!BROKEN_EVENTS.has(event)) continue;
        let lineNo = 1;
        const re = new RegExp(`"${escapeRegex(event)}"\\s*:`);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i] ?? "")) {
            lineNo = i + 1;
            break;
          }
        }
        if (isSuppressed(sups, "CW012", lineNo)) continue;
        findings.push({
          ruleId: "CW012",
          severity: "info",
          path: rel(layout.root, path),
          line: lineNo,
          message: `hook event '${event}' is silently broken in Cowork`,
          suggestion: "Move this hook to ~/.claude/settings.json (user scope).",
        });
      }
    }
    return findings;
  },
};
