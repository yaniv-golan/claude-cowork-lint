/**
 * Typed spec loader — Node.js port of `cwlint.spec`.
 * Reads the same `contracts/cowork-v*.json` files the Python package does.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface NamedStringSet {
  names: string[];
}

export interface HostLoopExcludedBuiltins {
  names: string[];
  mcp_replacements: Record<string, string>;
}

export interface HostLoopToolSubstitution {
  host_loop_safe_set: NamedStringSet;
  host_loop_excluded_builtins: HostLoopExcludedBuiltins;
  renderer_dependent_extra_drops?: NamedStringSet;
}

export interface SubagentToolFilter {
  drop_set: NamedStringSet;
  non_builtin_extra_drop_set: NamedStringSet;
  async_dispatch_allowlist: NamedStringSet;
  experimental_fallback_allowlist: NamedStringSet;
  fork_subagent_allowlist: NamedStringSet;
}

export interface KernelEnvPassthrough {
  allowlist: string[];
  deleted_after_filter: string[];
}

export interface ForbiddenField {
  field: string;
  value: unknown;
  reason: string;
}

export interface SkillFrontmatterInvariants {
  required_fields: string[];
  forbidden_fields: ForbiddenField[];
  env_var_substitution: {
    supported_form: string;
    unsupported_form: string;
    reason?: string;
  };
}

export interface UserSecretsValidation {
  name_regex: string;
  name_uppercased?: boolean;
  name_max_length: number;
  value_max_bytes: number;
  reserved_name_literals: string[];
}

export interface UserSecretsInjection {
  validation: UserSecretsValidation;
}

export interface Spec {
  spec_version: string;
  claude_app_version: string;
  claude_cli_version?: string;
  operon_core_version: string;
  subagent_tool_filter: SubagentToolFilter;
  host_loop_tool_substitution: HostLoopToolSubstitution;
  kernel_env_passthrough: KernelEnvPassthrough;
  skill_frontmatter_invariants: SkillFrontmatterInvariants;
  user_secrets_injection: UserSecretsInjection;
  secret_unset_list: NamedStringSet;
  // Other fields from the JSON are preserved but not typed strictly.
  [key: string]: unknown;
}

export function loadSpec(path: string): Spec {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  if (raw.spec_version !== "0") {
    throw new Error(`Unsupported spec_version ${raw.spec_version}; this build supports '0' only`);
  }
  return raw as Spec;
}

export function loadDefaultSpec(): Spec {
  // Resolve `contracts/` next to the published package, or two levels up in dev.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "contracts"),
    join(here, "..", "..", "..", "..", "contracts"),
  ];
  for (const dir of candidates) {
    try {
      const files = readdirSync(dir)
        .filter((f) => f.startsWith("cowork-v") && f.endsWith(".json"))
        .sort()
        .reverse();
      if (files.length > 0) {
        return loadSpec(join(dir, files[0]!));
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error("No bundled cowork-v*.json contract found");
}
