# How a contract gets into `contracts/`

The Cowork runtime contract is **not** an Anthropic-published artifact. It is
extracted from the live Claude.app bundle by AST analysis of the minified JS
bundles. This document describes the extraction strategy and how a new
contract version lands.

## Why behavioural anchors, not symbol names

The Claude.app desktop and the in-VM CLI ship as minified JavaScript. The
identifiers the runtime gates live behind (`MGn`, `Ys_`, `LW8`, `jie`, `Y2e`,
`xUA`, `LW8`, `M58`, `$zH`, …) are **renamed every release** — they are not
stable contract surface. Any extractor that pins to a symbol name breaks the
moment Claude.app updates.

What *is* stable: the **behavioural anchors** around the gate.
`HOST_LOOP_EXCLUDED_BUILTIN_TOOLS` is recognisable by the unique combination
of string literals it always contains; the async-dispatch allowlist always
mentions the same characteristic 19 tool names; the env-passthrough list
always contains `HOME`, `PATH`, `TERM`, etc. Pinning to those triples lets
the extractor survive renames.

## Extraction architecture

`src/extractors/` holds one module per gate (`host-loop.ts`,
`subagent-filter.ts`, `kernel-env-allowlist.ts`, `secret-unset-list.ts`).
The shared engine in `src/extractors/_ast.ts`:

1. **Parses the bundle once** with `@babel/parser` (script source type;
   loose parser settings for minified output).
2. **Walks the AST once** with `@babel/traverse` to populate a per-bundle
   `symbolMap` (top-level identifier name → binding `Node`). We do not use
   `path.scope.getBinding(name)` — Bun-SEA bundles wrap their top-level
   `var` decls in an IIFE, and Babel's scope resolution misses them; our
   own symbol index is both simpler and more reliable.
3. **Exposes `resolveStringSet`** for extractor modules. Given a node like
   `new Set([H9, "Read", G2])` or `[Bash, "Read"]`, it resolves identifier
   references through the `symbolMap` and returns the flat list of string
   literal names. Any unresolvable reference (e.g. an identifier that's
   not in the map) just drops out — the result is conservative.

### The `AMBIGUOUS` sentinel

If `buildContext` sees the same identifier name bound twice at the top
level (`var H9 = "X"` in one block AND `var H9 = "Y"` in another),
`symbolMap` stores a frozen `AMBIGUOUS` sentinel for that name.
`resolveStringSet` returns `[]` rather than picking a binding when it
encounters an `AMBIGUOUS` reference, and a third+ binding never flips the
sentinel back. This keeps the extractor honest: when minification produces
a name collision we'd otherwise silently mis-resolve, we drop out instead.

### `ExtractContext`

Each extractor receives an `ExtractContext` containing the parsed AST root,
the `symbolMap`, and the `resolveStringSet` helper. Extractors return
JSON-serialisable fragments (e.g. `{ names: [...], symbol_traces: [...] }`)
that compose into a candidate contract.

## Test layering

Two tiers of tests cover the extractors:

1. **Synthetic fixtures** in `test/fixtures/bundles/` — small hand-written
   JS files that exercise specific anchor patterns (single binding, double
   binding triggering AMBIGUOUS, spread-into-Set, identifier-via-rest, …).
   These run on every CI invocation.
2. **Real-bundle smoke tests** — when the user has a Claude.app installed
   locally, the watcher and the integration test in
   `test/integration/watcher.test.ts` exercise the full extractor pipeline
   against the live `.vite/build/index.js` and the Bun-SEA-extracted CLI
   bundle. These were validated against Claude.app `1.6608.2` and CLI
   `2.1.138` at the v0.1.0 release.

The split matters because the synthetic tier guards correctness on every
PR, while the real-bundle tier guards calibration — the kind of "did
Claude.app rename a symbol?" drift that synthetic fixtures cannot catch.

## Today (v0.1) — bundled contract + extractor

`contracts/cowork-v2.1.121.json` is the contract file shipped inside the
npm tarball. It corresponds to:

- Claude.app `1.6259.1` (`Contents/Resources/app.asar`)
- Operon-Core `2.1.121`
- In-VM CLI `2.1.138` (Bun SEA binary)

It was originally hand-curated and is now reproducible end-to-end via the
extractor against the same bundle. Each top-level field cites the desktop
or CLI symbol it derives from (`MGn`, `Ys_`, `LW8`, `jie`, `Y2e`, `xUA`,
…) for human review; the symbol names are *documentation*, not the
extraction key.

### Curating a new version manually

1. Inspect the new bundle: `npx @electron/asar extract <Claude.app>/Contents/Resources/app.asar /tmp/asar`,
   then run `cwlint extract /tmp/asar/.vite/build/index.js --target desktop`
   and the equivalent for the CLI Bun-SEA bundle (`--target cli`).
2. Compose the candidate `contracts/cowork-v<X>.json` from the extractor
   output, verify it against the JSON Schema (`npm test` runs the
   `spec-schema` and `schema-lock` guards).
3. Run the full test suite (`npm run check`).
4. Open a PR.

## Upstream watcher (cron-driven)

`scripts/check-for-new-release.ts` plus `.github/workflows/watch-claude-release.yml`
run daily and on `workflow_dispatch`:

- Reads the installed Claude.app's `CFBundleShortVersionString` from
  `Info.plist`.
- If newer than the bundled contract, runs `@electron/asar`'s programmatic
  API (no `npx` needed) to extract the bundle into a temp dir.
- Runs the extractor pipeline, composes a candidate contract, computes a
  structured diff against the bundled one, and writes a PR-body markdown
  to `watcher-output/diff.md`.
- Uploads the candidate + diff as a CI artifact for **human review**. The
  watcher does not auto-merge — extractor self-tests are necessary but not
  sufficient evidence that a new contract is correct.

A dry-run mode exists for CI smoke-testing without touching real Claude.app
data.

## Schema lock

`spec_version: "0"` is the locked JSON-shape contract. New runtime contract
versions can ship as `cowork-v<X>.json` (different `claude_app_version`,
different gate contents) without bumping `spec_version`.
`test/unit/schema-lock.test.ts` enforces the lock — bumping the schema
requires deleting the lock test and bumping the package major in the same
PR.
