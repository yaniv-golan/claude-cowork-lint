# Contributing to claude-cowork-lint

## Quick start

```bash
git clone https://github.com/yaniv-golan/claude-cowork-lint
cd claude-cowork-lint
npm install
npm run dev -- --help        # run the CLI from source via tsx
npm test                     # run tests (vitest)
npm run lint                 # biome check
npm run typecheck            # tsc --noEmit (src + test)
npm run check                # typecheck + lint + test (the all-green gate)
```

Node.js 20 or newer required. `simple-git-hooks` installs a pre-commit hook
that runs `biome check --staged` on staged files only — it never reformats
your in-progress work.

## Architecture

The authoritative reference is [`docs/internal/SPEC.md`](docs/internal/SPEC.md). Every
checker rule (`CW001`–`CW012`) maps to a section of that spec — PRs adding or changing
rules **must** cite the relevant section.

Source layout:

- `contracts/` — versioned, machine-readable Cowork runtime contracts. One file per
  Claude.app bundle. Treat as immutable once published. Shipped inside the npm
  tarball via `package.json#files`, so `loadDefaultSpec()` finds them next to
  the compiled `dist/` at runtime — no resource-mirror or sync step needed.
- `schemas/` — JSON Schema for `contracts/*.json`. Bumping this means a `spec_version`
  major bump (currently `"0"` and locked by `test/unit/schema-lock.test.ts`).
- `src/spec.ts` — Zod-validated loader and TypeScript types for a contract.
- `src/discovery.ts` — locates skill manifests, plugin manifests, agent files,
  hook configs, `.mcp.json`, and `commands/*.md` in a target repo.
- `src/rules/` — one module per `CW***` rule (`cw001.ts`, `cw002.ts`, …),
  re-exported through `src/rules/index.ts`.
- `src/output/{text,json,sarif}.ts` — formatters. All consume the same
  `Report` shape from `src/findings.ts`.
- `src/extractors/` — AST-based extractors (`@babel/parser` + `@babel/traverse`)
  that read a Claude.app or CLI bundle and produce contract fragments.
- `src/cli.ts` — commander v12 entry point; the two `bin` entries in
  `package.json` (`claude-cowork-lint` and `cwlint`) both point at the
  compiled `dist/cli.js`.

## Tests

We use vitest with **strict TDD**. Every PR must:

1. Add a failing test that demonstrates the bug or required behavior.
2. Make the minimal change to pass it.
3. Keep `npm run check` (typecheck + lint + tests) green.

Tests live under:

- `test/unit/` — per-module unit tests (one file per module under test;
  rules tests live in `test/unit/rules/`).
- `test/integration/` — CLI end-to-end tests (spawn the CLI via `tsx` against
  synthetic skill repos under `tmpdir`) and the Anthropic-issue regression
  suite (`anthropic-issues.test.ts`) that proves every cited issue trips a CW
  rule.
- `test/fixtures/bundles/` — synthetic JS bundles for the extractor tests.
  The extractor suite is layered: synthetic fixtures live here for fast
  hermetic coverage; real-bundle smoke tests hit `_legacy/` artifacts when
  available so the AST anchors stay calibrated against production minified
  output.

Use the `make_skill_repo` helper in `test/helpers.ts` to build fixtures
inline rather than checking large trees into `test/fixtures/`.

## Adding a new rule

1. Pick the next free `CWxxx` ID (current allocation in [`docs/RULES.md`](docs/RULES.md)).
   `CW007` is **reserved indefinitely** — do not reuse it; see
   `docs/internal/ROADMAP.md`.
2. Add a row to `docs/RULES.md` with severity, description, fix guidance, and the
   spec section it derives from.
3. Create `test/unit/rules/cwxxx.test.ts` with at least: one passing-input
   case, one failing-input case, one suppression case.
4. Create `src/rules/cwxxx.ts` exporting a `Rule`-shaped object.
5. Register the rule in `src/rules/index.ts` (`ALL_RULES` plus the named
   `export { CWXXX }`).
6. Update `docs/CLI.md` if the rule's JSON output adds new fields.
7. Add a `CHANGELOG.md` entry under `[Unreleased]` → `Added`.

## Linting & formatting

[Biome](https://biomejs.dev/) handles both lint and format. `npm run lint:fix`
auto-fixes most findings; `npm run format` reformats. The pre-commit hook
runs `biome check --staged` so only staged files get touched.

TypeScript is strict-mode with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` — index accesses are typed as `T | undefined`,
and an optional property `foo?: string` cannot be assigned `undefined`
explicitly. Code reviewers will flag attempts to relax either.

## Commit messages

Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `refactor:`,
`style:`. Scope optional but encouraged: `feat(rules): add CW013 for ...`.

## Reporting issues

Use the issue templates. A failing test in the style above makes a bug report
dramatically easier to triage and fix.

## Code of conduct

This project follows the Contributor Covenant 2.1. See `CODE_OF_CONDUCT.md`.

## Security

For security issues, do **not** open a public issue. See `SECURITY.md`.
