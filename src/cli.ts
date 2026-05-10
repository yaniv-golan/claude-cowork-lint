#!/usr/bin/env node
/**
 * `claude-cowork-lint` / `cwlint` — commander v12 entry point.
 *
 * Subcommands: `check`, `list-rules`, `spec-info`, `doctor`, `extract`.
 *
 * Exit-code contract (see `docs/CLI.md`):
 *   0 = clean, or warn-only mode (default) regardless of finding count
 *   1 = `--strict` AND at least one error-severity finding
 *   2 = runtime/parse exception (uncaught) — distinct from commander's own
 *       argument-parsing failures, which exit with commander's default code
 *       (1) and its own stderr message. The divergence is intentional: it
 *       lets CI distinguish "you invoked me wrong" (commander, code 1) from
 *       "I crashed" (this catch-all, code 2).
 *
 * Output-format contract:
 *   Every `--format json` payload is wrapped in
 *   `{schemaVersion: "0.1", finishedAt: <ISO 8601>, ...payload}`. Success
 *   envelopes intentionally omit `ok`; absence of `ok` ≡ success. Commit 2
 *   will layer `ok: false` onto an `ErrorEnvelope` shape — don't add
 *   `ok: true` here.
 *
 *   `--json` is a boolean shorthand for `--format json`. If both flags are
 *   passed explicitly, `--format` wins (`--json --format sarif` → SARIF).
 *   Detection uses Commander's `getOptionValueSource("format")` to tell
 *   user-passed from defaulted.
 *
 * Note: there is intentionally no `--warn-only` flag. Warn-only is the
 * default; commander v12 does not auto-pair Click-style `--strict / --warn-only`
 * boolean toggles, so we drop the redundant inverse rather than fake it.
 */

import { existsSync, readFileSync } from "node:fs";

import { Command } from "commander";

import { VERSION } from "./about.js";
import type { DoctorReport } from "./doctor.js";
import { checkRepo } from "./engine.js";
import { exitCode } from "./findings.js";
import { formatJson, formatSpecInfoJson, wrapEnvelope } from "./output/json.js";
import { formatSarif } from "./output/sarif.js";
import { formatText } from "./output/text.js";
import { RULE_META } from "./rules/_meta.js";
import { ALL_RULES } from "./rules/index.js";
import type { Spec } from "./spec.js";
import { loadDefaultSpec, loadSpec } from "./spec.js";

/**
 * Inner payload for `list-rules --format json`. Sorted by ruleId for stable
 * output; CW007 is reserved and intentionally omitted (not in `ALL_RULES`
 * / `RULE_META`).
 *
 * Lives in `cli.ts` rather than `src/output/` because import-boundary rules
 * forbid the output layer from touching `rules/`. The envelope wrapper in
 * `src/output/json.ts` is the shared piece; the per-subcommand payload
 * builders that need rule metadata stay in the CLI layer.
 */
interface JsonRuleSummary {
  ruleId: string;
  severity: "error" | "warn" | "info";
  summary: string;
  status: "stable" | "deprecated" | "experimental";
  verifiedAgainst: string;
  deprecated: boolean;
}

export function formatListRulesJson(): { rules: JsonRuleSummary[] } {
  const sorted = [...ALL_RULES].sort((a, b) => (a.ruleId < b.ruleId ? -1 : 1));
  const rules: JsonRuleSummary[] = sorted.map((r) => {
    const meta = RULE_META[r.ruleId];
    // Every rule in ALL_RULES has a RULE_META entry; the `?? ...` fallback
    // is purely to satisfy `noUncheckedIndexedAccess`.
    const status = meta?.status ?? "stable";
    return {
      ruleId: r.ruleId,
      severity: r.severity,
      summary: r.summary,
      status,
      verifiedAgainst: meta?.verifiedAgainst ?? "",
      deprecated: status === "deprecated",
    };
  });
  return { rules };
}

/**
 * Render `list-rules` as `id  sev  summary` lines.
 *
 * Lives in cli.ts (not `src/output/text.ts`) because the output layer is
 * forbidden from importing from `rules/`. The `color` option is reserved
 * for future ANSI work and currently has no visible effect — plain ASCII
 * is emitted unconditionally. See `shouldColor()` for the gate.
 */
export function formatTextListRules(
  rules: typeof ALL_RULES,
  _opts: { color: boolean } = { color: true },
): string {
  const sorted = [...rules].sort((a, b) => (a.ruleId < b.ruleId ? -1 : 1));
  return sorted.map((r) => `${r.ruleId}  ${r.severity}  ${r.summary}`).join("\n");
}

/**
 * Render `spec-info` as `key  value` padded rows.
 *
 * The `color` option is reserved for future ANSI work and currently has
 * no visible effect — plain ASCII is emitted unconditionally. See
 * `shouldColor()` for the gate.
 */
export function formatTextSpecInfo(
  spec: Spec,
  _opts: { color: boolean } = { color: true },
): string {
  const lines: Array<[string, string | number]> = [
    ["spec_version", spec.spec_version],
    ["claude_app_version", spec.claude_app_version],
    ["operon_core_version", spec.operon_core_version],
    ["host_loop_safe_set", spec.host_loop_tool_substitution.host_loop_safe_set.names.length],
    [
      "host_loop_excluded_builtins",
      spec.host_loop_tool_substitution.host_loop_excluded_builtins.names.length,
    ],
    ["subagent_drop_set", spec.subagent_tool_filter.drop_set.names.length],
    [
      "subagent_async_dispatch_allowlist",
      spec.subagent_tool_filter.async_dispatch_allowlist.names.length,
    ],
    ["kernel_env_passthrough_allowlist", spec.kernel_env_passthrough.allowlist.length],
    ["secret_unset_list", spec.secret_unset_list.names.length],
  ];
  const width = Math.max(...lines.map(([k]) => k.length));
  return lines.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join("\n");
}

/**
 * Render `doctor` output as one row per rule. The `color` option is
 * reserved for future ANSI work and currently has no visible effect —
 * plain ASCII (with Unicode glyphs for the status icon) is emitted
 * unconditionally. See `shouldColor()` for the gate.
 */
export function formatDoctorText(
  report: DoctorReport,
  _opts: { color: boolean } = { color: true },
): string {
  // Width of the `overall` column. Longest possible value is "deprecated"
  // (10 chars); pad to 11 for one space of breathing room.
  const OVERALL_WIDTH = 11;
  const out: string[] = [];
  for (const r of report.rules) {
    const icon = r.overall === "ok" ? "✓" : r.overall === "deprecated" ? "—" : "✗";
    out.push(
      `${icon} ${r.ruleId}  ${r.overall.padEnd(OVERALL_WIDTH)}  verified ${r.verified_against}  status ${r.status}`,
    );
    if (r.overall === "stale") {
      for (const a of r.anchors.filter((x) => !x.resolved)) {
        out.push(`     missing anchor: ${a.path}`);
      }
    }
  }
  return out.join("\n");
}

/**
 * Resolve the effective `--format` for a subcommand, honouring the `--json`
 * shorthand. `--format` wins when explicitly passed by the user (commander
 * reports its value source as `"cli"`); a defaulted format yields to
 * `--json`.
 */
function resolveFormat(cmd: Command, opts: { json?: boolean; format: string }): string {
  const source = cmd.getOptionValueSource("format");
  if (opts.json && source === "default") return "json";
  return opts.format;
}

/**
 * Returns true iff color output should be suppressed. Honours:
 *  - the `--no-color` CLI flag (commander sets `opts.color === false`),
 *  - the `NO_COLOR` env var (any non-empty value),
 *  - the `CI` env var (any value).
 *
 * The text formatter is plain ASCII today so this is mostly contractual —
 * but wiring it through means future ANSI work has a single gate. See
 * commit message for the contract rationale.
 */
function shouldColor(opts: { color?: boolean }): boolean {
  if (opts.color === false) return false;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.CI !== undefined && process.env.CI !== "") return false;
  return true;
}

const program = new Command();

program
  .name("claude-cowork-lint")
  .description("Validate Claude skill/plugin/agent repos against the Cowork runtime contract.")
  .version(`claude-cowork-lint ${VERSION}`, "-V, --version", "Print version and exit");

program
  .command("check <repo>")
  .description("Validate a repo against the Cowork runtime contract.")
  .option("--spec <path>", "Override the bundled contract.")
  .option("--strict", "Exit 1 on any error-severity finding (default: warn-only).", false)
  .option("-f, --format <format>", "Output format: text|json|sarif", "text")
  .option("--json", "Shorthand for --format json (overridden if --format is also passed).")
  .option("--no-color", "Suppress ANSI color (also honored: NO_COLOR=<anything>, CI=<anything>)")
  .option(
    "--ignore <ruleId>",
    "Rule IDs to skip (repeatable: --ignore CW001 --ignore CW002).",
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .addHelpText(
    "after",
    `
Examples:
  $ cwlint check . --strict
  $ cwlint check . --json --strict | jq '.findings[]'      # empty array on a clean repo
  $ cwlint check ./skill --ignore CW003 --ignore CW011
  $ cwlint check . --format sarif > findings.sarif
`,
  )
  .action(function (
    this: Command,
    repo: string,
    opts: {
      spec?: string;
      strict: boolean;
      format: string;
      json?: boolean;
      color?: boolean;
      ignore?: string[];
    },
  ) {
    const fmt = resolveFormat(this, opts);
    if (fmt !== "text" && fmt !== "json" && fmt !== "sarif") {
      process.stderr.write(`error: unknown --format '${fmt}' (expected text|json|sarif)\n`);
      process.exit(2);
    }
    // `color` is threaded into the text formatter, which currently ignores
    // it (plain ASCII). The wiring is in place so future ANSI work changes
    // only the formatter, not this call site.
    const color = shouldColor(opts);
    const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();
    const report = checkRepo(repo, spec, { ignore: opts.ignore ?? [] });

    if (fmt === "json") {
      process.stdout.write(`${JSON.stringify(wrapEnvelope(formatJson(report)), null, 2)}\n`);
    } else if (fmt === "sarif") {
      process.stdout.write(`${JSON.stringify(formatSarif(report), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatText(report, { color })}\n`);
    }

    // exitCode() returns 1 only when --strict AND there's an error finding.
    // Otherwise 0 — that covers both "clean repo" and "warn-only mode".
    process.exit(exitCode(report, { strict: opts.strict }));
  });

program
  .command("list-rules")
  .description("Print every CWxxx rule with severity and one-line summary.")
  .option("-f, --format <format>", "Output format: text|json", "text")
  .option("--json", "Shorthand for --format json (overridden if --format is also passed).")
  .option("--no-color", "Suppress ANSI color (also honored: NO_COLOR=<anything>, CI=<anything>)")
  .addHelpText(
    "after",
    `
Examples:
  $ cwlint list-rules
  $ cwlint list-rules --json | jq -r '.rules[].ruleId'
`,
  )
  .action(function (this: Command, opts: { format: string; json?: boolean; color?: boolean }) {
    const fmt = resolveFormat(this, opts);
    if (fmt !== "text" && fmt !== "json") {
      process.stderr.write(`error: unknown --format '${fmt}' (expected text|json)\n`);
      process.exit(2);
    }
    const color = shouldColor(opts);

    if (fmt === "json") {
      process.stdout.write(`${JSON.stringify(wrapEnvelope(formatListRulesJson()), null, 2)}\n`);
      return;
    }

    // Text mode intentionally retains the original `id  sev  summary`
    // layout. The JSON form is the one consumers should pin against.
    process.stdout.write(`${formatTextListRules(ALL_RULES, { color })}\n`);
  });

program
  .command("spec-info")
  .description("Print metadata about the loaded contract.")
  .option("--spec <path>", "Override the bundled contract.")
  .option("-f, --format <format>", "Output format: text|json", "text")
  .option("--json", "Shorthand for --format json (overridden if --format is also passed).")
  .option("--no-color", "Suppress ANSI color (also honored: NO_COLOR=<anything>, CI=<anything>)")
  .addHelpText(
    "after",
    `
Examples:
  $ cwlint spec-info
  $ cwlint spec-info --json | jq -r .claude_app_version
`,
  )
  .action(function (
    this: Command,
    opts: { spec?: string; format: string; json?: boolean; color?: boolean },
  ) {
    const fmt = resolveFormat(this, opts);
    if (fmt !== "text" && fmt !== "json") {
      process.stderr.write(`error: unknown --format '${fmt}' (expected text|json)\n`);
      process.exit(2);
    }
    const color = shouldColor(opts);

    const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();

    if (fmt === "json") {
      process.stdout.write(`${JSON.stringify(wrapEnvelope(formatSpecInfoJson(spec)), null, 2)}\n`);
      return;
    }

    process.stdout.write(`${formatTextSpecInfo(spec, { color })}\n`);
  });

program
  .command("doctor")
  .description("Audit rules against the loaded contract; report stale or deprecated rules.")
  .option("--spec <path>", "Override the bundled contract.")
  .option("-f, --format <format>", "Output format: text|json", "text")
  .option("--json", "Shorthand for --format json (overridden if --format is also passed).")
  .option("--no-color", "Suppress ANSI color (also honored: NO_COLOR=<anything>, CI=<anything>)")
  .addHelpText(
    "after",
    `
Examples:
  $ cwlint doctor
  $ cwlint doctor --json | jq '.rules[] | select(.overall=="stale")'
`,
  )
  .action(async function (
    this: Command,
    opts: { spec?: string; format: string; json?: boolean; color?: boolean },
  ) {
    const fmt = resolveFormat(this, opts);
    if (fmt !== "text" && fmt !== "json") {
      process.stderr.write(`error: unknown --format '${fmt}' (expected text|json)\n`);
      process.exit(2);
    }
    const color = shouldColor(opts);

    // Dynamic import — keeps the doctor module out of the cold-path
    // startup graph (same convention as `extract`).
    const { runDoctor } = await import("./doctor.js");
    const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();
    const report = runDoctor(spec);

    // Exit non-zero only when at least one rule is `stale` (anchor missing).
    // `deprecated` is intentional/known and does NOT trip CI — that's the
    // whole point of the lifecycle bit.
    const hasStale = report.rules.some((r) => r.overall === "stale");

    if (fmt === "json") {
      // FLAT envelope shape — do NOT nest `report` under a key. The doctor
      // payload's top-level fields (spec_version, claude_app_version, rules)
      // are spread directly into the envelope.
      process.stdout.write(`${JSON.stringify(wrapEnvelope(report), null, 2)}\n`);
      process.exit(hasStale ? 1 : 0);
    }
    process.stdout.write(`${formatDoctorText(report, { color })}\n`);
    process.exit(hasStale ? 1 : 0);
  });

program
  .command("extract <bundle>")
  .description("Extract contract fragments from a Claude.app or CLI bundle.")
  .option(
    "--target <target>",
    "Bundle target: desktop (Claude.app .vite/build/index.js) | cli (Bun-SEA bundle).",
    "desktop",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ cwlint extract /Applications/Claude.app/Contents/Resources/app.asar/.vite/build/index.js --target desktop > fragments.json
`,
  )
  .action(async (bundle: string, opts: { target: string }) => {
    const target = opts.target;
    if (target !== "desktop" && target !== "cli") {
      process.stderr.write(`error: unknown --target '${target}' (expected desktop|cli)\n`);
      process.exit(2);
    }
    if (!existsSync(bundle)) {
      process.stderr.write(`error: bundle file not found: ${bundle}\n`);
      process.exit(2);
    }
    // Dynamic import — keeps the @babel/* dependency out of the cold-path
    // (`check`, `list-rules`, `spec-info`) startup graph.
    const { runExtractors } = await import("./extractors/index.js");
    const text = readFileSync(bundle, "utf-8");
    const fragments = runExtractors(text, target);
    // `extract` is JSON-native (and emits a structured payload not driven
    // by the envelope contract). Intentionally not wrapped in `wrapEnvelope`
    // — see SPEC-EXTRACTION.md.
    process.stdout.write(`${JSON.stringify(fragments, null, 2)}\n`);
    process.exit(0);
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    // Code 2 = runtime/uncaught exception. Commander's own parse errors
    // bypass this catch and exit with its default (1).
    process.exit(2);
  }
}

void main();
