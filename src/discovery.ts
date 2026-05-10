/**
 * Locate skill/plugin/agent/hook/.mcp.json/commands files in a target repo.
 * Mirrors `cwlint.discovery`.
 */

import { readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  ".venv",
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
  ".tox",
  ".nox",
]);

export interface RepoLayout {
  root: string;
  skills: string[];
  plugins: string[];
  pluginHooksFiles: string[];
  agents: string[];
  settingsFiles: string[];
  mcpConfigs: string[];
  commands: string[];
}

export function discover(root: string): RepoLayout {
  const skills: string[] = [];
  const plugins: string[] = [];
  const pluginHooks: string[] = [];
  const agents: string[] = [];
  const settings: string[] = [];
  const mcpConfigs: string[] = [];
  const commands: string[] = [];

  for (const path of walk(root)) {
    const rel = relative(root, path);
    const name = basename(path);
    const parts = new Set(rel.split(sep).slice(0, -1));
    if (name === "SKILL.md") {
      skills.push(path);
    } else if (name === "plugin.json" && parts.has(".claude-plugin")) {
      plugins.push(path);
    } else if (name === "hooks.json" && parts.has("hooks")) {
      pluginHooks.push(path);
    } else if (
      (name === "settings.json" || name === "settings.local.json") &&
      parts.has(".claude")
    ) {
      settings.push(path);
    } else if (name === ".mcp.json") {
      mcpConfigs.push(path);
    } else if (parts.has("commands") && name.endsWith(".md")) {
      commands.push(path);
    } else if (parts.has("agents") && name.endsWith(".md")) {
      agents.push(path);
    }
  }

  return {
    root,
    skills: skills.sort(),
    plugins: plugins.sort(),
    pluginHooksFiles: pluginHooks.sort(),
    agents: agents.sort(),
    settingsFiles: settings.sort(),
    mcpConfigs: mcpConfigs.sort(),
    commands: commands.sort(),
  };
}

function* walk(dir: string): Iterable<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}
