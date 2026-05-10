/**
 * Host-loop tool gates (`Y2e`/`zvt` and `xUA`/`jie` in Claude.app bundles).
 *
 * Two array literals in the desktop bundle:
 *   - host_loop_safe_set: tools that survive the desktop pre-CLI filter.
 *     Anchor = ArrayExpression whose first six elements are exactly the
 *     literals "Task","Glob","Grep","Read","Edit","Write" (in that order).
 *     Spreads (`...e_`) are followed via `resolveStringSet`.
 *   - host_loop_excluded_builtins: built-ins explicitly stripped (replaced
 *     with mcp__workspace__* tools). Anchor = ArrayExpression of EXACTLY 5
 *     string literals whose set equals
 *     {Bash, NotebookEdit, REPL, JavaScript, WebFetch}.
 */

import type { NodePath, TraverseOptions } from "@babel/traverse";
import * as _traverseNS from "@babel/traverse";
import * as t from "@babel/types";

import type { ExtractContext } from "./_ast.js";
import { resolveStringSet } from "./_ast.js";

// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop dance — see _ast.ts
function unwrapTraverse(mod: any): any {
  let cur = mod;
  for (let i = 0; i < 4; i++) {
    if (typeof cur === "function") return cur;
    if (cur === null || cur === undefined) break;
    if (typeof cur.default !== "undefined") {
      cur = cur.default;
      continue;
    }
    break;
  }
  return cur;
}
type TraverseFn = (parent: t.Node, opts: TraverseOptions) => void;
const traverse: TraverseFn = unwrapTraverse(_traverseNS) as TraverseFn;

const SAFE_SET_PREFIX = ["Task", "Glob", "Grep", "Read", "Edit", "Write"] as const;
const EXCLUDED_BUILTINS = new Set(["Bash", "NotebookEdit", "REPL", "JavaScript", "WebFetch"]);
const REPLACEMENTS_HEURISTIC: Record<string, string> = {
  Bash: "mcp__workspace__bash",
  WebFetch: "mcp__workspace__web_fetch",
};

export interface NamedStringSet {
  names: string[];
  count: number;
}

export interface HostLoopExcludedBuiltins extends NamedStringSet {
  mcp_replacements: Record<string, string>;
}

export interface HostLoopFragment {
  host_loop_safe_set?: NamedStringSet;
  host_loop_excluded_builtins?: HostLoopExcludedBuiltins;
}

function arrayStartsWithLiterals(arr: t.ArrayExpression, prefix: readonly string[]): boolean {
  if (arr.elements.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    const el = arr.elements[i];
    if (el === null || el === undefined) return false;
    if (!t.isStringLiteral(el)) return false;
    if (el.value !== prefix[i]) return false;
  }
  return true;
}

function arrayIsExcludedBuiltinsSet(arr: t.ArrayExpression): string[] | null {
  if (arr.elements.length !== EXCLUDED_BUILTINS.size) return null;
  const names: string[] = [];
  for (const el of arr.elements) {
    if (el === null) return null;
    if (!t.isStringLiteral(el)) return null;
    names.push(el.value);
  }
  // exact set equality
  const seen = new Set(names);
  if (seen.size !== names.length) return null; // dupes shouldn't count
  for (const probe of EXCLUDED_BUILTINS) {
    if (!seen.has(probe)) return null;
  }
  return names;
}

export function extractHostLoop(ctx: ExtractContext): HostLoopFragment | null {
  const out: HostLoopFragment = {};

  traverse(ctx.ast, {
    ArrayExpression(path: NodePath<t.ArrayExpression>) {
      const node = path.node;

      // Excluded builtins: exactly-5 string-literal array.
      if (out.host_loop_excluded_builtins === undefined) {
        const excludedNames = arrayIsExcludedBuiltinsSet(node);
        if (excludedNames !== null) {
          const replacements: Record<string, string> = {};
          for (const n of excludedNames) {
            const r = REPLACEMENTS_HEURISTIC[n];
            if (r !== undefined) replacements[n] = r;
          }
          out.host_loop_excluded_builtins = {
            names: excludedNames,
            count: excludedNames.length,
            mcp_replacements: replacements,
          };
          return;
        }
      }

      // Safe set: starts with [Task, Glob, Grep, Read, Edit, Write, ...].
      if (out.host_loop_safe_set === undefined && arrayStartsWithLiterals(node, SAFE_SET_PREFIX)) {
        const names = resolveStringSet(ctx, node);
        if (names.length > 0) {
          out.host_loop_safe_set = { names, count: names.length };
        }
      }
    },
  });

  if (out.host_loop_safe_set === undefined && out.host_loop_excluded_builtins === undefined) {
    return null;
  }
  return out;
}

extractHostLoop.fieldName = "host_loop_tool_substitution" as const;
extractHostLoop.targetBundle = "desktop" as const;
