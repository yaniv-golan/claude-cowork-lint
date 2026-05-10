/**
 * Public entry point for the Node.js port of `claude-cowork-lint`.
 *
 * v0.1: full rule parity with the Python package — CW001–CW006, CW008–CW012
 * (CW007 reserved/deferred). Reads the same `contracts/cowork-v*.json`.
 */

export { loadDefaultSpec, loadSpec } from "./spec.js";
export type {
  ForbiddenField,
  HostLoopExcludedBuiltins,
  HostLoopToolSubstitution,
  KernelEnvPassthrough,
  NamedStringSet,
  SkillFrontmatterInvariants,
  Spec,
  SubagentToolFilter,
} from "./spec.js";
export type { Finding, Report, Severity } from "./findings.js";
export { exitCode, hasErrors, summarise } from "./findings.js";
export { discover } from "./discovery.js";
export type { RepoLayout } from "./discovery.js";
export { ALL_RULES } from "./rules.js";
export type { Rule } from "./rules.js";
export { checkRepo } from "./engine.js";
export { isSuppressed, parseSuppressions } from "./suppression.js";
export type { Suppression } from "./suppression.js";
