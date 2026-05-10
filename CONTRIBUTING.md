# Contributing to claude-cowork-lint

## Quick start

```bash
git clone https://github.com/yaniv-golan/claude-cowork-lint
cd claude-cowork-lint
uv sync --all-extras
uv run pre-commit install
uv run pytest               # run tests
uv run claude-cowork-lint --help
```

Python 3.11 or newer required.

## Architecture

The authoritative reference is [`docs/internal/SPEC.md`](docs/internal/SPEC.md). Every
checker rule (`CW001`–`CW012`) maps to a section of that spec — PRs adding or changing
rules **must** cite the relevant section.

Source layout:

- `contracts/` — versioned, machine-readable Cowork runtime contracts. One file per
  Claude.app bundle. Treat as immutable once published.
- `src/cwlint/_contracts/` — byte-identical mirror shipped inside the wheel; accessed
  via `importlib.resources`. Run `python scripts/sync_contracts.py` after editing
  the canonical files.
- `schemas/` — JSON Schema for `contracts/*.json`. Bumping this means a `spec_version`
  major bump.
- `src/cwlint/spec.py` — pydantic models that load a contract.
- `src/cwlint/discovery.py` — locates skill manifests, plugin manifests, agent files,
  hook configs, `.mcp.json`, and `commands/*.md` in a target repo.
- `src/cwlint/rules/` — one module per `CW***` rule, each implementing the `Rule` ABC.
- `src/cwlint/output/` — text, JSON, and SARIF formatters. All consume the same
  `Report` shape.

## Tests

We use pytest with **strict TDD**. Every PR must:

1. Add a failing test that demonstrates the bug or required behavior.
2. Make the minimal change to pass it.
3. Keep `uv run pytest`, `uv run ruff check .`, and `uv run mypy` green.

Tests live under `tests/unit/` (per-module) and `tests/integration/` (CLI +
end-to-end against synthetic skill repos under `tmp_path`). Use the `make_skill_repo`
fixture in `tests/conftest.py` to build fixtures inline rather than checking large
trees into `tests/integration/fixtures/`.

## Adding a new rule

1. Pick the next free `CWxxx` ID (current allocation in [`docs/RULES.md`](docs/RULES.md)).
2. Add a row to `docs/RULES.md` with severity, description, fix guidance, and the
   spec section it derives from.
3. Create `tests/unit/rules/test_cwxxx.py` with at least: one passing-input test, one
   failing-input test, one suppression test.
4. Create `src/cwlint/rules/cwxxx_<slug>.py` implementing the `Rule` ABC.
5. Register the rule in `src/cwlint/rules/__init__.py`.
6. Update `docs/CLI.md` if the rule's JSON output adds new fields.
7. Add a `CHANGELOG.md` entry under `[Unreleased]` → `Added`.

## Linting & formatting

`ruff` handles both. `uv run ruff check . --fix` auto-fixes most findings. Pre-commit
runs ruff + mypy on staged files.

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
