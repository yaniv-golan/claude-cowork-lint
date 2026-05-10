/**
 * Extractor registry + dispatcher.
 *
 * `runExtractors(source, target)` parses the source ONCE via `buildContext`,
 * then dispatches each registered extractor matching `target` ('desktop' or
 * 'cli'). Each extractor returns either a JSON fragment or `null`; non-null
 * fragments are merged under their `fieldName` key.
 */

import type { ExtractContext } from "./_ast.js";
import { buildContext } from "./_ast.js";
import { extractHostLoop } from "./host-loop.js";
import { extractKernelEnvAllowlist } from "./kernel-env-allowlist.js";
import { extractSecretUnsetList } from "./secret-unset-list.js";
import { extractSubagentFilter } from "./subagent-filter.js";

export type BundleTarget = "desktop" | "cli";

interface RegisteredExtractor {
  fieldName: string;
  targetBundle: BundleTarget;
  run: (ctx: ExtractContext) => unknown;
}

const REGISTRY: RegisteredExtractor[] = [
  {
    fieldName: extractKernelEnvAllowlist.fieldName,
    targetBundle: extractKernelEnvAllowlist.targetBundle,
    run: extractKernelEnvAllowlist,
  },
  {
    fieldName: extractSecretUnsetList.fieldName,
    targetBundle: extractSecretUnsetList.targetBundle,
    run: extractSecretUnsetList,
  },
  {
    fieldName: extractHostLoop.fieldName,
    targetBundle: extractHostLoop.targetBundle,
    run: extractHostLoop,
  },
  {
    fieldName: extractSubagentFilter.fieldName,
    targetBundle: extractSubagentFilter.targetBundle,
    run: extractSubagentFilter,
  },
];

export function runExtractors(source: string, target: BundleTarget): Record<string, unknown> {
  const ctx = buildContext(source);
  const out: Record<string, unknown> = {};
  for (const ex of REGISTRY) {
    if (ex.targetBundle !== target) continue;
    const fragment = ex.run(ctx);
    if (fragment === null || fragment === undefined) continue;
    out[ex.fieldName] = fragment;
  }
  return out;
}

export { AMBIGUOUS, buildContext, type ExtractContext, resolveStringSet } from "./_ast.js";
