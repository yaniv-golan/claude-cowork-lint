/**
 * Public entry point for the Node.js port of `claude-cowork-lint`.
 *
 * v0.1: spec loader + CW001 only (proof of concept). v0.4 will fill in
 * CW002–CW012 plus discovery and the engine.
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
export { checkCw001 } from "./rules/cw001.js";
