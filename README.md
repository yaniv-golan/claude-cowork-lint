# claude-cowork-lint

[![ci](https://github.com/yaniv-golan/claude-cowork-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/yaniv-golan/claude-cowork-lint/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-cowork-lint.svg)](https://www.npmjs.com/package/claude-cowork-lint)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Lint your Claude skill, plugin, and agent files against the **Cowork runtime
> contract** before they hit production.

## Why

Cowork (the VM-backed sandbox runtime inside Claude.app) silently strips
tools, env vars, and hook events that don't survive its filters. The
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
npm i -g claude-cowork-lint
```

The package ships two CLI binaries with the same behaviour:
- `claude-cowork-lint` — the descriptive name, suited for CI yaml
- `cwlint` — short alias for daily use

Node.js 20+ required. The bundled runtime contract is shipped inside the npm
tarball under `contracts/` and loaded at runtime — no post-install step.

## Quick start

```bash
# Lint a skill repo (descriptive form).
claude-cowork-lint check skill/

# Same thing, short alias.
cwlint check skill/

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

## Library API

The package is also usable programmatically from any TypeScript / Node app:

```ts
import {
  checkRepo,
  loadDefaultSpec,
  loadSpec,
  type Spec,
  type Report,
  type Finding,
  type Severity,
} from "claude-cowork-lint";

const spec = loadDefaultSpec();
const report = checkRepo("./my-skill", spec, { ignore: [] });
console.log(report.findings);
```

See [`docs/CLI.md`](docs/CLI.md) for the full library + JSON contract.

## How the contract is built

`contracts/cowork-v<X>.json` is a JSON-Schema-validated description of the
Cowork runtime gates, extracted from the Claude.app bundle (Electron app +
in-VM CLI). The shipped contract `cowork-v2.1.121.json` corresponds to
Claude.app `1.6259.1` / Operon-Core `2.1.121` / in-VM CLI `2.1.138`. Each
checker rule cites the specific contract field it reads.

The `cwlint extract <bundle>` subcommand can re-derive the contract from a
fresh `app.asar` using AST-based behavioural anchors (`@babel/parser`); the
`scripts/check-for-new-release.ts` watcher runs it daily on a cron and
produces a candidate diff for human review. See
[`docs/SPEC-EXTRACTION.md`](docs/SPEC-EXTRACTION.md) and
[`docs/SPEC.md`](docs/SPEC.md) for the full design.

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
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm i -g claude-cowork-lint
      - run: claude-cowork-lint check . --strict --format sarif > cwlint.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: cwlint.sarif
```

## Documentation

- [`docs/RULES.md`](docs/RULES.md) — every rule (`CW001`–`CW012`, except `CW007` which is reserved), with examples and fixes
- [`docs/CLI.md`](docs/CLI.md) — stable CLI/JSON contract for tooling integration
- [`docs/SPEC.md`](docs/SPEC.md) — design spec (contract model, two-gate filter, rule catalog)
- [`docs/SPEC-EXTRACTION.md`](docs/SPEC-EXTRACTION.md) — how a new Claude.app bundle becomes a contract file

## Roadmap

Per user request, the v0.1.0 release bundles the entire originally-planned
roadmap (v0.1 → v1.0). All of the following are **shipped**:

- **v0.1** — vendored static spec + checker (11 rules; CW007 reserved indefinitely)
- **v0.2** — bundle extractor (`cwlint extract`), validated end-to-end against
  Claude.app `1.6608.2` and CLI `2.1.138`
- **v0.3** — upstream watcher (`scripts/check-for-new-release.ts`) on a daily cron
- **v0.4** — Node is now the implementation (this package); bundled Claude
  plugin at `.claude-plugin/`, skill at `skills/claude-cowork-lint/`, slash
  command at `commands/cwlint-check.md`
- **v1.0** — `spec_version: "0"` schema-locked by guard test; Anthropic-issue
  integration suite proves every cited issue triggers its CW rule

Future patch releases will refine these implementations rather than add new
phases. CW007 is reserved indefinitely; see
[`docs/RULES.md#cw007`](docs/RULES.md#cw007).

## Status

This is a **community reverse-engineering project**, not an Anthropic-published
artifact. The contract is best-effort, derived from the live Claude.app bundle.
If Anthropic ships their own runtime test harness, this project will defer to it.

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). PRs welcome; please file issues
through the templates.
