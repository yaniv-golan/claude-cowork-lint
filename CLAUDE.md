# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this tool is

`claude-cowork-lint` is a Node.js / TypeScript package, distributed via npm,
that validates skill, plugin, and agent files against the Claude Cowork
runtime contract. It exposes two CLI binaries (`claude-cowork-lint` and the
short alias `cwlint`) plus a programmatic library API. The contract itself
is versioned JSON in `contracts/`, shipped inside the npm tarball via
`package.json#files` and loaded at runtime via `loadDefaultSpec()`.

## Architectural rules (from SPEC.md)

These are decisions already made — don't relitigate without changing the spec
first:

- **Node.js 20+, TypeScript, npm distribution.** Single package with two
  bin entries (`claude-cowork-lint` + `cwlint` alias). Compiled from `src/`
  to `dist/` with `tsc`; `tsx` is used for `npm run dev` and tests.
- **Read-only.** The checker must never mutate the target repo. No network
  access. No environment variables outside `CWLINT_*`.
- **One rule per module** under `src/rules/cwxxx.ts`. All rules are
  re-exported from `src/rules/index.ts`.
- **Rule IDs are append-only.** `CW007` is **reserved indefinitely** (the
  original framing applied the kernel-shell allowlist to the wrong surface,
  see `docs/internal/ROADMAP.md`) — do not reuse. New rules pick the next
  free ID.
- **`spec_version: "0"` is locked.** The guard test
  `test/unit/schema-lock.test.ts` rejects accidental schema bumps. Bumping
  the schema is a major-version event for the project: delete the lock test
  and bump the package major in the same PR.
- **Two distinct runtime gates** (decision-log #7 in the v0.1 plan):
  - Desktop-side `HOST_LOOP_EXCLUDED_BUILTIN_TOOLS` strips Bash/etc.
  - CLI-side `Ys_`/`LW8` async-dispatch allowlist (19 names).
  - Survivor set:
    `(async_allow - host_excluded) - drop_set + {mcp__*}`.
  - **Don't conflate them with a flat union.** That was the original review
    finding and it produces both false negatives and false positives.
- **Suppression markers** (`# cwlint: ignore CWxxx reason="..."`) may sit on
  the same line as the offending token OR the line immediately above. Reason
  is required; without it the marker is silently ignored.
- **Bundle extractors are AST-based** (`@babel/parser` + `@babel/traverse`),
  not regex. Anchors are *behavioural* (function signatures, unique string
  literals) — never minified symbol names, which rotate every Claude
  release. The shared helpers in `src/extractors/_ast.ts` build a
  `symbolMap` once and expose an `AMBIGUOUS` sentinel for double-bound
  identifiers.

## Toolchain

- **TypeScript** with `strict: true`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes`. Don't relax these.
- **[Biome](https://biomejs.dev/)** for both lint and format
  (`npm run lint`, `npm run format`).
- **Vitest** for tests (`npm test`). 115+ tests at last release; layered
  unit + integration with synthetic-fixture and real-bundle tiers for the
  extractors.
- **`simple-git-hooks`** installs a pre-commit hook that runs
  `biome check --staged --no-errors-on-unmatched` — staged files only, so
  in-progress work is never touched.

## Roadmap status

Per user request, the v0.1.0 release ships everything originally planned for
v0.1 → v1.0. **Future patch releases refine the existing implementations
rather than add new phases.** See `docs/internal/ROADMAP.md`.

- v0.1 — vendored static spec + checker (11 rules; CW007 reserved).
- v0.2 — bundle extractor (`cwlint extract`); validated against
  Claude.app `1.6608.2` and CLI `2.1.138`.
- v0.3 — upstream watcher (`scripts/check-for-new-release.ts` + GitHub
  Actions cron).
- v0.4 — Node IS the implementation. Bundled Claude plugin at
  `.claude-plugin/`, skill at `skills/claude-cowork-lint/`, slash command
  at `commands/cwlint-check.md`.
- v1.0 — `spec_version: "0"` schema-locked; Anthropic-issue integration suite
  at `test/integration/anthropic-issues.test.ts`.

## Pending repo setup (before re-enabling release.yml automatic publish)

These need to happen on the GitHub / npm side before the `release.yml`
workflow can publish — none of them are code changes in this tree:

1. **npm Trusted Publisher** — at https://www.npmjs.com/, configure
   "Trusted Publishers" for the `claude-cowork-lint` package with:
   GitHub repo `yaniv-golan/claude-cowork-lint`, workflow path
   `.github/workflows/release.yml`, environment name `npm` (or matching
   what `release.yml` declares). Combined with `publishConfig.provenance:
   true` in `package.json`, this gives us OIDC-signed provenance with no
   long-lived `NPM_TOKEN` in repo secrets.
2. **GitHub repo settings:** create the `npm` Environment (no required
   reviewers for now), enable "Allow GitHub Actions to create and approve
   pull requests" (Settings → Actions → General) so the upstream-watcher
   workflow can open contract-update PRs.
3. **Branch protection on `main`** after the first release: require the CI
   matrix + CodeQL to pass, require linear history.
4. **Changesets** — the package is configured with `@changesets/cli` and the
   GitHub changelog formatter; running `npm run changeset` then merging the
   resulting "Version Packages" PR is what drives the release.

## Reference material

- `docs/internal/SPEC.md` — authoritative design doc; cite a section in
  every rule PR.
- `docs/internal/ROADMAP.md` — phase plan and what shipped.
- `docs/internal/RETROSPECTIVE.md` — language-choice retrospective
  (Python prototype → Node-native rewrite).
- `docs/RULES.md` — public rule catalog.
- `docs/CLI.md` — stable CLI / JSON / library contract.
- `docs/SPEC-EXTRACTION.md` — how a new Claude.app bundle becomes a
  contract file.

## Commands

```bash
npm install
npm run dev -- check .       # run the CLI from source via tsx
npm test                     # all tests (vitest)
npm run lint                 # biome
npm run typecheck            # tsc --noEmit (src + test)
npm run check                # typecheck + lint + test
npm run build                # tsc → dist/, chmod cli.js
```
