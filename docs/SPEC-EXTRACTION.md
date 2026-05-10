# How a contract gets into `contracts/`

The Cowork runtime contract is **not** an Anthropic-published artifact. It is
extracted from the live Claude.app bundle by symbol/regex archaeology against
the minified JS bundles. This document describes how a new contract version
lands.

## Today (v0.1) — manual curation

`contracts/cowork-v2.1.121.json` was hand-curated against:

- Claude.app `1.6259.1` (`Contents/Resources/app.asar`)
- Operon-Core `2.1.121`
- In-VM CLI `2.1.138` (Bun SEA binary)

Each top-level field cites the desktop or CLI symbol it derives from
(`MGn`, `Ys_`, `LW8`, `jie`, etc.). See [`internal/SPEC.md`](internal/SPEC.md)
for the full extraction map.

To curate a new version manually:

1. Inspect the new bundle (`asar extract`, then locate the relevant minified
   symbols by their behavioural anchors — see `src/cwlint/extractors/` for
   the Python helpers we ship for this).
2. Produce a candidate `contracts/cowork-v<X>.json`.
3. Run the JSON Schema check: `uv run pytest tests/unit/test_spec_schema.py`.
4. Run the byte-identical sync test: `uv run pytest tests/unit/test_contracts_sync.py`.
5. Mirror into `src/cwlint/_contracts/`: `python scripts/sync_contracts.py`.
6. Run the full test suite. Open a PR.

## v0.2 — automated extractor

`src/cwlint/extractors/` contains the framework: each extractor pins to a
*behavioural* anchor (regex on a unique string literal or function signature)
rather than a minified symbol name (which changes every Claude release).
The `cwlint extract <bundle>` subcommand wires them together.

v0.1 ships extractor scaffolding plus 2-3 working extractors against
synthetic JS fixtures. These have **not yet been validated against a current
production Claude.app** — that's the v0.2 deliverable.

## v0.3 — upstream watcher

`.github/workflows/watch-claude-release.yml` runs daily, polling the
Claude.app update feed. When a new version ships, it downloads the bundle,
runs the extractor, and opens a PR with the diff. **Never auto-merges** —
extractor self-tests are necessary but not sufficient evidence.

The v0.1 release ships the workflow file as a stub (does not yet run the
extractor end-to-end).

## v1.0 — schema lock

At v1.0 the `spec_version` JSON shape is locked. New runtime contract
versions can ship as `cowork-v<X>.json` without bumping `spec_version`. A
JSON-shape change requires a major version bump and a `spec_version: 1`
schema migration.
