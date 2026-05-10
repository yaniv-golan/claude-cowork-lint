# Changelog

All notable changes to `claude-cowork-lint` are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **CW005 now fires only on explicit `user-invocable: false`**, not on absence
  of the field. Verified against Claude.app `1.6608.2` desktop bundle: the
  runtime parses the field as `(value?.toLowerCase() !== "false")`, so missing
  defaults to `true`. Surfaced by dogfooding the linter against
  [`anthropics/skills`](https://github.com/anthropics/skills): all 17 official
  skills omit the field and work fine — 17 false-positives became 0. See
  [`docs/RULES.md#cw005`](docs/RULES.md#cw005) for the runtime-verified semantics.

## [0.1.0] — TBD (Node-native release)

First public release. Per user request, this single release bundles the entire
roadmap (v0.1 → v1.0) under one tag.

### Added

- TypeScript Node package, distributed via npm with two CLI binaries:
  `claude-cowork-lint` (descriptive) and `cwlint` (short alias).
- Vendored runtime contract `contracts/cowork-v2.1.121.json` shipped inside
  the npm tarball (`files` field includes `contracts/`).
- 11 checker rules (CW001–CW012, with CW007 reserved indefinitely):
  CW001 (runtime-gate tool allowlist), CW002 (no persistence path), CW003
  (`$CLAUDE_PLUGIN_ROOT` bare), CW004 (disable-model-invocation), CW005 (missing
  user-invocable), CW006 (typo detector), CW008 (sub-agent + bash heuristic),
  CW009 (MCP server registration), CW010 (userConfig validation), CW011
  (plugin hooks won't fire), CW012 (specific broken hook events).
- CLI subcommands: `check`, `list-rules`, `spec-info`, `extract`. Output
  formats: text, JSON, SARIF.
- AST-based bundle extractors via `@babel/parser`. Validated end-to-end
  against Claude.app 1.6608.2 and Claude Code CLI 2.1.138.
- Upstream watcher (`scripts/check-for-new-release.ts`) with daily cron via
  GitHub Actions. Reads Info.plist, runs `@electron/asar` programmatic API,
  produces candidate contract + diff.md.
- Bundled Claude plugin at `.claude-plugin/`, skill at
  `skills/claude-cowork-lint/SKILL.md`, slash command at
  `commands/cwlint-check.md`.
- 115 vitest tests. Schema-lock guard prevents accidental spec_version bumps.
- Anthropic-issue integration suite proves every cited issue triggers its
  corresponding CW rule.

### Notes

This release is implemented in TypeScript / Node. An earlier prototype in
Python (preserved on the `legacy/python` branch and tagged `pre-node-rewrite`)
demonstrated the contract checker concept; the Node-native rewrite was driven
by three practical considerations: (a) skill/plugin authors live in the
TS/JS ecosystem; (b) we parse JavaScript bundles, which is more natural with
JS-native AST tools (`@babel/parser`); (c) the surrounding ecosystem (MCP,
the bundled Claude plugin, `@electron/asar` for bundle extraction) is JS-first.
See `docs/internal/RETROSPECTIVE.md` for the full reasoning.

CW007 (env var not in kernel passthrough allowlist) is reserved indefinitely
— the original framing applied the kernel-shell allowlist to the wrong surface.
The rule ID is preserved so future releases that introduce a sharper rule
can pick a fresh ID without confusing existing in-tree suppressions.
