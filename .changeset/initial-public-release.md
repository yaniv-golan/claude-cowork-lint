---
"claude-cowork-lint": minor
---

Initial public release on npm — `npm i -g claude-cowork-lint` now produces an
installable tool. Bundles the entire v0.1 → v0.2 in-tree roadmap under one
published tag:

**Checker (v0.1 scope)**

- 11 checker rules (CW001–CW012, with CW007 reserved indefinitely): runtime
  gate, persistence path, `$CLAUDE_PLUGIN_ROOT` substitution, model-invocation
  opt-out, `user-invocable` semantics, typo detection, sub-agent + bash
  heuristic, MCP server registration, `userConfig` validation, plugin-hook
  scoping, broken hook events.
- Vendored runtime contract `contracts/cowork-v1.6608.2.json` shipped inside
  the npm tarball. Schema is locked at `spec_version: "0"` with a guard test.
- AST-based bundle extractor (`cwlint extract`) using `@babel/parser`,
  validated end-to-end against Claude.app `1.6608.2` and Claude Code CLI
  `2.1.138`.
- `cwlint doctor` subcommand for rule-anchor drift detection; gated in CI.
- Upstream watcher (`scripts/check-for-new-release.ts`) with daily cron via
  GitHub Actions.
- Bundled Claude plugin at `.claude-plugin/`, skill at
  `skills/claude-cowork-lint/`, slash command at `commands/cwlint-check.md`.

**CLI agent contract (v0.2 scope)**

- `--json` alias for `--format json` on every subcommand.
- Stable JSON envelope keyed by `schemaVersion: "0.1"` — additive-only
  thereafter; removes/renames are a next-major event.
- `ErrorEnvelope` shape on every error path (including Commander
  argument-parse errors), keyed by stable `E_*` codes.
- Exit-code split: `0` clean / `1` findings / `2` strict-mode escalation /
  `3` operational error / `64` usage error. See [`docs/CLI.md`](https://github.com/yaniv-golan/claude-cowork-lint/blob/main/docs/CLI.md)
  for the full contract.
- SARIF output (`--format sarif`) on `check`.

**Dogfood baseline**

- 187 tests passing.
- `cwlint doctor` reports all rules ok against the bundled
  `cowork-v1.6608.2.json` contract.
- Validated against the [`anthropics/skills`](https://github.com/anthropics/skills)
  corpus: zero false-positives on the 17 official skills.
