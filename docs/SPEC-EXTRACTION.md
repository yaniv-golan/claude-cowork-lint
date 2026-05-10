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

## Bundled default — contract + extractor

`contracts/cowork-v1.6608.2.json` is the contract file shipped as the
default inside the npm tarball, loaded via the `cowork-latest.json`
pointer. It corresponds to:

- Claude.app `1.6608.2` (`Contents/Resources/app.asar`)
- In-VM CLI `2.1.138` (Bun SEA binary)

The earlier `contracts/cowork-v2.1.121.json` (matched to Claude.app
`1.6259.1`) remains in `contracts/` as a historical reference. See
[`internal/CONTRACT-AUDIT-1.6608.2.md`](internal/CONTRACT-AUDIT-1.6608.2.md)
for the audit that landed the refresh.

The contract is reproducible end-to-end via the extractor against the
same bundle. Each top-level field cites the desktop or CLI symbol it
derives from (`MGn`, `Ys_`, `LW8`, `jie`, `Y2e`, `xUA`, …) for human
review; the symbol names are *documentation*, not the extraction key.

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

## Contract-refresh policy

A contract refresh is the end-to-end workflow that takes a new Claude.app
version from "watcher detected drift" to "shipped bundled contract." The
mechanism has four moving parts: the watcher (drift detection), the
extractor pipeline (candidate generation), `cwlint doctor` (rule-level
staleness audit against the candidate), and the release lane (which
release tier the refresh ships in).

### 1. Watcher produces a candidate contract

The cron watcher (above) auto-detects new Claude.app versions and writes
`contracts/cowork-v<NEW>.json` plus `diff.md` to its output dir. The
candidate is an overlay of the bundled contract with whatever fragments
the extractor newly produced — never a from-scratch rebuild — so
unchanged fields carry forward verbatim. The watcher never auto-merges:
extractor self-tests are necessary but not sufficient evidence of
correctness, and a contract bump can quietly invalidate a rule's anchor
without breaking the extractor.

### 2. Maintainer runs `cwlint doctor` against the candidate

Every rule declares the dotted contract paths it reads via
`RULE_META.contractAnchors` in `src/rules/_meta.ts`. `cwlint doctor
--spec contracts/cowork-v<NEW>.json` resolves each declared anchor
against the candidate and reports any rule whose paths no longer
resolve. The per-rule `overall` field is one of:

- `ok` — every anchor still resolves; the rule survives the bump untouched.
- `stale` — at least one anchor missing; needs maintainer action.
- `deprecated` — rule is marked `status: "deprecated"` in `RULE_META`
  and is reported as deprecated regardless of anchor resolution. This is
  the lane for rules whose runtime enforcement has been removed (e.g.
  CW010 after the Operon kernel-secrets subsystem was deleted) but
  which we keep callable as hygiene checks.

### 3. Stale anchors → re-anchor or deprecate

A `stale` result is a fork:

- **Re-anchor.** The runtime gate still exists, but the contract field
  moved or the extractor regressed. Update the relevant extractor in
  `src/extractors/` and the rule's `contractAnchors` list in lockstep.
  CW004 in the v1.6608.2 refresh is the canonical example: the
  `disable-model-invocation` field appears in the CLI bundle (the
  authoritative runtime parser) but not in the desktop bundle's
  `dh(r, ...)` manifest-display accessor. The desktop layer is a
  *display* surface only; the CLI bundle is the gate. Some rules
  legitimately anchor in one bundle and not the other — `RULE_META`
  documents which per rule.
- **Deprecate.** The gate is genuinely gone (e.g. CW010's `OperonSecrets`
  validation in v1.6608.2). Flip `status: "stable"` → `"deprecated"` in
  `RULE_META`. The rule stays callable so users running the new checker
  against old bundles still get a result, but `doctor` reports it as
  deprecated.

### 4. Release lane (semver semantics)

- **Patch** (`x.y.Z`) bumps the bundled contract only. No rule logic
  changes; no schema changes. Used for routine refresh when every rule
  reports `ok`.
- **Minor** (`x.Y.0`) bumps the contract *and* re-calibrates one or more
  rules — re-anchoring, deprecating, or adding a new CW0xx ID for newly
  discovered gates. Same `spec_version`.
- **Major** (`X.0.0`) changes the JSON schema (`spec_version` bumps
  past `"0"`). This deletes `test/unit/schema-lock.test.ts` in the same
  PR (see "Schema lock" below).

### 5. Old contracts stay in `contracts/`

The previous contract file (e.g. `cowork-v2.1.121.json`) is **never
deleted within a major version**. Maintainers may need to load an older
contract for historical diffs, for `cwlint doctor` runs to inspect rule
drift across releases, or for users still pinned to an older
`claude_app_version`. Removal is reserved for major (`spec_version`)
bumps that change the JSON shape such that older files would no longer
load.

### Exemplar refresh report

`docs/internal/CONTRACT-AUDIT-1.6608.2.md` is the audit report for the
v1.6259.1 → v1.6608.2 refresh that exercised this policy end-to-end. It
demonstrates the expected level of evidence per rule (anchor probes,
occurrence counts, desktop-vs-CLI bundle attribution) and is the
template for future refreshes.

## Schema lock

`spec_version: "0"` is the locked JSON-shape contract. New runtime contract
versions can ship as `cowork-v<X>.json` (different `claude_app_version`,
different gate contents) without bumping `spec_version`.
`test/unit/schema-lock.test.ts` enforces the lock — bumping the schema
requires deleting the lock test and bumping the package major in the same
PR.
