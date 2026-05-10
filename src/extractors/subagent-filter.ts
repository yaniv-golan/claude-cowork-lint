/**
 * Sub-agent tool filter extractor — CLI bundle (`LW8`/`gz8`/`Ys_` etc.).
 *
 * Anchor: a `FunctionDeclaration` whose first parameter is an `ObjectPattern`
 * destructuring `{tools, isBuiltIn, isAsync, permissionMode}` (in any order).
 * That destructure signature is unique to this filter function.
 *
 * Once we have the function:
 *   - Capture parameter names bound to `isAsync` and `isBuiltIn`. The minified
 *     bundle uses local names like `q` for isAsync and `_` for isBuiltIn.
 *   - In the body, find:
 *       drop_set:                  if(SYM.has(...)) return false   (no isAsync/isBuiltIn on lhs)
 *       async_dispatch_allowlist:  if(<isAsyncVar> && !SYM.has(...)) return false
 *       non_builtin_extra_drop_set: if(!<isBuiltInVar> && SYM.has(...)) return false
 *
 * Each SYM is then resolved via `resolveStringSet` to a flat list of strings.
 *
 * Output shape (matches Python reference):
 *   {
 *     filter_fn_symbol: string,
 *     drop_set?:                  { names, count, symbol },
 *     async_dispatch_allowlist?:  { names, count, symbol },
 *     non_builtin_extra_drop_set?:{ names, count, symbol },
 *   }
 */

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { ExtractContext } from "./_ast.js";
import { resolveStringSet, traverse } from "./_ast.js";

const REQUIRED_KEYS = new Set(["tools", "isBuiltIn", "isAsync", "permissionMode"]);

interface NamedStringSetWithSymbol {
  names: string[];
  count: number;
  symbol: string;
}

export interface SubagentFilterFragment {
  filter_fn_symbol: string;
  drop_set?: NamedStringSetWithSymbol;
  async_dispatch_allowlist?: NamedStringSetWithSymbol;
  non_builtin_extra_drop_set?: NamedStringSetWithSymbol;
}

interface FilterSignature {
  fnName: string;
  body: t.BlockStatement;
  isAsyncVar: string | null;
  isBuiltInVar: string | null;
}

/**
 * Match `{tools: T, isBuiltIn: B, isAsync: Q = false, permissionMode: P}` and
 * return the local var names bound to isAsync / isBuiltIn (or null if the
 * destructured key uses shorthand, in which case the var name equals the key).
 */
function matchFilterParam(
  param: t.ObjectPattern,
): { isAsyncVar: string; isBuiltInVar: string } | null {
  const seen = new Map<string, string>(); // key -> local var name
  for (const prop of param.properties) {
    if (!t.isObjectProperty(prop)) return null;
    const key = prop.key;
    if (!t.isIdentifier(key)) return null;
    if (!REQUIRED_KEYS.has(key.name)) return null;

    // The value can be:
    //   - Identifier (`isAsync: q`)
    //   - AssignmentPattern (`isAsync: q = !1`)
    //   - In shorthand, `isAsync` (Identifier with same name as key)
    let valueNode: t.Node = prop.value;
    if (t.isAssignmentPattern(valueNode)) {
      valueNode = valueNode.left;
    }
    if (!t.isIdentifier(valueNode)) return null;
    seen.set(key.name, valueNode.name);
  }
  if (seen.size !== REQUIRED_KEYS.size) return null;
  const isAsyncVar = seen.get("isAsync");
  const isBuiltInVar = seen.get("isBuiltIn");
  if (isAsyncVar === undefined || isBuiltInVar === undefined) return null;
  return { isAsyncVar, isBuiltInVar };
}

/**
 * Locate the named filter function. Walks top-level declarations + nested
 * function declarations (Bun-SEA wraps everything in IIFEs).
 */
function findFilterFn(ctx: ExtractContext): FilterSignature | null {
  let result: FilterSignature | null = null;

  traverse(ctx.ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (result !== null) {
        path.stop();
        return;
      }
      const id = path.node.id;
      if (id === null || id === undefined) return;
      const firstParam = path.node.params[0];
      if (firstParam === undefined || !t.isObjectPattern(firstParam)) return;
      const matched = matchFilterParam(firstParam);
      if (matched === null) return;
      result = {
        fnName: id.name,
        body: path.node.body,
        isAsyncVar: matched.isAsyncVar,
        isBuiltInVar: matched.isBuiltInVar,
      };
      path.stop();
    },
  });

  return result;
}

/**
 * `MemberExpression` shaped `<sym>.has(...)`. Returns the symbol name or null.
 */
function memberHasSymbol(node: t.Node): string | null {
  if (!t.isCallExpression(node)) return null;
  const callee = node.callee;
  if (!t.isMemberExpression(callee)) return null;
  if (!t.isIdentifier(callee.object)) return null;
  if (!t.isIdentifier(callee.property) || callee.property.name !== "has") return null;
  return callee.object.name;
}

/**
 * Returns true if the given expression is a "return false" — i.e. a
 * `ReturnStatement` whose argument is a falsy literal (`!1`, `false`, `0`).
 */
function isReturnFalse(stmt: t.Node | null | undefined): boolean {
  if (stmt === null || stmt === undefined) return false;
  if (!t.isReturnStatement(stmt)) return false;
  const arg = stmt.argument;
  if (arg === null || arg === undefined) return false;
  if (t.isBooleanLiteral(arg) && arg.value === false) return true;
  if (t.isUnaryExpression(arg) && arg.operator === "!") {
    // !1 / !true
    return true;
  }
  if (t.isNumericLiteral(arg) && arg.value === 0) return true;
  return false;
}

/**
 * Walk `if(<test>) return false` patterns inside the function body and
 * categorize them. We accept either a plain `IfStatement` whose consequent is
 * a `ReturnStatement` directly, or a `BlockStatement` containing exactly one
 * `ReturnStatement`.
 */
function walkIfReturnFalse(body: t.BlockStatement, visit: (test: t.Expression) => void): void {
  // Use a regular AST-walk via traverse, scoped to the function body. We
  // could traverse(body) but @babel/traverse needs a parent path — easier to
  // implement a tiny manual walker for the few node types we care about.
  function walk(node: t.Node | null | undefined): void {
    if (node === null || node === undefined) return;

    if (t.isIfStatement(node)) {
      const cons = node.consequent;
      let returnsFalse = false;
      if (isReturnFalse(cons)) {
        returnsFalse = true;
      } else if (t.isBlockStatement(cons)) {
        // Accept any block whose last top-level statement is `return false`.
        // The async-allowlist branch in real bundles wraps an extra
        // experimental fallback in front of the final `return!1`.
        const last = cons.body[cons.body.length - 1];
        if (isReturnFalse(last)) returnsFalse = true;
      }
      if (returnsFalse) {
        visit(node.test);
      }
      // also descend into branches in case there are nested ifs
      walk(node.consequent);
      walk(node.alternate ?? null);
      return;
    }
    if (t.isBlockStatement(node)) {
      for (const stmt of node.body) walk(stmt);
      return;
    }
    if (t.isReturnStatement(node)) {
      walk(node.argument ?? null);
      return;
    }
    if (t.isExpressionStatement(node)) {
      walk(node.expression);
      return;
    }
    if (t.isCallExpression(node)) {
      // dive into arrow/function args (e.g. `H.filter((O) => { ... })`)
      for (const a of node.arguments) walk(a as t.Node);
      walk(node.callee);
      return;
    }
    if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
      walk(node.body);
      return;
    }
    if (t.isVariableDeclaration(node)) {
      for (const d of node.declarations) walk(d.init ?? null);
      return;
    }
    if (t.isMemberExpression(node)) {
      walk(node.object);
      return;
    }
    if (t.isLogicalExpression(node) || t.isBinaryExpression(node)) {
      walk(node.left);
      walk(node.right);
      return;
    }
    if (t.isUnaryExpression(node)) {
      walk(node.argument);
      return;
    }
    // anything else: don't recurse — we only care about top-level ifs in the
    // filter body.
  }

  walk(body);
}

/**
 * Resolve a top-level `Set` symbol to a list of strings via the symbol map.
 * We delegate to `resolveStringSet` which handles `new Set([...])` directly.
 */
function resolveSetSymbol(ctx: ExtractContext, symName: string): string[] {
  const node = ctx.symbolMap.get(symName);
  if (node === undefined) return [];
  return resolveStringSet(ctx, node);
}

export function extractSubagentFilter(ctx: ExtractContext): SubagentFilterFragment | null {
  const sig = findFilterFn(ctx);
  if (sig === null) return null;

  const out: SubagentFilterFragment = { filter_fn_symbol: sig.fnName };

  walkIfReturnFalse(sig.body, (test) => {
    // Case 1: `<sym>.has(...)` — drop_set
    const directSym = memberHasSymbol(test);
    if (directSym !== null) {
      if (out.drop_set === undefined) {
        const names = resolveSetSymbol(ctx, directSym);
        if (names.length > 0) {
          out.drop_set = { names, count: names.length, symbol: directSym };
        }
      }
      return;
    }

    // Case 2: LogicalExpression(&&, lhs, rhs)
    if (t.isLogicalExpression(test) && test.operator === "&&") {
      const lhs = test.left;
      const rhs = test.right;

      // async_dispatch_allowlist:  isAsyncVar && !sym.has(...)
      if (
        t.isIdentifier(lhs) &&
        lhs.name === sig.isAsyncVar &&
        t.isUnaryExpression(rhs) &&
        rhs.operator === "!"
      ) {
        const sym = memberHasSymbol(rhs.argument);
        if (sym !== null && out.async_dispatch_allowlist === undefined) {
          const names = resolveSetSymbol(ctx, sym);
          if (names.length > 0) {
            out.async_dispatch_allowlist = { names, count: names.length, symbol: sym };
          }
        }
        return;
      }

      // non_builtin_extra_drop_set:  !isBuiltInVar && sym.has(...)
      if (t.isUnaryExpression(lhs) && lhs.operator === "!") {
        const inner = lhs.argument;
        if (t.isIdentifier(inner) && inner.name === sig.isBuiltInVar) {
          const sym = memberHasSymbol(rhs);
          if (sym !== null && out.non_builtin_extra_drop_set === undefined) {
            const names = resolveSetSymbol(ctx, sym);
            if (names.length > 0) {
              out.non_builtin_extra_drop_set = { names, count: names.length, symbol: sym };
            }
          }
          return;
        }
      }
    }
  });

  return out;
}

extractSubagentFilter.fieldName = "subagent_tool_filter" as const;
extractSubagentFilter.targetBundle = "cli" as const;
