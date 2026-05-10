/**
 * CW009 — agent declares an MCP tool whose server isn't registered.
 *
 * Checks each `mcp__<server>__<tool>` entry against the union of (a) the
 * `mcpServers` keys in any .mcp.json found in the repo, and (b) Cowork's
 * built-in MCP namespaces — sourced from the contract field
 * `host_loop_tool_substitution.cowork_builtin_mcp_servers.names`. v1.6608.2
 * lists 9 built-ins: cowork, cowork-onboarding, mcp-registry, plugins, radar,
 * scheduled-tasks, skills, terminal, workspace.
 */
import { readFileSync } from "node:fs";
import type { Finding } from "../findings.js";
import { findTokenLine, parseFrontmatter } from "../frontmatter.js";
import { isSuppressed, parseSuppressions } from "../suppression.js";
import { getStringList, type Rule, rel } from "./_helpers.js";

export const CW009: Rule = {
  ruleId: "CW009",
  severity: "info",
  summary: "Agent declares MCP tool whose server may not be registered",
  check(layout, spec) {
    const builtins = new Set<string>(
      spec.host_loop_tool_substitution.cowork_builtin_mcp_servers?.names ?? [],
    );
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
        if (!server || builtins.has(server) || registered.has(server)) continue;
        const lineNo = findTokenLine(text, tool, fm.bodyStartLine);
        if (isSuppressed(sups, "CW009", lineNo)) continue;
        const builtinList = [...builtins].sort().join(", ");
        findings.push({
          ruleId: "CW009",
          severity: "info",
          path: rel(layout.root, path),
          line: lineNo,
          message: `MCP tool '${tool}' requires server '${server}'`,
          detail: `No '.mcp.json' registers '${server}', and it isn't a Cowork built-in (${builtinList}).`,
          suggestion: `Register '${server}' in '.mcp.json' or document the dependency.`,
        });
      }
    }
    return findings;
  },
};
