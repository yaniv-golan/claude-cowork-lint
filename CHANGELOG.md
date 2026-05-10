# Changelog

All notable changes to `claude-cowork-lint` are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-10

First public release. Per user request, this single release bundles the entire
roadmap from the design SPEC: v0.1 (vendored spec + checker), v0.2 (bundle
extractor — validated end-to-end against real Claude.app `1.6608.2` and CLI
`2.1.138`), v0.3 (upstream watcher), v0.4 (Node.js bindings + bundled Claude
plugin), and v1.0 (schema lock + Anthropic-issue integration suite).

### Added

- **Vendored runtime contract** at `contracts/cowork-v2.1.121.json` (Claude.app
  `1.6259.1` / Operon-Core `2.1.121` / CLI `2.1.138`). Mirrored into the
  package at `src/cwlint/_contracts/` and accessed via `importlib.resources`
  so the wheel is self-contained. JSON Schema (`schemas/v0.json`) validates
  every bundled contract.
- **Checker rules CW001–CW012 (CW007 reserved):**
  - `CW001` — agent declares a tool stripped by Cowork's runtime gates
    (sub-agent survivor set: `(async ∖ host-excluded) ∖ drop ∪ {mcp__*}`).
  - `CW002` — agent has neither `Write` nor `Edit` after the runtime gates.
  - `CW003` — `SKILL.md` uses bare `$CLAUDE_PLUGIN_ROOT` instead of `${CLAUDE_PLUGIN_ROOT}`.
  - `CW004` — `SKILL.md` frontmatter sets `disable-model-invocation: true`.
  - `CW005` — `SKILL.md` missing `user-invocable: true`.
  - `CW006` — hook command references a tool name not in any allowlist (typo detector).
  - `CW008` — sub-agent dispatch cue followed within 30 lines by a fenced bash block.
  - `CW009` — skill declares MCP tool dependency without a registered server.
  - `CW010` — plugin `userConfig` option name violates user-secret validation rules.
  - `CW011` — plugin has `hooks/hooks.json` (won't fire in Cowork).
  - `CW012` — plugin hooks declare specific events known broken in Cowork.
- **CLI** `claude-cowork-lint` (alias `cwlint`) with `check`, `list-rules`,
  `spec-info`, and `extract` subcommands. Output formats: `text`, `json`,
  `sarif`.
- **Library API** — `from cwlint import check_repo, load_default_spec, load_spec`.
- **Suppression markers** — `<!-- cwlint: ignore CWxxx reason="..." -->` (HTML or
  hash-comment form). The marker may sit on the same line as the offending
  token or on the line immediately above. Reason is required.
- **Bundle extractor framework** (`src/cwlint/extractors/`) — behavioural-anchor
  scripts producing JSON fragments from real Claude.app and CLI bundles. Static
  symbol-resolution handles the minified `var Sym="Read"` indirection used in
  production bundles. **Validated against Claude.app `1.6608.2` and CLI
  `2.1.138`**: `LW8`/`Ys_`/`$zH`/`M58` (CLI sub-agent filter) and
  `Y2e`/`xUA` (desktop host-loop gates) extract correctly.
- **Watcher** (`scripts/check_for_new_release.py` + GitHub Actions cron) —
  reads the installed Claude.app's bundle version, runs the full extractor
  pipeline, computes a structured diff against the bundled contract, and
  writes a PR-body markdown ready for human review. Supports both real-app
  and bundle-file modes.
- **Diff library** (`cwlint.diff`) — structured spec-to-spec diff +
  human-readable markdown rendering.
- **Node.js bindings** at `packages/cwlint-js/` — TypeScript port with full
  rule parity. Reads the same `contracts/*.json`. 12-test suite using the
  built-in `node:test` runner.
- **Bundled Claude plugin** — `.claude-plugin/{plugin,marketplace}.json`,
  `skills/claude-cowork-lint/SKILL.md` driving the CLI from inside Claude
  Code/Cowork, and a `/cwlint-check` slash command.
- **Anthropic-issue integration suite** (`tests/integration/test_anthropic_issues.py`)
  — parametrised test proving every issue cited in SPEC has a fixture that
  fires the corresponding CW rule.
- **Schema lock** — `spec_version: "0"` is enforced by a guard test.
  Bumping the schema is a major-version event.
- **Best-practices repo apparatus** — CI matrix (Python 3.11/3.12 ×
  ubuntu/macos plus Node 20 × ubuntu/macos), CodeQL, dependabot, issue
  + PR templates, CODEOWNERS, SECURITY policy, Code of Conduct, MIT
  license, tier-import boundary check, post-install wheel smoke test,
  watcher report artifact upload.

### Notes

- `CW007` (env var not in kernel passthrough allowlist) is **reserved
  indefinitely**. The original framing applied the kernel-shell spawn
  allowlist to the wrong surface (hooks run in the CLI process tree, not
  the kernel-shell). When the right model lands it will pick fresh CW IDs;
  CW007 stays empty so no in-tree suppressions ever silently change meaning.
- Test counts at release: 112 Python tests + 12 Node tests = 124 total.
