# Roadmap

Phases lifted from `SPEC.md` §release-scopes.

## v0.1 — vendored static spec + checker (this release)

**Status:** ✅ shipped.

- `contracts/cowork-v2.1.121.json` (hand-curated, JSON-Schema-validated)
- 11 rules: CW001–CW012 minus CW007 (deferred)
- CLI: `check`, `list-rules`, `spec-info`. Output: text, JSON, SARIF
- Library API stable for `check_repo`, `load_default_spec`, `load_spec`
- Python 3.11+; PyPI distribution

## v0.2 — bundle extractor

**Status:** scaffolding shipped under `src/cwlint/extractors/` and
`tests/fixtures/bundles/` in v0.1; **not yet validated** against a current
production Claude.app.

Deliverables:

- Per-symbol Python extractors with behavioural anchors (not minified symbol
  names)
- `cwlint extract <claude-app-path>` subcommand
- Synthetic JS fixtures + self-tests for each extractor
- `coverage` tier (`verified` / `documented` / `inferred`) per spec field
- Bundled Claude plugin under `.claude-plugin/` so the skill can drive
  `cwlint check` from inside Claude Code/Cowork (mirrors `claude-plugin-doctor`)

## v0.3 — upstream watcher

**Status:** workflow YAML stub shipped in v0.1 as `watch-claude-release.yml`;
not wired to the extractor or to PR creation yet.

Deliverables:

- Cron job hits the Claude.app Squirrel.Mac update feed daily
- Compares against `contracts/*.json` versions
- Downloads bundle, runs extractor, runs differ
- Opens PR with new spec + human-readable diff (never auto-merges)
- Failure mode: opens an issue if extractor self-test fails on the new bundle

## v0.4 — Node.js bindings + bundled Claude plugin

**Status:** scaffolding shipped under `packages/cwlint-js/` in v0.1.

Deliverables:

- TypeScript port reading the same `contracts/*.json`
- Implements all 11 rules (v0.1 ships only CW001 as a proof of concept)
- Published to npm
- `.claude-plugin/` skill that detects "I'm in a skill repo" and runs
  `cwlint check`

## v1.0 — schema lock + integration suite

- Pin `spec_version: "1"`
- End-to-end test: every cited Anthropic issue in SPEC has a fixture that
  triggers the corresponding CW rule
- Stable JSON output schema published to `https://json.schemastore.org/`
- Project version policy: spec-shape changes go through
  `spec_version: "2"` migration; rules can evolve under v1.0
