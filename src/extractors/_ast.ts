/**
 * Shared AST helpers for the Node-native bundle extractors.
 *
 * Parses a bundle source ONCE with @babel/parser, walks the AST ONCE to
 * populate a `symbolMap` (top-level identifier -> binding node), and exposes
 * `resolveStringSet` so each extractor can turn `new Set([H9, ...])` /
 * `[Bash, "Read"]` / similar into a flat list of string literal names.
 *
 * Why we don't use `path.scope.getBinding(name)`: in Bun-SEA bundles the CLI's
 * top-level `var` decls live inside an IIFE wrapper and Babel's scope
 * resolution misses them. Walking with our own index is both simpler and more
 * reliable for minified bundles.
 *
 * AMBIGUOUS sentinel: when `buildContext` sees the same identifier name bound
 * twice (e.g. `var H9 = "X"` AND `var H9 = "Y"` in different blocks), the
 * symbolMap stores a sentinel node. `resolveStringSet` returns `[]` on
 * encountering an AMBIGUOUS reference rather than picking one binding. Triple+
 * bindings stay AMBIGUOUS — once flipped, never resolved.
 */

import { parse } from "@babel/parser";
import type { NodePath, TraverseOptions } from "@babel/traverse";
import * as _traverseNS from "@babel/traverse";
import * as t from "@babel/types";

// `@babel/traverse` is CJS. Under NodeNext ESM `import * as` returns the
// module namespace, which has a `default` key whose value is the original
// CJS exports object — and the actual callable lives at `default.default`.
// Some bundlers/resolvers collapse one or both layers. Walk through up to
// two layers of `.default` indirection until we find a function. This keeps
// us resilient across @babel/traverse versions and downstream bundlers.
// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop dance documented above.
export function unwrapTraverse(mod: any): any {
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

/**
 * Resolved `@babel/traverse` callable. Exported so extractors share a single
 * unwrapped reference instead of each duplicating the ESM/CJS interop dance.
 */
export const traverse: TraverseFn = unwrapTraverse(_traverseNS) as TraverseFn;

/**
 * Sentinel stored in `symbolMap` when an identifier name is bound more than
 * once at the top level. We check by reference, not shape, so any unique
 * value works — using a frozen `t.Identifier` keeps everything `t.Node`-typed.
 */
export const AMBIGUOUS: t.Node = Object.freeze(t.identifier("__cwlint_ambiguous__")) as t.Node;

export interface ExtractContext {
  source: string;
  ast: t.File;
  /**
   * Map from identifier name to the node assigned to it (`var x = <node>`).
   * Stores `AMBIGUOUS` when the same name is bound more than once.
   */
  symbolMap: Map<string, t.Node>;
}

function record(symbolMap: Map<string, t.Node>, name: string, value: t.Node): void {
  const existing = symbolMap.get(name);
  if (existing === undefined) {
    symbolMap.set(name, value);
    return;
  }
  if (existing === AMBIGUOUS) {
    // already poisoned — stays poisoned
    return;
  }
  // second distinct binding -> ambiguous
  symbolMap.set(name, AMBIGUOUS);
}

/**
 * Parse the bundle and walk it once, populating the symbol index.
 *
 * Captures: `var foo = <expr>`, `let foo = <expr>`, `const foo = <expr>`, and
 * function declarations (`function foo() {}` -> the FunctionDeclaration node).
 * Plain assignments (`foo = <expr>` without a declarator) are NOT captured —
 * minified bundles use `var` for top-level constant strings, which is what we
 * resolve.
 */
export function buildContext(source: string): ExtractContext {
  const ast = parse(source, {
    sourceType: "unambiguous",
    errorRecovery: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowImportExportEverywhere: true,
    plugins: ["jsx"],
  });

  const symbolMap = new Map<string, t.Node>();
  // Names declared as bare `var X;` (no initializer). Tracked so the
  // AssignmentExpression visitor below can complete *exactly* the
  // forward-decl pattern and ignore unrelated reassignments.
  const forwardDecls = new Set<string>();

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      const id = path.node.id;
      const init = path.node.init;
      if (!t.isIdentifier(id)) return;
      if (init === null || init === undefined) {
        // Bare `var X;` — mark as forward-decl so a later `X = <rhs>`
        // assignment at module scope can complete the binding.
        forwardDecls.add(id.name);
        return;
      }
      record(symbolMap, id.name, init);
    },
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      const id = path.node.id;
      if (id !== null && id !== undefined && t.isIdentifier(id)) {
        record(symbolMap, id.name, path.node);
      }
    },
    // Bun-SEA bundles use forward `var X,Y,Z;` declarations followed later by
    // `X = new Set(...), Y = new Set([...X]), Z = ...` — sequence-expression
    // assignment chains inside a module-init helper. We only complete a
    // *pending* forward declaration: the assignment must use `=`, the LHS
    // must be a bare Identifier, and that identifier must currently be in
    // `forwardDecls`. Once consumed, drop it from `forwardDecls` so any
    // later reassignments (e.g. `X = "junk"` inside a function body) can't
    // poison the binding via `record()`'s "second distinct binding ->
    // AMBIGUOUS" rule.
    AssignmentExpression(path: NodePath<t.AssignmentExpression>) {
      if (path.node.operator !== "=") return;
      const left = path.node.left;
      if (!t.isIdentifier(left)) return;
      if (!forwardDecls.has(left.name)) return;
      record(symbolMap, left.name, path.node.right);
      forwardDecls.delete(left.name);
    },
  });

  return { source, ast, symbolMap };
}

/**
 * Resolve a node (or identifier reference, or array/Set with mixed members) to
 * a flat list of string literal names. Returns `[]` for nullish input or any
 * AMBIGUOUS reference encountered along the way.
 *
 * Supported shapes:
 *   - `t.StringLiteral` -> `[value]`
 *   - `t.Identifier` -> recurse on its symbolMap binding
 *   - `t.ArrayExpression` -> recurse on each element / spread argument
 *   - `t.NewExpression(Set, [arg])` -> recurse on the first argument
 *   - `t.SpreadElement` -> recurse on its argument
 *
 * Anything else is silently skipped.
 */
export function resolveStringSet(
  ctx: ExtractContext,
  node: t.Node | null | undefined,
  seen: Set<string> = new Set(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node === AMBIGUOUS) return [];

  if (t.isStringLiteral(node)) {
    return [node.value];
  }

  if (t.isIdentifier(node)) {
    if (seen.has(node.name)) return [];
    const bound = ctx.symbolMap.get(node.name);
    if (bound === undefined || bound === AMBIGUOUS) return [];
    const next = new Set(seen);
    next.add(node.name);
    return resolveStringSet(ctx, bound, next);
  }

  if (t.isArrayExpression(node)) {
    const out: string[] = [];
    for (const el of node.elements) {
      if (el === null) continue;
      if (t.isSpreadElement(el)) {
        out.push(...resolveStringSet(ctx, el.argument, seen));
        continue;
      }
      out.push(...resolveStringSet(ctx, el, seen));
    }
    return out;
  }

  if (t.isNewExpression(node)) {
    // `new Set([...])` — peek at the first argument
    const callee = node.callee;
    if (t.isIdentifier(callee) && callee.name === "Set") {
      const first = node.arguments[0];
      if (first !== undefined && (t.isExpression(first) || t.isSpreadElement(first))) {
        if (t.isSpreadElement(first)) {
          return resolveStringSet(ctx, first.argument, seen);
        }
        return resolveStringSet(ctx, first, seen);
      }
    }
    return [];
  }

  if (t.isSpreadElement(node)) {
    return resolveStringSet(ctx, node.argument, seen);
  }

  return [];
}
