# `claude-cowork-lint` — CLI Contract (v0.1 schema)

This is the **stable, versioned contract** that scripts and AI agents may
rely on. Anything not documented here is implementation detail and may
change without notice.

The npm package installs two binaries with identical behaviour:

| Binary | Use when |
|---|---|
| `claude-cowork-lint` | CI yaml, scripts. Self-describing. |
| `cwlint` | Interactive use. Shorter to type. |

This document uses `cwlint` for brevity.

## Output streams

| Stream | Content | Stable? |
|---|---|---|
| stdout | The scan report (human-readable or JSON). Nothing else. On failure under `--format json`, the `ErrorEnvelope` is on stdout. | Yes |
| stderr | Freeform error messages and hints. Never structured under text/SARIF mode. | Format: freeform. |

The split lets you do `cwlint check . --json | jq …` cleanly: `jq` only
sees the report (or the `ErrorEnvelope` — both are well-formed JSON, both
on stdout).

## Exit codes (stable, append-only)

| Code | Meaning | Example |
|---|---|---|
| `0` | Clean. No findings, or findings ≤ warn severity without `--strict`. Also: `doctor` with every rule `ok`/`deprecated`. | `cwlint check ./clean-repo` |
| `1` | Operator opted into a gate and it tripped. `--strict` AND at least one error-severity finding; or `doctor` AND at least one rule is `stale`. **Preserved from v0.1 — this is the established CI gate contract.** | `cwlint check ./bad-repo --strict` |
| `2` | Uncaught runtime exception (caught only by `main()`'s catch-all). | unanticipated crash |
| `3` | Controlled error: `E_PATH_NOT_FOUND` or `E_SPEC_INVALID`. Emitted as an `ErrorEnvelope`. | `cwlint check /nonexistent` |
| `64` | Usage error: `E_USAGE`. Bad flag, unknown subcommand, invalid `--format` value. Emitted as an `ErrorEnvelope`. | `cwlint bogus-cmd` |

The `0/1/2/3/64` codes are **frozen**. New codes are only ever appended;
existing codes never change meaning.

## `--json` shorthand and `--format`

Every subcommand that emits a report accepts both `--json` and
`-f, --format <fmt>`. `--json` is a boolean shorthand for `--format json`.

**Precedence:** when both are passed explicitly, `--format` wins. So
`cwlint check . --json --format sarif` emits SARIF. The detection uses
Commander's `getOptionValueSource("format")` — a defaulted format yields
to `--json`; a user-passed format does not.

Supported formats per subcommand:

| Subcommand | Formats |
|---|---|
| `check` | `text` (default), `json`, `sarif` |
| `doctor` | `text` (default), `json` |
| `list-rules` | `text` (default), `json` |
| `spec-info` | `text` (default), `json` |
| `extract` | JSON-only (no `--format` flag; see `SPEC-EXTRACTION.md`) |

## Success envelope

Every `--format json` success payload is wrapped:

```jsonc
{
  "schemaVersion": "0.1",
  "finishedAt": "2026-05-11T02:18:27.123Z",
  // ...subcommand-specific fields...
}
```

- `schemaVersion`: pinned at `"0.1"`. Bumps follow semver and are breaking.
- `finishedAt`: ISO 8601 UTC. Diagnostic only — don't pin tests to it.
- **No `ok` field on success.** Absence of `ok` ≡ success. Agents
  discriminate on `ok === false` first; see ErrorEnvelope below.

Success envelopes are pretty-printed (2-space indent) for human-readable
diffs in CI logs. Consumers should not depend on whitespace.

## ErrorEnvelope

When a controlled error or usage error occurs under `--format json` (or
its `--json` alias), the failure surface is an `ErrorEnvelope`:

```jsonc
{
  "ok": false,
  "code": "E_PATH_NOT_FOUND",
  "message": "repo path not found: /nonexistent/path",
  "hint": "Pass the path to a directory containing SKILL.md / agents/ / hooks/ to check."
}
```

**Routing rule:**

- `--format json` (or `--json`) → ErrorEnvelope is emitted on **stdout**
  as a single line of JSON, so `cwlint check /missing --json | jq '.code'`
  works without consulting stderr.
- `--format text` or `--format sarif` → freeform `<code>: <message>` on
  stderr, plus an optional `hint:` line. stdout stays empty.

**Discriminator rule (load-bearing):** agents and scripts MUST branch on
`ok === false` first, BEFORE reading `schemaVersion`. Success envelopes
omit `ok` entirely; error envelopes omit `schemaVersion` entirely.

```bash
# Canonical agent pattern.
out=$(cwlint check . --json)
if [ "$(echo "$out" | jq -r '.ok // "ok"')" = "false" ]; then
  code=$(echo "$out" | jq -r '.code')
  # ...handle error by code...
fi
```

## Per-subcommand schemas

### `cwlint check <repo>` (`--json`)

Validates a skill/plugin/agent repo against the Cowork runtime contract.

```jsonc
{
  "schemaVersion": "0.1",
  "finishedAt": "<ISO 8601>",
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
  "summary": { "error": 1, "warn": 0, "info": 0 }
}
```

**Field stability:**

- `rule_id`, `severity`, `path`, `line`, `message`, `summary` — stable.
- `detail`, `suggestion` — always present, may be `null`. Wording may
  evolve; consumers should not pattern-match on prose.
- `cwlint_version`, `spec_version`, `claude_app_version` are diagnostic;
  never branch behaviour on `cwlint_version` patch values.
- New fields may be added at any time within `schemaVersion: "0.1"`.

Flags:

| Flag | Behaviour |
|---|---|
| `--strict` | Exit `1` on any error-severity finding (default: warn-only, exit `0`). |
| `--spec <path>` | Override the bundled contract. Missing file / malformed JSON / wrong `spec_version` → `E_SPEC_INVALID`, exit `3`. |
| `--ignore <ruleId>` | Skip a rule (repeatable). |
| `--quiet` | Suppress the human-readable "✓ no findings" success line. No-op under `--format json`. |
| `--no-color` | Suppress ANSI color (also honored: `NO_COLOR=<anything>`, `CI=<anything>`). |

### `cwlint doctor` (`--json`)

Audits every shipped rule's declared contract anchors against the loaded
contract. The payload is **flat** — do NOT expect a nested `report` key.

```jsonc
{
  "schemaVersion": "0.1",
  "finishedAt": "<ISO 8601>",
  "spec_version": "0",
  "claude_app_version": "1.6608.2",
  "rules": [
    {
      "ruleId": "CW001",
      "overall": "ok",           // one of: ok, stale, deprecated
      "status": "stable",        // one of: stable, deprecated, experimental
      "verified_against": "1.6608.2",
      "anchors": [ { "path": "host_loop_tool_substitution.host_loop_excluded_builtins.names", "resolved": true } ]
    }
  ]
}
```

Exit codes: `0` when every rule is `ok`/`deprecated`; `1` when at least
one rule is `stale` (analogous to `--strict` — operator opted into a
gate). `deprecated` is intentional/known and does NOT trip CI.

### `cwlint list-rules` (`--json`)

```jsonc
{
  "schemaVersion": "0.1",
  "finishedAt": "<ISO 8601>",
  "rules": [
    {
      "ruleId": "CW001",
      "severity": "error",
      "summary": "Agent declares a tool stripped by Cowork's runtime gates",
      "status": "stable",
      "verifiedAgainst": "1.6608.2",
      "deprecated": false
    }
  ]
}
```

Sorted by `ruleId`. CW007 is reserved indefinitely (see `docs/internal/ROADMAP.md`)
and intentionally absent.

### `cwlint spec-info` (`--json`)

```jsonc
{
  "schemaVersion": "0.1",
  "finishedAt": "<ISO 8601>",
  "spec_version": "0",
  "claude_app_version": "1.6608.2",
  "operon_core_version": "<x.y.z>",
  "counts": {
    "host_loop_safe_set": <n>,
    "host_loop_excluded_builtins": <n>,
    "subagent_drop_set": <n>,
    "subagent_async_dispatch_allowlist": 19,
    "kernel_env_passthrough_allowlist": <n>,
    "secret_unset_list": <n>
  }
}
```

### `cwlint extract <bundle> [--target desktop|cli]`

JSON-native; does NOT use the `--format` flag or the success envelope.
Emits the raw extracted fragments to stdout. See
[`SPEC-EXTRACTION.md`](SPEC-EXTRACTION.md) for the extraction strategy.

On a bad `--target` or missing bundle, the standard `E_USAGE` / `E_PATH_NOT_FOUND`
ErrorEnvelope rules apply (text mode → stderr; no JSON mode here, so
stderr is the only error surface).

## Error codes (append-only)

| Code | Meaning | Exit | Where |
|---|---|---|---|
| `E_PATH_NOT_FOUND` | Positional path argument doesn't exist on disk. | `3` | `check <repo>`, `extract <bundle>` |
| `E_SPEC_INVALID` | `--spec <path>` is missing, malformed, or has wrong `spec_version`. | `3` | wherever `--spec` is accepted |
| `E_USAGE` | Commander usage error (unknown subcommand, bad flag), invalid `--format`, invalid `--target`. | `64` | program-wide |

**Reserved (not yet emitted; adding emission is non-breaking):**

| Code | Reserved for |
|---|---|
| `E_BUNDLE_NOT_FOUND` | A future stricter `extract` check (currently folded into `E_PATH_NOT_FOUND`). |
| `E_RUNTIME` | A future structured surface for the uncaught-exception path (currently exit `2` with a freeform stderr). |

Consumers should treat unknown `code` values the same as a generic
non-zero exit: bail with an actionable error, don't pattern-match on
unknown prose.

## SARIF output (`--format sarif`)

SARIF 2.1.0, valid against `https://json.schemastore.org/sarif-2.1.0.json`
and accepted by `github/codeql-action/upload-sarif@v3`. Severity mapping:

| `cwlint` severity | SARIF level |
|---|---|
| `error` | `error` |
| `warn`  | `warning` |
| `info`  | `note` |

SARIF mode does NOT carry the cwlint success envelope; the SARIF schema
is the contract.

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

## Stability policy

> Schema version locked at `"0.1"` while the npm package is `< 1.0.0`.
> Additions are non-breaking; removals and renames require a
> `schemaVersion` bump.

- The current `schemaVersion` is `"0.1"`.
- The exit-code table above is frozen and append-only.
- The `E_*` codes above are append-only. Reserved codes may begin
  emitting at any time — that's also non-breaking.
- Snake_case JSON keys in `check --json` (`rule_id`, `spec_version`,
  `claude_app_version`) are stable. Other subcommands use camelCase
  (`ruleId`, `verifiedAgainst`); the split is historical and stable.

## Environment variables

| Var | Effect |
|---|---|
| `NO_COLOR` | Any non-empty value suppresses ANSI color (per <https://no-color.org/>). |
| `CI` | Any non-empty value suppresses ANSI color. |

Only `CWLINT_*` env vars are read; no others. The checker performs no
network I/O and writes nothing outside stdout/stderr.

## AI-agent patterns

### Branch on `ok === false` first

```bash
out=$(cwlint check "$repo" --json)
status=$?
ok_field=$(echo "$out" | jq -r 'if has("ok") then .ok else "ok" end')
if [ "$ok_field" = "false" ]; then
  # ErrorEnvelope path — read .code, .message, .hint
  echo "$out" | jq -r '"\(.code): \(.message)"'
  exit "$status"  # 3 (controlled) or 64 (usage)
fi
# Success envelope path — read .findings, .summary, .schemaVersion
echo "$out" | jq '.findings[] | select(.severity == "error")'
```

### Gate CI on findings vs errors

```bash
# Exit 0 unless a real error-severity finding is present.
cwlint check . --strict --json > report.json
# $? is 1 only if at least one error finding tripped the gate.
# Exits 3/64 if the invocation itself was wrong — surface those as job
# failures, not as "the repo has problems".
```

### Drive a script off `schemaVersion`

```bash
schema=$(cwlint check . --json | jq -r '.schemaVersion // empty')
if [ "$schema" != "0.1" ]; then
  echo "warning: cwlint schema changed to $schema; review parser" >&2
fi
```

### One-liners per subcommand

```bash
# Every ruleId, sorted.
cwlint list-rules --json | jq -r '.rules[].ruleId'

# Which rules are deprecated?
cwlint list-rules --json | jq -r '.rules[] | select(.deprecated) | .ruleId'

# The Claude.app version the bundled contract was extracted from.
cwlint spec-info --json | jq -r .claude_app_version

# Stale rules a contract bump would surface.
cwlint doctor --json | jq '.rules[] | select(.overall == "stale")'

# Errors only, grouped by file.
cwlint check . --json | jq -r '
  .findings[]
  | select(.severity == "error")
  | "\(.path):\(.line)  \(.rule_id)  \(.message)"
'
```

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
`exitCode(report, { strict })` which together implement the same
exit-code contract the CLI honours. These shapes (`Report`, `Finding`,
`Severity`, `exitCode` return values) are stable across patch versions
within `spec_version: "0"`.

The TypeScript-level `Finding` uses `camelCase` (`ruleId`, not `rule_id`);
the JSON wire format uses `snake_case` to remain stable across consumers.
If you need to emit the JSON shape from library code, run the report
through the `formatJson` helper in `src/output/json.ts`.

## Examples

```bash
# Strict check, exit 1 if any error.
$ cwlint check . --strict

# Pipe JSON into jq.
$ cwlint check . --json --strict | jq '.findings[]'

# Ignore specific rules.
$ cwlint check ./skill --ignore CW003 --ignore CW011

# SARIF for GitHub Code Scanning.
$ cwlint check . --format sarif > findings.sarif

# What rules ship?
$ cwlint list-rules

# What contract am I checking against?
$ cwlint spec-info

# Audit rules for staleness.
$ cwlint doctor

# Extract fragments from a Claude.app bundle.
$ cwlint extract /Applications/Claude.app/Contents/Resources/app.asar/.vite/build/index.js --target desktop > fragments.json
```
