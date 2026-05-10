# claude-cowork-lint

[![ci](https://github.com/yaniv-golan/claude-cowork-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/yaniv-golan/claude-cowork-lint/actions/workflows/ci.yml)
[![PyPI version](https://img.shields.io/pypi/v/claude-cowork-lint.svg)](https://pypi.org/project/claude-cowork-lint/)
[![Python ≥ 3.11](https://img.shields.io/badge/python-%E2%89%A53.11-brightgreen)](pyproject.toml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Lint your Claude skill, plugin, and agent files against the **Cowork runtime
> contract** before they hit production.

## Why

Cowork (`@anthropic-ai/operon-core`, the VM-backed sandbox runtime) silently
strips tools, env vars, and hook events that don't survive its filters. The
classic incident: an agent declares `tools: [Bash, ...]`, works fine in
Claude Code, then fails silently in Cowork because the desktop excludes `Bash`
from registered built-ins and substitutes an MCP replacement.

`claude-cowork-lint` ships a versioned, machine-readable copy of that contract
(extracted from the Claude.app bundle) plus a checker that catches the
classes of mistake that have actually hit skill authors:

- declaring tools that the host-loop or async-dispatch filter strips
- agents with no remaining persistence path (no Write or Edit)
- bare `$CLAUDE_PLUGIN_ROOT` instead of `${CLAUDE_PLUGIN_ROOT}`
- `disable-model-invocation: true` (the v0.4.0 founder-skills incident)
- plugin-scoped hooks that won't fire in Cowork (issues #16288 / #27398)
- userConfig option names that violate Cowork's secret-name validation
- and more — see [`docs/RULES.md`](docs/RULES.md)

## Install

```bash
pipx install claude-cowork-lint
# or
uv tool install claude-cowork-lint
```

The package ships two CLI binaries with the same behaviour:
- `claude-cowork-lint` — the descriptive name, suited for CI yaml
- `cwlint` — short alias for daily use

Python 3.11+ required.

## Quick start

```bash
# Lint the current directory.
cwlint check .

# CI-style strict mode.
cwlint check . --strict

# JSON output for tooling integration.
cwlint check . --format json

# SARIF for GitHub code-scanning.
cwlint check . --format sarif > findings.sarif

# What rules ship?
cwlint list-rules

# Which Cowork build is the bundled spec from?
cwlint spec-info
```

## Sample output

```text
$ cwlint check skills/

skills/dispatch/SKILL.md
  ! 4    CW003  bare '$CLAUDE_PLUGIN_ROOT' found
          → Use '${CLAUDE_PLUGIN_ROOT}' instead.

agents/bad.md
  ✗ 2    CW001  tool 'Bash' will not be available to a Cowork sub-agent
          name is excluded from registered built-ins in Cowork mode (HOST_LOOP_EXCLUDED_BUILTIN_TOOLS); use 'mcp__workspace__bash' instead.
          → Replace 'Bash' with 'mcp__workspace__bash' in this agent's tools.

Summary: 1 error, 1 warn, 0 info  (spec: claude-app 1.6259.1)
```

## How the contract is built

`contracts/cowork-v<X>.json` is a JSON-Schema-validated description of the
Cowork runtime gates, extracted from the Claude.app bundle (Electron app +
in-VM CLI). v0.1 ships a hand-curated `cowork-v2.1.121.json`; v0.2 will
auto-extract from a Claude.app bundle path. Every checker rule cites the
specific contract field it reads.

See [`docs/internal/SPEC.md`](docs/internal/SPEC.md) for the full design.

## Suppressions

Suppress a single finding inline:

```markdown
<!-- cwlint: ignore CW003 reason="hand-rolled shell escape needed here" -->
$CLAUDE_PLUGIN_ROOT/foo
```

Or hash-comment form:

```yaml
- TaskOutput  # cwlint: ignore CW001 reason="legacy agent — slated for removal"
```

The marker may sit on the same line as the offending token, or on the line
immediately above. The `reason="..."` field is required; without it the marker
is silently ignored.

## CI integration

```yaml
# .github/workflows/cwlint.yml
name: cwlint
on: [pull_request]
jobs:
  cwlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pipx install claude-cowork-lint
      - run: claude-cowork-lint check . --strict --format sarif > cwlint.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: cwlint.sarif
```

## Documentation

- [`docs/RULES.md`](docs/RULES.md) — every rule (`CW001`–`CW012`), with examples and fixes
- [`docs/CLI.md`](docs/CLI.md) — stable CLI/JSON contract for tooling integration
- [`docs/SPEC-EXTRACTION.md`](docs/SPEC-EXTRACTION.md) — how a new Claude.app bundle becomes a contract file
- [`docs/internal/ROADMAP.md`](docs/internal/ROADMAP.md) — phase plan for v0.2 → v1.0

## Roadmap

- **v0.1 (this release)** — vendored static spec + checker (11 rules; CW007 reserved)
- **v0.2** — bundle extractor + bundled Claude plugin
- **v0.3** — upstream watcher: daily check for a new Claude.app, auto-PR the contract diff
- **v0.4** — Node.js bindings (TypeScript port)
- **v1.0** — schema lock, integration suite covering each cited Anthropic issue

## Status

This is a **community reverse-engineering project**, not an Anthropic-published
artifact. The contract is best-effort, derived from the live Claude.app bundle.
If Anthropic ships their own runtime test harness, this project will defer to it.

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). PRs welcome; please file issues
through the templates.
