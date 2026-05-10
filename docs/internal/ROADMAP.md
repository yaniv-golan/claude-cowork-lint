# Roadmap

Phases lifted from `SPEC.md` §release-scopes. **Per user request, the v0.1.0
release ships everything below — phases v0.2 through v1.0 are completed work,
not deferred scaffolding.** Future patch releases will refine the existing
implementations rather than add new phases.

## v0.1 — vendored static spec + checker

**Status:** ✅ shipped.

- `contracts/cowork-v2.1.121.json` (originally hand-curated; now also
  reproducible end-to-end from the same bundle via the v0.2 extractor;
  JSON-Schema-validated by `test/unit/spec-schema.test.ts`).
- 11 rules: CW001–CW012 minus CW007 (intentionally reserved — see below).
- CLI: `check`, `list-rules`, `spec-info`, `extract`. Output: text, JSON, SARIF.
- Library API stable for `checkRepo`, `loadDefaultSpec`, `loadSpec`, plus
  the `Report` / `Finding` / `Severity` types and the `summarise`,
  `hasErrors`, `exitCode` helpers.
- Node.js 20+; npm distribution; two bin entries (`claude-cowork-lint` +
  `cwlint` alias) pointing at the same compiled `dist/cli.js`.

## v0.2 — bundle extractor

**Status:** ✅ shipped.

- AST-based extractors (`@babel/parser` + `@babel/traverse`) with
  **behavioural anchors** (function signatures, unique string-literal
  triples) — never minified-symbol names. Validated against:
  - real Claude.app `1.6608.2` desktop bundle (`.vite/build/index.js`)
  - real Claude Code CLI `2.1.138` Bun-SEA-extracted bundle
- Working extractors: `kernel-env-allowlist`, `secret-unset-list`,
  `subagent-filter` (drop_set + async_dispatch_allowlist + non-builtin
  extra-drop set with full symbol-resolution), `host-loop` (safe set
  with spread expansion + excluded built-ins).
- Shared AST engine in `src/extractors/_ast.ts`: parses once, walks once,
  builds a `symbolMap` with an `AMBIGUOUS` sentinel for double-bound
  identifiers, exposes `resolveStringSet` to each extractor.
- `cwlint extract <bundle> --target [desktop|cli]` subcommand wires the
  extractors together for one-shot use against an unpacked bundle.
- Tests are layered: synthetic fixtures at `test/fixtures/bundles/` for
  hermetic per-PR coverage, real-bundle smoke tests for calibration drift.

## v0.3 — upstream watcher

**Status:** ✅ shipped end-to-end.

- `.github/workflows/watch-claude-release.yml` — daily cron + `workflow_dispatch`.
- `scripts/check-for-new-release.ts`:
  - reads the installed Claude.app's `CFBundleShortVersionString` from
    `Info.plist`
  - if newer than the bundled contract, extracts asar via the `@electron/asar`
    programmatic API, runs the extractor pipeline, composes a candidate
    contract, computes a structured diff, and writes a PR-body markdown
    to `watcher-output/diff.md`
  - dry-run mode for CI smoke-testing without touching real Claude.app
- Diff library (`src/diff.ts`) with `diff_specs` + `render_markdown_diff`.
- Watcher does **not** auto-merge — output is uploaded as a CI artifact for
  human review (matches plugin-doctor's release pattern).

## v0.4 — Node-native implementation + bundled Claude plugin

**Status:** ✅ shipped (Node IS the implementation).

The project was originally prototyped in Python. The v0.1.0 release is a
full Node-native rewrite — Node is the **only** implementation now; there
are no Python sources left in this tree (the prototype is preserved on
the `legacy/python` branch and the `pre-node-rewrite` tag for archaeology).
The motivation for the switch is captured in
[`RETROSPECTIVE.md`](RETROSPECTIVE.md).

- TypeScript 6 with `strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`. Compiles cleanly to `dist/`.
- 115 vitest tests covering unit + integration + extractor synthetic
  fixtures + the Anthropic-issue regression suite.
- Lint + format via Biome (`biome.json`); pre-commit gate via
  `simple-git-hooks` running `biome check --staged` only.
- `.claude-plugin/{plugin,marketplace}.json` for the bundled Claude plugin.
- `skills/claude-cowork-lint/SKILL.md` — drives the CLI from inside Claude
  Code/Cowork.
- `commands/cwlint-check.md` — `/cwlint-check` slash command.
- CI runs the Node test suite across the full matrix (ubuntu + macos × Node
  20).

## v1.0 — schema lock + integration suite

**Status:** ✅ shipped.

- `spec_version: "0"` is **locked** — enforced by
  `test/unit/schema-lock.test.ts`. Bumping the schema is a major-version
  event for the project; the lock test must be deleted and the package
  major bumped in the same PR.
- `test/integration/anthropic-issues.test.ts` — parametrised test that
  proves every Anthropic issue cited in SPEC has a fixture which fires the
  corresponding CW rule. Prevents the contract from drifting away from the
  incidents that motivated each rule.
- Stable JSON output schema documented in `docs/CLI.md`. Patch releases
  may add fields; never remove or rename within `spec_version: "0"`.

## CW007 — intentionally reserved (indefinitely)

`CW007` (env var not in kernel passthrough allowlist) has been
**reserved indefinitely**, not merely deferred. SPEC §kernel_env_passthrough
is the kernel-shell spawn boundary; hooks run in the CLI process tree which
has its own env-strip lists (§bg_context_env_strip lists A and B). Modeling
both surfaces correctly requires one rule per surface. When that lands, the
new rule(s) will pick fresh CW IDs; CW007 stays empty so no in-tree
suppressions ever silently change meaning.

## Future direction (post-1.0)

These are not on a release schedule but may land in patch releases:

- Wire the watcher to actually open PRs (currently uploads the candidate
  contract as a CI artifact for human review).
- Extend the extractor to capture `kernel_env_passthrough`,
  `user_secrets_injection`, `bg_context_env_strip` from real bundles
  (the v0.2 work focused on the gates that matter most for the rules
  we ship; the others are still curated by hand).
- A `cwlint fix` mode that auto-applies safe rewrites (Bash →
  mcp__workspace__bash, etc.) under `--yes`.
