/**
 * Secret-unset list extractor (`ljt`-style symbol; `OPERON_SECRET_VARS`).
 *
 * Anchor: an `ArrayExpression` whose string-literal members include the unique
 * triple `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPERON_EZPROXY_COOKIE`.
 *
 * Output shape:
 *   { names: string[], count: number }
 */

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { ExtractContext } from "./_ast.js";
import { traverse } from "./_ast.js";

const ANCHOR_TRIPLE = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPERON_EZPROXY_COOKIE"] as const;

export interface SecretUnsetListFragment {
  names: string[];
  count: number;
}

export function extractSecretUnsetList(ctx: ExtractContext): SecretUnsetListFragment | null {
  let result: SecretUnsetListFragment | null = null;

  traverse(ctx.ast, {
    ArrayExpression(path: NodePath<t.ArrayExpression>) {
      if (result !== null) {
        path.stop();
        return;
      }
      const names: string[] = [];
      for (const el of path.node.elements) {
        if (el === null) continue;
        if (!t.isStringLiteral(el)) return; // mixed-content array; skip
        names.push(el.value);
      }
      // anchor triple
      for (const probe of ANCHOR_TRIPLE) {
        if (!names.includes(probe)) return;
      }
      // The Python reference filters to UPPERCASE-only names. Real bundles
      // contain only such names in this array, so for parity we keep them all
      // (they're all upper-case in practice; matches Python's
      // `[A-Z][A-Z0-9_]*` filter).
      const filtered = names.filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n));
      result = { names: filtered, count: filtered.length };
      path.stop();
    },
  });

  return result;
}

extractSecretUnsetList.fieldName = "secret_unset_list" as const;
extractSecretUnsetList.targetBundle = "desktop" as const;
