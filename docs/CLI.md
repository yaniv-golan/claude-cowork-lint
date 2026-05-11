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
| `--spec <path>` | Override the bundled contract. Missing file → `E_PATH_NOT_FOUND`, exit `3`. Malformed JSON / wrong `spec_version` → `E_SPEC_INVALID`, exit `3`. |
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

Flags:

| Flag | Behaviour |
|---|---|
| `--json` | Shorthand for `--format json` (overridden if `--format` is also passed). |
| `-f, --format <fmt>` | Output format: `text` (default) or `json`. |
| `--spec <path>` | Override the bundled contract. Missing file → `E_PATH_NOT_FOUND`, exit `3`. Malformed JSON / wrong `spec_version` → `E_SPEC_INVALID`, exit `3`. |
| `--quiet` | Suppress per-rule output when every rule is `ok`/`deprecated`. Stale rules always print (so CI logs preserve the gate signal). No-op under `--format json`. |
| `--no-color` | Suppress ANSI color (also honored: `NO_COLOR=<anything>`, `CI=<anything>`). |

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
| `E_PATH_NOT_FOUND` | A path argument doesn't exist on disk. | `3` | `check <repo>`, `extract <bundle>`, `--spec <path>` |
| `E_SPEC_INVALID` | `--spec <path>` exists but is malformed JSON or has wrong `spec_version`. | `3` | wherever `--spec` is accepted |
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
- A marker referencing an **unknown** rule ID will eventually be flagged
  by CW013 (`unknown-suppression-target`, planned for v0.3) — typo'd
  suppressions don't silently no-op forever.

**Stability:** both syntaxes (hash-comment and HTML-comment) are stable
across all v0.x releases. Changing the syntax requires a major
`schemaVersion` bump. See the Stability policy section below.

## Stability policy

> Schema version locked at `"0.1"` while the npm package is `< 1.0.0`.
> Additions are non-breaking; removals and renames require a
> `schemaVersion` bump.

### What's covered by `schemaVersion`

The `schemaVersion` field gates breaking changes to **every shape this
document declares**, at any nesting depth:

- The top-level envelope (`schemaVersion`, `finishedAt`, ...)
- The per-subcommand schemas (`findings`, `rules`, `counts`, ...)
- The embedded structures inside them (a `Finding`, a `RuleStatus`,
  an `Anchor`, ...)
- The `ErrorEnvelope` shape (`ok`, `code`, `message`, `hint`)
- The error-code (`E_*`) enum and the exit-code table

Removing or renaming any field — at any nesting depth — requires a
major `schemaVersion` bump. Adding fields is additive and does not.

### Append-only surfaces

- The exit-code table is frozen and append-only. Reserved codes (4-9)
  may begin emitting at any time — that's non-breaking.
- The `E_*` codes are append-only. Reserved codes (`E_BUNDLE_NOT_FOUND`,
  `E_RUNTIME`) may begin emitting at any time — non-breaking.
- The rule registry (`CWxxx` IDs) is append-only. **A rule ID is never
  reused.** Deprecation keeps the ID and demotes the rule's severity
  (typically to `info`); the rule continues to fire so existing
  suppression markers stay valid. CW007 is reserved indefinitely —
  see [`docs/internal/ROADMAP.md`](internal/ROADMAP.md#cw007--intentionally-reserved-indefinitely).
- Enum values may grow additively: `severity` (`error`/`warn`/`info`),
  `status` (`stable`/`deprecated`/`experimental`), and `overall`
  (`ok`/`stale`/`deprecated`) can each gain new values without bumping
  `schemaVersion`. **See "Treat unknown enum values as defaults" under
  AI-agent patterns** for the consumer-side rule.

### Other stable surfaces

- **Suppression marker syntax** (both forms — `# cwlint: ignore CWxxx
  reason="..."` and `<!-- cwlint: ignore CWxxx reason="..." -->`) is
  stable across all v0.x. Changing the syntax requires a major
  `schemaVersion` bump.
- **Contract file paths** in the npm tarball (`contracts/cowork-v<X>.json`,
  `contracts/cowork-latest.json`) are stable. Renaming requires a
  major `schemaVersion` bump.
- **Snake_case vs camelCase keys.** `check --json` uses snake_case
  (`rule_id`, `spec_version`, `claude_app_version`); other subcommands
  use camelCase (`ruleId`, `verifiedAgainst`); the split is historical
  and stable.
- **`cwlint extract` output** is exempt from the `schemaVersion`
  envelope (it's JSON-native with a different shape). Its stability is
  documented in [`SPEC-EXTRACTION.md`](SPEC-EXTRACTION.md), not here.

### Contract refresh vs `schemaVersion` bump

These are independent:

- A **contract refresh** (e.g., `cowork-v1.6259.1.json` →
  `cowork-v1.6608.2.json`) bumps the runtime contract data. Patch
  release. Does NOT bump `schemaVersion`.
- A **`schemaVersion` bump** is about the CLI's JSON output format
  (this document). Major release of `claude-cowork-lint`. Independent of
  what Claude.app version the bundled contract was extracted from.

### v1.0 lock

When the npm package reaches `1.0.0`, `schemaVersion` bumps to `"1.0"`
and this entire document becomes the locked public contract. Removing
any reserved-but-unused `E_*` codes or flags must happen in the v0.x
window — v1.0 is the last chance.

## Environment variables

| Var | Effect |
|---|---|
| `NO_COLOR` | Any non-empty value suppresses ANSI color (per <https://no-color.org/>). |
| `CI` | Any non-empty value suppresses ANSI color. |

Only `NO_COLOR` and `CI` are read; no others. The checker performs no
network I/O and writes nothing outside stdout/stderr. (The `CWLINT_*`
prefix is reserved for future use; no `CWLINT_*` variables are consulted
today.)

## AI-agent patterns

### Treat unknown enum values as defaults

Enum-valued fields — `severity`, `status`, `overall`, `code` — may grow
new values additively without bumping `schemaVersion`. Consumers MUST
handle unknown values gracefully rather than exhaustively switching:

```bash
# WRONG — silently mis-categorises a rule with a future severity value.
case $sev in
  error) ... ;;
  warn)  ... ;;
  info)  ... ;;
esac

# RIGHT — explicit default for unknown values.
case $sev in
  error) treat_as_error ;;
  warn)  treat_as_warn ;;
  info)  treat_as_info ;;
  *)     treat_as_info ;;   # conservative: don't break on additions
esac
```

Recommended default-for-unknown by field:

| Field | Recommended unknown-value default |
|---|---|
| `severity` | treat as `info` (most permissive — don't break CI) |
| `status` | treat as `stable` |
| `overall` | treat as `stale` (force the user to look) |
| `code` (in `ErrorEnvelope`) | exit non-zero, surface the raw `code` and `message` to the user |

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

**Pitfall:** piping straight into `jq` masks cwlint's exit status (jq's own
exit is always `0`), so an `ErrorEnvelope` looks like a success with a
missing `schemaVersion`. Branch on the exit status (or on `ok === false`,
per the discriminator rule above) BEFORE consuming the JSON:

```bash
out=$(cwlint check . --json)
status=$?
if [ $status -eq 0 ] || [ $status -eq 1 ]; then
  # Success envelope (exit 0 = clean; exit 1 = --strict gate tripped on real findings).
  schema=$(echo "$out" | jq -r '.schemaVersion // empty')
  if [ "$schema" != "0.1" ]; then
    echo "warning: cwlint schema changed to $schema; review parser" >&2
  fi
elif [ $status -eq 3 ] || [ $status -eq 64 ]; then
  # ErrorEnvelope on stdout under --json (controlled error / usage error).
  code=$(echo "$out" | jq -r '.code')
  echo "cwlint failed: $code" >&2
  exit $status
else
  # Exit 2 = uncaught runtime exception; freeform stderr, no JSON on stdout.
  exit $status
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
exit-code contract the CLI honours.

**Library API stability:** the exported shapes (`Report`, `Finding`,
`Severity`, return values of `exitCode`) are covered by the same
`schemaVersion` policy as the CLI JSON output. Additions are
non-breaking; removals or renames require a major `schemaVersion`
bump. The CLI is the **primary** supported contract; the library API
is provided for tooling that prefers in-process integration. If you
need byte-for-byte stability guarantees that the CLI gives, prefer
spawning the CLI and parsing `--json` output.

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
