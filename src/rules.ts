/**
 * All CW001–CW012 rule implementations (CW007 reserved/deferred).
 *
 * One file rather than one-per-rule because TypeScript's small-module overhead
 * would dwarf the per-rule body. The Python package uses a more granular
 * structure for testability; for the Node port we co-locate.
 */

import { readFileSync } from "node:fs";
import { relative, basename } from "node:path";
import type { Finding, Severity } from "./findings.js";
import type { Spec } from "./spec.js";
import type { RepoLayout } from "./discovery.js";
import { findTokenLine, parseFrontmatter } from "./frontmatter.js";
import { isSuppressed, parseSuppressions } from "./suppression.js";

export interface Rule {
  ruleId: string;
  severity: Severity;
  summary: string;
  check(layout: RepoLayout, spec: Spec): Finding[];
}

function subagentSurvivors(spec: Spec): Set<string> {
  const f = spec.subagent_tool_filter;
  const h = spec.host_loop_tool_substitution;
  const asyncAllow = new Set(f.async_dispatch_allowlist.names);
  const dropSet = new Set(f.drop_set.names);
  const hostExcluded = new Set(h.host_loop_excluded_builtins.names);
  const out = new Set<string>();
  for (const n of asyncAllow) {
    if (!hostExcluded.has(n) && !dropSet.has(n)) out.add(n);
  }
  return out;
}

function rel(layoutRoot: string, path: string): string {
  return relative(layoutRoot, path);
}

function getStringList(fm: Record<string, unknown>, key: string): string[] | null {
  const v = fm[key];
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

// ---------- CW001 ----------
export const CW001: Rule = {
  ruleId: "CW001",
  severity: "error",
  summary: "Agent declares a tool stripped by Cowork's runtime gates",
  check(layout, spec) {
    const survivors = subagentSurvivors(spec);
    const f = spec.subagent_tool_filter;
    const h = spec.host_loop_tool_substitution;
    const dropSet = new Set(f.drop_set.names);
    const hostExcluded = new Set(h.host_loop_excluded_builtins.names);
    const asyncAllow = new Set(f.async_dispatch_allowlist.names);
    const replacements = h.host_loop_excluded_builtins.mcp_replacements;

    const findings: Finding[] = [];
    for (const path of layout.agents) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      const tools = getStringList(fm.data, "tools");
      if (!tools) continue;

      for (const tool of tools) {
        if (tool.startsWith("mcp__")) continue;
        if (survivors.has(tool)) continue;
        const lineNo = findTokenLine(text, tool, fm.bodyStartLine);
        if (isSuppressed(sups, "CW001", lineNo)) continue;
        let detail: string;
        let suggestion: string;
        if (dropSet.has(tool)) {
          detail = "name is in the always-dropped set; never reaches a sub-agent.";
          suggestion = `Remove '${tool}' from this agent's tools.`;
        } else if (hostExcluded.has(tool)) {
          const repl = replacements[tool];
          detail = repl
            ? `excluded from registered built-ins in Cowork mode; use '${repl}' instead.`
            : "excluded from registered built-ins in Cowork mode.";
          suggestion = repl
            ? `Replace '${tool}' with '${repl}' in this agent's tools.`
            : `Remove '${tool}' from this agent's tools.`;
        } else if (!asyncAllow.has(tool)) {
          detail = "not in the async-dispatch allowlist (Ys_/LW8).";
          suggestion = `Remove '${tool}' or replace with an allowlist member.`;
        } else {
          detail = "not in sub-agent survivor set";
          suggestion = `Remove '${tool}'.`;
        }
        findings.push({
          ruleId: "CW001",
          severity: "error",
          path: rel(layout.root, path),
          line: lineNo,
          message: `tool '${tool}' will not be available to a Cowork sub-agent`,
          detail,
          suggestion,
        });
      }
    }
    return findings;
  },
};

// ---------- CW002 ----------
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

// ---------- CW003 ----------
export const CW003: Rule = {
  ruleId: "CW003",
  severity: "warn",
  summary: "SKILL.md uses bare $CLAUDE_PLUGIN_ROOT instead of ${CLAUDE_PLUGIN_ROOT}",
  check(layout, spec) {
    const target = spec.skill_frontmatter_invariants.env_var_substitution;
    const bare = target.unsupported_form.replace(/^\$/, "");
    const re = new RegExp(`\\$(?!\\{)${escape(bare)}(?![A-Za-z0-9_])`);
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

// ---------- CW004 ----------
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
        const re = new RegExp(`^\\s*${escape(ff.field)}\\s*:`);
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
          message: `forbidden frontmatter field '${ff.field}' = ${JSON.stringify(ff.value)}`,
          detail: ff.reason,
          suggestion: `Remove \`${ff.field}: ${JSON.stringify(ff.value)}\` from frontmatter.`,
        });
      }
    }
    return findings;
  },
};

// ---------- CW005 ----------
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

// ---------- CW006 ----------
const TOOL_TOKEN = /\b([A-Z][a-zA-Z]{1,39})\b/g;

export const CW006: Rule = {
  ruleId: "CW006",
  severity: "warn",
  summary: "Hook command references a tool name not in any allowlist (typo detector)",
  check(layout, spec) {
    const known = buildKnownTools(spec);
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const path of [...layout.pluginHooksFiles, ...layout.settingsFiles]) {
      const text = readFileSync(path, "utf-8");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      walkStrings(payload, (s) => {
        const m = TOOL_TOKEN.exec(s);
        TOOL_TOKEN.lastIndex = 0;
        if (!m) return;
        for (const match of s.matchAll(/\b([A-Z][a-zA-Z]{1,39})\b/g)) {
          const candidate = match[1] ?? "";
          if (!candidate || known.has(candidate)) continue;
          const suggestion = closestMatch(candidate, known);
          if (!suggestion) continue;
          const key = `${path}:${candidate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let lineNo = 1;
          for (let i = 0; i < lines.length; i++) {
            if ((lines[i] ?? "").includes(candidate)) {
              lineNo = i + 1;
              break;
            }
          }
          if (isSuppressed(sups, "CW006", lineNo)) continue;
          findings.push({
            ruleId: "CW006",
            severity: "warn",
            path: rel(layout.root, path),
            line: lineNo,
            message: `unknown tool name '${candidate}' — did you mean '${suggestion}'?`,
            suggestion: `Replace '${candidate}' with '${suggestion}'.`,
          });
        }
      });
    }
    return findings;
  },
};

function buildKnownTools(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const n of spec.subagent_tool_filter.async_dispatch_allowlist.names) out.add(n);
  for (const n of spec.subagent_tool_filter.drop_set.names) out.add(n);
  for (const n of spec.subagent_tool_filter.fork_subagent_allowlist.names) out.add(n);
  for (const n of spec.subagent_tool_filter.experimental_fallback_allowlist.names) out.add(n);
  for (const n of spec.host_loop_tool_substitution.host_loop_safe_set.names) out.add(n);
  for (const n of spec.host_loop_tool_substitution.host_loop_excluded_builtins.names) out.add(n);
  return out;
}

function closestMatch(s: string, known: Set<string>): string | null {
  // Mirror Python's difflib semantics: similarity ratio = 2 * LCS / (len(a) + len(b)).
  // Threshold 0.7 keeps "WriteFile" -> "Write" (0.71) and rejects "Docker" -> any.
  let best: { name: string; ratio: number } | null = null;
  for (const k of known) {
    const r = ratio(s, k);
    if (r >= 0.7 && (best === null || r > best.ratio)) {
      best = { name: k, ratio: r };
    }
  }
  return best ? best.name : null;
}

function ratio(a: string, b: string): number {
  if (a === b) return 1;
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * lcs(a, b)) / total;
}

function lcs(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? (prev[j - 1] ?? 0) + 1
          : Math.max(prev[j] ?? 0, cur[j - 1] ?? 0);
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return prev[n] ?? 0;
}

function walkStrings(node: unknown, cb: (s: string) => void): void {
  if (typeof node === "string") {
    cb(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) walkStrings(v, cb);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) walkStrings(v, cb);
  }
}

// ---------- CW008 ----------
const DISPATCH_CUES: RegExp[] = [
  /\bsubagent_type\s*[:=]/,
  /\bTask\s*\(/,
  /(?<![\w/])\/bg(?![\w/])/,
  /(?<![\w/])\/background(?![\w/])/,
  /(?<![\w/])\/fork(?![\w/])/,
  /\bspawn_subagent\b/,
  /\brun_in_background\s*[:=]\s*true/,
];
const BASH_FENCE = /^```(?:bash|sh|shell)\b/i;
const MAIN_THREAD = /main[- ]thread/i;

export const CW008: Rule = {
  ruleId: "CW008",
  severity: "warn",
  summary: "Sub-agent dispatch cue followed by a fenced bash block within 30 lines",
  check(layout, _spec) {
    const findings: Finding[] = [];
    for (const path of layout.skills) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const cueLines: number[] = [];
      lines.forEach((line, idx) => {
        for (const cue of DISPATCH_CUES) {
          if (cue.test(line)) {
            cueLines.push(idx + 1);
            break;
          }
        }
      });
      for (const cueLine of cueLines) {
        const end = Math.min(cueLine + 30, lines.length);
        for (let fenceIdx = cueLine + 1; fenceIdx <= end; fenceIdx++) {
          if (!BASH_FENCE.test(lines[fenceIdx - 1] ?? "")) continue;
          const preStart = Math.max(0, fenceIdx - 1 - 3);
          const preWindow = lines.slice(preStart, fenceIdx - 1);
          if (preWindow.some((l) => MAIN_THREAD.test(l))) break;
          if (isSuppressed(sups, "CW008", fenceIdx)) break;
          findings.push({
            ruleId: "CW008",
            severity: "warn",
            path: rel(layout.root, path),
            line: fenceIdx,
            message: "bash block follows a sub-agent dispatch cue",
            detail: `Cue at line ${cueLine}; bash is stripped from Cowork sub-agents.`,
            suggestion:
              "If main-thread, add a 'main-thread' comment within 3 lines above the fence; otherwise use mcp__workspace__bash.",
          });
          break;
        }
      }
    }
    return findings;
  },
};

// ---------- CW009 ----------
const BUILTIN_MCP_SERVERS = new Set(["workspace", "cowork", "cowork-onboarding"]);

export const CW009: Rule = {
  ruleId: "CW009",
  severity: "info",
  summary: "Agent declares MCP tool whose server may not be registered",
  check(layout, _spec) {
    const registered = new Set<string>();
    for (const cfg of layout.mcpConfigs) {
      try {
        const payload = JSON.parse(readFileSync(cfg, "utf-8"));
        const servers = payload?.mcpServers;
        if (servers && typeof servers === "object") {
          for (const name of Object.keys(servers)) registered.add(name);
        }
      } catch {
        /* ignore */
      }
    }
    const findings: Finding[] = [];
    for (const path of layout.agents) {
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");
      const sups = parseSuppressions(lines);
      const fm = parseFrontmatter(text);
      if (!fm) continue;
      const tools = getStringList(fm.data, "tools");
      if (!tools) continue;
      for (const tool of tools) {
        if (!tool.startsWith("mcp__")) continue;
        const segments = tool.split("__", 3);
        if (segments.length < 3) continue;
        const server = segments[1];
        if (!server || BUILTIN_MCP_SERVERS.has(server) || registered.has(server)) continue;
        const lineNo = findTokenLine(text, tool, fm.bodyStartLine);
        if (isSuppressed(sups, "CW009", lineNo)) continue;
        findings.push({
          ruleId: "CW009",
          severity: "info",
          path: rel(layout.root, path),
          line: lineNo,
          message: `MCP tool '${tool}' requires server '${server}'`,
          detail: `No '.mcp.json' registers '${server}', and it isn't a Cowork built-in (workspace, cowork, cowork-onboarding).`,
          suggestion: `Register '${server}' in '.mcp.json' or document the dependency.`,
        });
      }
    }
    return findings;
  },
};

// ---------- CW010 ----------
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
        const re = new RegExp(`"${escape(optionName)}"\\s*:`);
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

// ---------- CW011 ----------
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

// ---------- CW012 ----------
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
        const re = new RegExp(`"${escape(event)}"\\s*:`);
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

export const ALL_RULES: Rule[] = [
  CW001,
  CW002,
  CW003,
  CW004,
  CW005,
  CW006,
  CW008,
  CW009,
  CW010,
  CW011,
  CW012,
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
