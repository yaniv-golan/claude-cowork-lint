# `claude-cowork-lint` — CLI / JSON contract

This document is the stable public contract for scripts, AI agents, and CI
systems that integrate with `claude-cowork-lint`. **Breaking changes to any
shape on this page will only land in a major version (`1.0.0`+) bump.**

## Binaries

The npm package installs two binaries with identical behaviour:

| Binary | Use when |
|---|---|
| `claude-cowork-lint` | CI yaml, scripts. Self-describing. |
| `cwlint` | Interactive use. Shorter to type. |

This document uses `cwlint` for brevity.

## Subcommands

### `cwlint check <repo>`

Validate a skill/plugin/agent repo against the Cowork runtime contract.

```
Usage: cwlint check [options] <repo>

Arguments:
  repo                       Path to the repo to check.

Options:
  --spec <path>              Override the bundled contract.
  --strict                   Exit 1 on any error-severity finding (default: warn-only).
  -f, --format <format>      Output format: text|json|sarif (default: text)
  --ignore <ruleId>          Rule IDs to skip (repeatable).
  -h, --help                 Show this message and exit.
```

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | No findings, or warn-only mode (default) regardless of finding count |
| `1` | `--strict` mode AND at least one `error`-severity finding. Also commander's default exit code for argument-parsing failures (e.g. unknown flag, missing positional) — those bypass our handler and surface commander's stderr message. |
| `2` | Runtime/uncaught exception, or an action-handler validation failure (e.g. unknown `--format` value, missing bundle path on `extract`). The split is intentional: `1` = "you invoked me wrong, look at commander's message"; `2` = "we got past arg parsing and something went wrong inside the command". |

### `cwlint list-rules`

Print every `CWxxx` rule with severity and one-line summary, one per line:

```
CW001  error  Agent declares a tool stripped by Cowork's runtime gates
CW002  error  Agent has neither Write nor Edit after the runtime gates apply
...
```

### `cwlint spec-info [--spec <path>]`

Print metadata about the loaded contract: spec version, Claude.app version,
Operon-Core version, and key allowlist sizes. One key per line, two-column
form. Useful for confirming what runtime version `cwlint` is checking against.

### `cwlint doctor [--spec <path>] [-f text|json]`

Audit every shipped rule's declared contract anchors (`src/rules/_meta.ts`)
against the loaded contract; report rules whose anchors no longer resolve
(`stale`) or whose lifecycle status is `deprecated`. Designed to be wired
into CI so a contract bump that drops a field surfaces immediately.

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | All rules `ok` or `deprecated`. |
| `1` | At least one rule is `stale` (a declared anchor failed to resolve). `deprecated` rules do NOT trigger exit 1 — that status is intentional/known. |
| `2` | Unknown `--format` value, or runtime/uncaught exception. |

### `cwlint extract <bundle> [--target desktop|cli]`

Extract contract fragments from a Claude.app or CLI bundle (AST-based, via
`@babel/parser`). Prints a JSON object with the extracted fields to stdout.
See [`SPEC-EXTRACTION.md`](SPEC-EXTRACTION.md) for the extraction strategy.

### `cwlint --version`

Print `claude-cowork-lint <semver>` and exit 0.

## JSON output (`--format json`)

The wire format uses `snake_case` keys (preserved from the original Python
shape). The TypeScript types describing this shape live in
`src/output/json.ts` (`JsonReport`, `JsonFinding`); the Node library API
exposes the higher-level `Report` / `Finding` shapes (camelCase) — see the
Library API section below.

```jsonc
{
  "cwlint_version": "0.1.0",
  "spec_version": "0",
  "claude_app_version": "1.6608.2",
  "findings": [
    {
      "rule_id": "CW001",
      "severity": "error",     // one of: error, warn, info
      "path": "agents/bad.md", // POSIX-style relative path from <repo>
      "line": 2,               // 1-based line number
      "message": "tool 'Bash' will not be available to a Cowork sub-agent",
      "detail": "name is excluded from registered built-ins in Cowork mode...",
      "suggestion": "Replace 'Bash' with 'mcp__workspace__bash'..."
    }
  ],
  "summary": {
    "error": 1,
    "warn": 0,
    "info": 0
  }
}
```

**Field stability:**

- `rule_id`, `severity`, `path`, `line`, `message`, `summary` — stable.
- `detail`, `suggestion` — always present, may be `null`. Wording may evolve;
  consumers should not pattern-match on prose.
- New fields may be added at any time; consumers should ignore unknown fields.
- `cwlint_version`, `spec_version`, `claude_app_version` are diagnostic; never
  branch behaviour on `cwlint_version` patch values.

## SARIF output (`--format sarif`)

SARIF 2.1.0. Severity mapping:

| `cwlint` severity | SARIF level |
|---|---|
| `error` | `error` |
| `warn`  | `warning` |
| `info`  | `note` |

The output validates against
`https://json.schemastore.org/sarif-2.1.0.json` and is accepted by
GitHub's `github/codeql-action/upload-sarif@v3`.

## Suppression markers

Inline markers silence a single finding:

```
# cwlint: ignore CWxxx[,CWyyy] reason="<short explanation>"
<!-- cwlint: ignore CWxxx reason="..." -->
```

Rules:

- Marker on the **same line** as the offending token, or on the **line
  immediately above**, silences the finding.
- The `reason="..."` field is **required**. A marker without a reason is
  silently ignored — keeps in-tree suppressions honest.
- Multiple rule IDs may be listed, comma-separated: `CW001,CW003`.

## Library API (TypeScript / Node)

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
```

`checkRepo(root, spec, opts?)` returns a `Report`:

```ts
interface Report {
  specVersion: string;
  claudeAppVersion: string;
  findings: Finding[];
}

interface Finding {
  ruleId: string;
  severity: Severity;          // "error" | "warn" | "info"
  path: string;                // POSIX-style relative path from root
  line: number;                // 1-based
  message: string;
  detail?: string;
  suggestion?: string;
}

type Severity = "error" | "warn" | "info";
```

`opts.ignore` is a list of rule IDs to skip (`["CW003", "CW011"]`).

The library also exports `summarise(report)`, `hasErrors(report)`, and
`exitCode(report, { strict })` which together implement the same exit-code
contract the CLI honours. These shapes (Report, Finding, Severity, exitCode
return values) are stable across patch versions within `spec_version: "0"`.

The TypeScript-level `Finding` uses `camelCase` (`ruleId`, not `rule_id`); the
JSON wire format uses `snake_case` to remain stable across consumers. If you
need to emit the JSON shape from library code, run the report through the
`formatJson` helper in `src/output/json.ts`.
