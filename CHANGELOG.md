# Changelog

All notable changes to `claude-cowork-lint` are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-10

First public release. Per user request, this single release bundles the planned
v0.1 (vendored spec + checker), v0.2 framework (extractor scaffolding), v0.3
stub (upstream watcher), and v0.4 stub (Node bindings + bundled Claude plugin)
work. Phases 0.2–0.4 ship as scaffolding to be hardened in subsequent releases;
0.1 is the production-ready surface.

### Added

- **Vendored runtime contract** at `contracts/cowork-v2.1.121.json` (Claude.app
  `1.6259.1` / Operon-Core `2.1.121` / CLI `2.1.138`). Mirrored into the package
  at `src/cwlint/_contracts/` and accessed via `importlib.resources` so the
  wheel is self-contained. JSON Schema (`schemas/v0.json`) validates every
  bundled contract.
- **Checker rules CW001–CW012 (CW007 deferred):**
  - `CW001` — agent declares a tool stripped by Cowork's runtime gates
    (sub-agent survivor set: `(async_dispatch_allowlist ∖ host_loop_excluded_builtins) ∖ drop_set ∪ {mcp__*}`).
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
  `spec-info` subcommands. Output formats: `text` (default), `json`, `sarif`.
- **Library API** — `from cwlint import check_repo, load_default_spec, load_spec`.
- **Suppression markers** — `<!-- cwlint: ignore CWxxx reason="..." -->` (HTML or
  hash-comment form). The marker may sit on the same line as the offending
  token or on the line immediately above. Reason is required; without it the
  marker is silently ignored.
- **Bundle extractor framework** (`src/cwlint/extractors/`) — behavioral-anchor
  scripts producing JSON fragments from a Claude.app bundle. Three working
  extractors against synthetic JS fixtures: kernel-env-allowlist,
  subagent-filter-fn, secret-unset-list. `cwlint extract <bundle-path>`
  subcommand wires them together. v0.2 work; not yet validated against a
  current production Claude.app.
- **Upstream watcher** (`.github/workflows/watch-claude-release.yml`) — daily
  cron skeleton. Documented as v0.3 deferred (does not yet open PRs against
  `contracts/`).
- **Node.js bindings** at `packages/cwlint-js/` — TypeScript scaffolding that
  reads the same `contracts/*.json`. Implements the spec loader and CW001 as a
  proof of concept.
- **Bundled Claude plugin** at `.claude-plugin/` with `marketplace.json` and
  `plugin.json`. Skill driving `cwlint check` from inside Claude Code/Cowork
  follows in v0.2.
- **Best-practices repo machinery** — CI matrix (Python 3.11/3.12 × ubuntu/macos),
  CodeQL, dependabot, issue + PR templates, CODEOWNERS, SECURITY policy,
  Code of Conduct, tier-import boundary check, post-install wheel smoke test.

### Notes

- `CW007` (env var not in kernel passthrough allowlist) is **deferred** — the
  original framing applied the kernel-shell spawn allowlist to the wrong surface
  (hooks run in the CLI process tree, not the kernel-shell). The rule ID is
  reserved and will land in v0.2 with separate sub-rules per surface.
