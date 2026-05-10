/**
 * JSON formatter — stable public shape documented in `docs/CLI.md`.
 *
 * Every `--format json` payload emitted by cwlint is wrapped in a small
 * envelope so downstream consumers can pin against `schemaVersion`:
 *
 *   { schemaVersion: "0.1", finishedAt: <ISO 8601>, ...payload }
 *
 * Success envelopes intentionally omit `ok`. Absence of `ok` ≡ success.
 * Error envelopes carry `ok: false` + a `code` discriminator — see
 * `ErrorEnvelope` below. Agents should branch on `ok === false` first.
 *
 * Snake_case keys (mirroring the Python original) and a fixed top-level
 * envelope so downstream consumers can pin against the schema. Driven by
 * `summarise()` for the counts, and `VERSION` from `src/about.ts` for the
 * `cwlint_version` field.
 */

import { VERSION } from "../about.js";
import type { Report } from "../findings.js";
import { summarise } from "../findings.js";
import type { Spec } from "../spec.js";

/** Current envelope schema version. Bump only on a breaking shape change. */
export const SCHEMA_VERSION = "0.1";

export interface Envelope {
  schemaVersion: string;
  finishedAt: string;
}

/**
 * Wrap an arbitrary success payload in the cwlint JSON envelope.
 *
 * `schemaVersion` and `finishedAt` are emitted first so consumers piping
 * through `jq '.schemaVersion'` see the version up front without scanning
 * past large arrays.
 */
export function wrapEnvelope<T extends object>(payload: T): Envelope & T {
  return {
    schemaVersion: SCHEMA_VERSION,
    finishedAt: new Date().toISOString(),
    ...payload,
  };
}

export interface JsonFinding {
  rule_id: string;
  severity: "error" | "warn" | "info";
  path: string;
  line: number;
  message: string;
  detail: string | null;
  suggestion: string | null;
}

export interface JsonReport {
  cwlint_version: string;
  spec_version: string;
  claude_app_version: string;
  findings: JsonFinding[];
  summary: { error: number; warn: number; info: number };
}

/**
 * Build the inner `check` JSON payload (no envelope). Exists as a standalone
 * function so unit tests can keep asserting on the documented snake_case
 * shape without re-reading `schemaVersion`/`finishedAt` on every call.
 *
 * Callers that emit to stdout should pipe through `wrapEnvelope()`; the CLI
 * does this in `src/cli.ts`.
 */
export function formatJson(report: Report): JsonReport {
  return {
    cwlint_version: VERSION,
    spec_version: report.specVersion,
    claude_app_version: report.claudeAppVersion,
    findings: report.findings.map((f) => ({
      rule_id: f.ruleId,
      severity: f.severity,
      path: f.path,
      line: f.line,
      message: f.message,
      detail: f.detail ?? null,
      suggestion: f.suggestion ?? null,
    })),
    summary: summarise(report),
  };
}

export interface JsonSpecInfo {
  spec_version: string;
  claude_app_version: string;
  operon_core_version: string;
  counts: {
    host_loop_safe_set: number;
    host_loop_excluded_builtins: number;
    subagent_drop_set: number;
    subagent_async_dispatch_allowlist: number;
    kernel_env_passthrough_allowlist: number;
    secret_unset_list: number;
  };
}

/**
 * Inner payload for `spec-info --format json`. Mirrors the counts the
 * text-mode formatter prints, exposed structurally under `counts`.
 */
export function formatSpecInfoJson(spec: Spec): JsonSpecInfo {
  return {
    spec_version: spec.spec_version,
    claude_app_version: spec.claude_app_version,
    operon_core_version: spec.operon_core_version,
    counts: {
      host_loop_safe_set: spec.host_loop_tool_substitution.host_loop_safe_set.names.length,
      host_loop_excluded_builtins:
        spec.host_loop_tool_substitution.host_loop_excluded_builtins.names.length,
      subagent_drop_set: spec.subagent_tool_filter.drop_set.names.length,
      subagent_async_dispatch_allowlist:
        spec.subagent_tool_filter.async_dispatch_allowlist.names.length,
      kernel_env_passthrough_allowlist: spec.kernel_env_passthrough.allowlist.length,
      secret_unset_list: spec.secret_unset_list.names.length,
    },
  };
}

// NOTE: There is intentionally no `formatDoctorJson()` wrapper here. The
// `runDoctor()` payload is spread directly into the envelope by the CLI:
//   wrapEnvelope(report)
// The envelope shape stays FLAT
// (`{schemaVersion, finishedAt, spec_version, claude_app_version, rules}`)
// — do NOT nest the doctor payload under a `report` key. That shape was
// considered and explicitly rejected in the v0.2.0 design review.

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

/**
 * Stable, append-only set of error-code discriminators. Documented in
 * `docs/CLI.md` § "Error codes". Reserved (not yet emitted) values are
 * `E_BUNDLE_NOT_FOUND` and `E_RUNTIME` — adding them is non-breaking.
 */
export type ErrorCode = "E_PATH_NOT_FOUND" | "E_SPEC_INVALID" | "E_USAGE";

/**
 * The on-the-wire shape emitted on stdout when `--format json` (or its
 * `--json` alias) is set AND the run fails. Agents discriminate on
 * `ok === false` BEFORE reading `schemaVersion` — that flag is the
 * canonical success/failure split.
 */
export interface ErrorEnvelope {
  ok: false;
  code: ErrorCode;
  message: string;
  hint?: string;
}

/**
 * Emit an `ErrorEnvelope` on the appropriate stream for the active output
 * format.
 *
 * - `format === "json"` → single-line JSON on **stdout** so a pipeline like
 *   `cwlint check missing/ --json | jq '.code'` works without the
 *   consumer needing to consult stderr. The envelope is NOT wrapped by
 *   `wrapEnvelope` — it has no `schemaVersion`/`finishedAt` fields,
 *   intentionally; consumers branch on `ok === false` first.
 * - `format === "text" | "sarif"` → freeform `<code>: <message>` (and an
 *   optional `hint:` line) on **stderr**, keeping stdout free of error
 *   noise for piped report consumers.
 *
 * The caller is responsible for `process.exit(<code>)` — this function
 * never exits on its own. See `docs/CLI.md` § "Exit codes" for the
 * canonical mapping.
 */
export function emitError(
  envelope: ErrorEnvelope,
  opts: { format: "text" | "json" | "sarif" },
): void {
  if (opts.format === "json") {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  process.stderr.write(`${envelope.code}: ${envelope.message}\n`);
  if (envelope.hint) {
    process.stderr.write(`hint: ${envelope.hint}\n`);
  }
}
