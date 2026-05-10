# Roadmap

Phases lifted from `SPEC.md` §release-scopes. **Per user request, the v0.1.0
release ships everything below — phases v0.2 through v1.0 are completed work,
not deferred scaffolding.** Future patch releases will refine the existing
implementations rather than add new phases.

## v0.1 — vendored static spec + checker

**Status:** ✅ shipped.

- `contracts/cowork-v2.1.121.json` (hand-curated, JSON-Schema-validated)
- 11 rules: CW001–CW012 minus CW007 (intentionally reserved — see below)
- CLI: `check`, `list-rules`, `spec-info`, `extract`. Output: text, JSON, SARIF
- Library API stable for `check_repo`, `load_default_spec`, `load_spec`
- Python 3.11+; PyPI distribution

## v0.2 — bundle extractor

**Status:** ✅ shipped.

- Per-symbol Python extractors with **behavioural anchors** (function
  signatures, unique string-literal triples) — not minified-symbol names.
  Validated against:
  - real Claude.app `1.6608.2` desktop bundle (`.vite/build/index.js`)
  - real Claude Code CLI `2.1.138` Bun-SEA-extracted bundle
- Working extractors: `kernel_env_passthrough`, `secret_unset_list`,
  `subagent_tool_filter` (drop_set + async_dispatch_allowlist +
  non_builtin_extra_drop_set with full symbol-resolution),
  `host_loop_tool_substitution` (safe set with spread expansion + excluded
  built-ins).
- `cwlint extract <bundle> --target [desktop|cli]` subcommand.
- Synthetic fixtures + self-tests at `tests/fixtures/bundles/`.

## v0.3 — upstream watcher

**Status:** ✅ shipped end-to-end.

- `.github/workflows/watch-claude-release.yml` — daily cron + workflow_dispatch.
- `scripts/check_for_new_release.py`:
  - reads the installed Claude.app's `CFBundleShortVersionString`
  - if newer than the bundled contract, extracts asar via `npx @electron/asar`,
    runs the extractor pipeline, composes a candidate contract, computes a
    structured diff, and writes a PR-body markdown to `watcher-output/diff.md`
  - dry-run mode for CI smoke-testing
- `cwlint.diff.diff_specs` + `render_markdown_diff` library functions.
- Watcher does **not** auto-merge — output is uploaded as an artifact for
  human review (matches plugin-doctor's release pattern).

## v0.4 — Node.js bindings + bundled Claude plugin

**Status:** ✅ shipped.

- `packages/cwlint-js/` — full TypeScript port reading the same
  `contracts/cowork-v*.json` files. Implements the spec loader, discovery,
  suppressions, the engine, and **all 11 rules** (CW001–CW012 minus CW007).
- 12 Node tests using the built-in `node:test` runner.
- Compiled with TypeScript 6, `strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`. Builds cleanly to `dist/`.
- `.claude-plugin/{plugin,marketplace}.json` for the bundled Claude plugin.
- `skills/claude-cowork-lint/SKILL.md` — drives the CLI from inside Claude
  Code/Cowork.
- `commands/cwlint-check.md` — `/cwlint-check` slash command.
- CI runs the Node test suite in parallel with the Python suite (matrix:
  ubuntu + macos × Node 20).

## v1.0 — schema lock + integration suite

**Status:** ✅ shipped.

- `spec_version: "0"` is **locked** — enforced by
  `tests/unit/test_schema_lock.py`. Bumping the schema is a major-version
  event for the project; the lock test must be deleted and the package
  major bumped in the same PR.
- `tests/integration/test_anthropic_issues.py` — parametrised test that
  proves every Anthropic issue cited in SPEC has a fixture which fires the
  corresponding CW rule. Prevents the contract from drifting away from the
  incidents that motivated each rule.
- Stable JSON output schema documented in `docs/CLI.md`. Patch releases
  may add fields; never remove or rename within `spec_version: "0"`.

## CW007 — intentionally reserved

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
- Publish the Node package to npm under `@yaniv-golan/cwlint`.
