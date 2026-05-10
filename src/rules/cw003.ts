/**
 * CW003 — SKILL.md uses bare `$CLAUDE_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_DATA`
 * instead of the braced `${...}` form.
 *
 * The Claude.app runtime substitutes the braced forms via a literal regex on
 * `\$\{CLAUDE_PLUGIN_ROOT\}` and `\$\{CLAUDE_PLUGIN_DATA\}` before launching
 * the skill's shell, so the bare form only works when the underlying shell
 * also happens to inherit the env var. Some argv-context invocations don't
 * spawn a shell at all, so the bare form silently expands to the empty
 * string. The braced form is the spec-supported one for both vars.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { type Rule, rel } from "./_helpers.js";

// Env vars the runtime substitutes via `${...}` interpolation. The bare-vs-
// braced semantics are identical for both: the runtime regex only matches
// the braced form, so `$CLAUDE_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_DATA` fall
// through to shell expansion (or the empty string in argv contexts).
//
// `${user_config.*}` is also substituted by the runtime but uses a different
// (parameter-interpolation) code path; it is intentionally NOT covered here.
const ENV_VARS = ["CLAUDE_PLUGIN_ROOT", "CLAUDE_PLUGIN_DATA"] as const;

// Match `$NAME` not followed by `{` (so we don't false-match the braced
// form), and not followed by another identifier character (so `$FOO_OTHER`
// does not match `$FOO`). Capture the env-var name for the message.
const BARE_RE = new RegExp(`\\$(?!\\{)(${ENV_VARS.join("|")})(?![A-Za-z0-9_])`, "g");

export const CW003: Rule = {
  ruleId: "CW003",
  severity: "warn",
  summary: "SKILL.md uses bare `$CLAUDE_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_DATA` instead of `${...}`",
  check(layout, spec) {
    const target = spec.skill_frontmatter_invariants.env_var_substitution;
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        for (const m of line.matchAll(BARE_RE)) {
          const envVar = m[1] ?? "";
          if (isSuppressed(sups, "CW003", lineNo)) continue;
          findings.push({
            ruleId: "CW003",
            severity: "warn",
            path: rel(layout.root, path),
            line: lineNo,
            message: `bare $${envVar} relies on shell expansion; use \${${envVar}} for guaranteed substitution`,
            detail: target.reason ?? "",
            suggestion: `Use '\${${envVar}}' instead.`,
          });
        }
      });
    }
    return findings;
  },
};
