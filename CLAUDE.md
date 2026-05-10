# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this tool is

`claude-cowork-lint` (Python module: `cwlint`, CLI binary same name + `cwlint`
alias) validates skill, plugin, and agent files against the Claude Cowork
runtime contract. The contract is versioned JSON in `contracts/`, mirrored
into `src/cwlint/_contracts/` for the wheel.

## Architectural rules (from SPEC.md)

These are decisions already made — don't relitigate without changing the spec
first:

- **Python 3.11+.** PyPI distribution. Single binary
  (`claude-cowork-lint`, alias `cwlint`).
- **Read-only.** The checker must never mutate the target repo. No network
  access. No environment variables outside `CWLINT_*`.
- **One rule per module** under `src/cwlint/rules/`. Each registers itself
  via the `@register` decorator.
- **Rule IDs are append-only.** `CW007` is reserved (deferred from v0.1) —
  do not reuse. New rules pick the next free ID.
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
- **The wheel must contain `src/cwlint/_contracts/`.** `load_default_spec()`
  uses `importlib.resources` — no `Path(__file__)` tricks, no symlinks.
  The `tests/unit/test_contracts_sync.py` test enforces parity between
  `contracts/` (canonical) and `src/cwlint/_contracts/` (in-package mirror).
  Run `python scripts/sync_contracts.py` after editing the canonical files.

## Roadmap gates

Phase boundaries are real — don't add v0.2+ work into a v0.1 release without
discussion. See `docs/internal/ROADMAP.md`.

- **v0.1 (released):** static spec + checker (11 rules; CW007 reserved).
- **v0.2:** bundle extractor + bundled Claude plugin. Scaffolding ships in
  v0.1 but is not validated against a real Claude.app yet.
- **v0.3:** upstream watcher. Workflow YAML stub exists; not wired up.
- **v0.4:** Node.js bindings.
- **v1.0:** schema lock.

## Pending repo setup (before re-enabling release.yml automatic publish)

1. **PyPI Trusted Publisher** at https://pypi.org/manage/account/publishing/
   with: project `claude-cowork-lint`, owner `yaniv-golan`, repo
   `claude-cowork-lint`, workflow `release.yml`, environment `pypi`.
2. **GitHub repo settings:** create `pypi` Environment (no required
   reviewers), enable "Allow GitHub Actions to create and approve pull
   requests" (Settings → Actions → General).
3. Add branch protection on `main` after the first release.

## Reference material

- `docs/internal/SPEC.md` — authoritative design doc; cite a section in
  every rule PR.
- `docs/internal/ROADMAP.md` — phase plan.
- `docs/RULES.md` — public rule catalog.
- `docs/CLI.md` — stable CLI/JSON contract.

## Commands

```bash
uv sync --all-extras
uv run pytest               # all tests
uv run ruff check .         # lint
uv run mypy                 # type check
uv run claude-cowork-lint --help
uv build                    # wheel + sdist
```
