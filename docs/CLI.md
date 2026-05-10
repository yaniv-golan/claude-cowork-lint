# `claude-cowork-lint` — CLI / JSON contract

This document is the stable public contract for scripts, AI agents, and CI
systems that integrate with `claude-cowork-lint`. **Breaking changes to any
shape on this page will only land in a major version (`1.0.0`+) bump.**

## Binaries

The package installs two binaries with identical behaviour:

| Binary | Use when |
|---|---|
| `claude-cowork-lint` | CI yaml, scripts. Self-describing. |
| `cwlint` | Interactive use. Shorter to type. |

This document uses `cwlint` for brevity.

## Subcommands

### `cwlint check <repo>`

Validate a skill/plugin/agent repo against the Cowork runtime contract.

```
Usage: cwlint check [OPTIONS] REPO

Arguments:
  REPO          Path to the repo to check.        [required]

Options:
  --spec PATH                Override the bundled contract.
  --strict / --warn-only     Strict mode exits 1 on errors. Default: warn-only.
  --format text|json|sarif   Output format. Default: text.
  --ignore CWxxx             Skip the named rule. Repeatable.
  --help                     Show this message and exit.
```

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | No findings, or `--warn-only` mode (default) regardless of finding count |
| `1` | `--strict` mode and at least one `error`-severity finding |
| `2` | Invalid invocation (unknown format, missing repo path, etc.) |

### `cwlint list-rules`

Print every `CWxxx` rule with severity and one-line summary, one per line:

```
CW001  error  Agent declares a tool stripped by Cowork's runtime gates
CW002  error  Agent has neither Write nor Edit after the runtime gates apply
...
```

### `cwlint spec-info [--spec PATH]`

Print metadata about the loaded contract: spec version, Claude.app version,
Operon-Core version, and key allowlist sizes. One key per line, two-column
form. Useful for confirming what runtime version `cwlint` is checking against.

### `cwlint --version`

Print `claude-cowork-lint <semver>` and exit 0.

## JSON output (`--format json`)

```jsonc
{
  "cwlint_version": "0.1.0",
  "spec_version": "0",
  "claude_app_version": "1.6259.1",
  "findings": [
    {
      "rule_id": "CW001",
      "severity": "error",     // one of: error, warn, info
      "path": "agents/bad.md", // POSIX-style relative path from REPO
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
- `detail`, `suggestion` — present, may be `null`. Wording may evolve;
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

## Library API (Python)

```python
from cwlint import (
    check_repo,
    load_default_spec,
    load_spec,
    Spec,
    Report,
    Finding,
    Severity,
)
```

`check_repo(root, spec, *, ignore=())` returns a `Report` whose `findings`
list, `error_count`/`warn_count`/`info_count` properties, and `exit_code()`
method are stable across patch versions.
