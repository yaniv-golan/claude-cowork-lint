/**
 * Layer-boundary check — ported from `_legacy/python/tests/unit/test_import_boundaries.py`.
 *
 * Walks every `src/**\/*.ts` (excluding `*.test.ts`), parses the imports with
 * `@babel/parser` (NOT the bundle-extractor `_ast.parseBundle`, which uses
 * `["jsx"]` — we want plain TypeScript), maps relative specifiers
 * (`../findings.js`, `./rules/cw001.js`) to canonical dotted module names
 * (`cwlint.findings`, `cwlint.rules.cw001`), then asserts each rule below.
 *
 * A module under `prefix` may NOT import any module whose canonical name starts
 * with one of `forbidden`. Intra-package imports stay legal — `cwlint.rules.cw001`
 * importing `cwlint.rules._helpers` is fine; only cross-prefix violations fail.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const SRC_ROOT = join(REPO_ROOT, "src");

const RULES: Array<[string, readonly string[]]> = [
  [
    "cwlint.spec",
    ["cwlint.cli", "cwlint.engine", "cwlint.discovery", "cwlint.rules", "cwlint.output"],
  ],
  [
    "cwlint.findings",
    [
      "cwlint.cli",
      "cwlint.engine",
      "cwlint.discovery",
      "cwlint.rules",
      "cwlint.output",
      "cwlint.spec",
    ],
  ],
  [
    "cwlint.suppression",
    [
      "cwlint.cli",
      "cwlint.engine",
      "cwlint.discovery",
      "cwlint.rules",
      "cwlint.output",
      "cwlint.spec",
    ],
  ],
  ["cwlint.discovery", ["cwlint.cli", "cwlint.engine", "cwlint.rules", "cwlint.output"]],
  ["cwlint.rules", ["cwlint.cli", "cwlint.engine", "cwlint.output"]],
  ["cwlint.output", ["cwlint.cli", "cwlint.engine", "cwlint.rules", "cwlint.discovery"]],
  ["cwlint.engine", ["cwlint.cli", "cwlint.output"]],
  [
    "cwlint.extractors",
    [
      "cwlint.cli",
      "cwlint.engine",
      "cwlint.output",
      "cwlint.rules",
      "cwlint.discovery",
      "cwlint.spec",
      "cwlint.findings",
    ],
  ],
];

function toCanonical(absPath: string): string {
  const rel = relative(SRC_ROOT, absPath).replace(/\.tsx?$/, "");
  const parts = rel.split(/[\\/]/).filter((p) => p.length > 0);
  return ["cwlint", ...parts].join(".");
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const absNoExt = resolve(dirname(fromFile), spec).replace(/\.js$/, "");
  const relFromSrc = relative(SRC_ROOT, absNoExt);
  if (relFromSrc.startsWith("..")) return null;
  const segments = relFromSrc.split(/[\\/]/).filter((p) => p.length > 0);
  return ["cwlint", ...segments].join(".");
}

function importsOf(absPath: string): string[] {
  const src = readFileSync(absPath, "utf-8");
  const ast = parse(src, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const out: string[] = [];
  for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration") out.push(node.source.value);
    if (
      (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") &&
      node.source
    ) {
      out.push(node.source.value);
    }
  }
  return out;
}

function* walk(dir: string): Iterable<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      yield full;
    }
  }
}

describe("import boundaries", () => {
  it("no module crosses a forbidden layer", () => {
    const files = [...walk(SRC_ROOT)];
    const violations: string[] = [];
    for (const file of files) {
      const mod = toCanonical(file);
      const imports = importsOf(file);
      for (const spec of imports) {
        const target = resolveImport(file, spec);
        if (target === null) continue;
        for (const [prefix, forbidden] of RULES) {
          if (mod !== prefix && !mod.startsWith(`${prefix}.`)) continue;
          if (target === prefix || target.startsWith(`${prefix}.`)) continue;
          for (const f of forbidden) {
            if (target === f || target.startsWith(`${f}.`)) {
              violations.push(`${mod} imports ${target} (forbidden by ${prefix}; spec=${spec})`);
            }
          }
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(`Layer-boundary violations:\n${violations.join("\n")}`);
    }
    expect(violations).toEqual([]);
    // Sanity: the file walk discovered the modules we expected.
    expect(files.length).toBeGreaterThan(10);
  });
});
