/**
 * Kernel-env allowlist extractor (`MGn`-style symbol in v1.6259+).
 *
 * Anchor: a `new Set([...])` literal whose body contains the unique triple
 * "HOME", "PATH", "OPERON_SECRET_VARS". That triple uniquely identifies
 * `MGn` across observed Claude.app builds.
 *
 * Output shape (matches Python reference):
 *   {
 *     allowlist: string[],
 *     deleted_after_filter: string[]   // intersection with HOME/USER/LOGNAME/TMPDIR
 *   }
 */

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { ExtractContext } from "./_ast.js";
import { traverse } from "./_ast.js";

const DELETED_AFTER_FILTER_PROBE = ["HOME", "USER", "LOGNAME", "TMPDIR"] as const;

export interface KernelEnvAllowlistFragment {
  allowlist: string[];
  deleted_after_filter: string[];
}

export function extractKernelEnvAllowlist(ctx: ExtractContext): KernelEnvAllowlistFragment | null {
  let result: KernelEnvAllowlistFragment | null = null;

  traverse(ctx.ast, {
    NewExpression(path: NodePath<t.NewExpression>) {
      if (result !== null) {
        path.stop();
        return;
      }
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || callee.name !== "Set") return;
      const arg = path.node.arguments[0];
      if (arg === undefined || !t.isArrayExpression(arg)) return;

      // Cheap pre-filter: the literal-string members must include the unique
      // triple. We walk the elements once and collect the literal names.
      const names: string[] = [];
      for (const el of arg.elements) {
        if (el === null) continue;
        if (t.isStringLiteral(el)) names.push(el.value);
      }
      if (
        !names.includes("HOME") ||
        !names.includes("PATH") ||
        !names.includes("OPERON_SECRET_VARS")
      ) {
        return;
      }

      result = {
        allowlist: names,
        deleted_after_filter: DELETED_AFTER_FILTER_PROBE.filter((n) => names.includes(n)),
      };
      path.stop();
    },
  });

  return result;
}

extractKernelEnvAllowlist.fieldName = "kernel_env_passthrough" as const;
extractKernelEnvAllowlist.targetBundle = "desktop" as const;
