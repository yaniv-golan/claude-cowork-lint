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
 * Note: there is intentionally no `--warn-only` flag. Warn-only is the
 * default; commander v12 does not auto-pair Click-style `--strict / --warn-only`
 * boolean toggles, so we drop the redundant inverse rather than fake it.
 */

import { existsSync, readFileSync } from "node:fs";

import { Command } from "commander";

import { VERSION } from "./about.js";
import { checkRepo } from "./engine.js";
import { exitCode } from "./findings.js";
import { formatJson } from "./output/json.js";
import { formatSarif } from "./output/sarif.js";
import { formatText } from "./output/text.js";
import { ALL_RULES } from "./rules/index.js";
import { loadDefaultSpec, loadSpec } from "./spec.js";

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
  .option(
    "--ignore <ruleId>",
    "Rule IDs to skip (repeatable: --ignore CW001 --ignore CW002).",
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .action(
    (repo: string, opts: { spec?: string; strict: boolean; format: string; ignore?: string[] }) => {
      const fmt = opts.format;
      if (fmt !== "text" && fmt !== "json" && fmt !== "sarif") {
        process.stderr.write(`error: unknown --format '${fmt}' (expected text|json|sarif)\n`);
        process.exit(2);
      }
      const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();
      const report = checkRepo(repo, spec, { ignore: opts.ignore ?? [] });

      if (fmt === "json") {
        process.stdout.write(`${JSON.stringify(formatJson(report), null, 2)}\n`);
      } else if (fmt === "sarif") {
        process.stdout.write(`${JSON.stringify(formatSarif(report), null, 2)}\n`);
      } else {
        process.stdout.write(`${formatText(report)}\n`);
      }

      // exitCode() returns 1 only when --strict AND there's an error finding.
      // Otherwise 0 — that covers both "clean repo" and "warn-only mode".
      process.exit(exitCode(report, { strict: opts.strict }));
    },
  );

program
  .command("list-rules")
  .description("Print every CWxxx rule with severity and one-line summary.")
  .action(() => {
    const sorted = [...ALL_RULES].sort((a, b) => (a.ruleId < b.ruleId ? -1 : 1));
    for (const r of sorted) {
      process.stdout.write(`${r.ruleId}  ${r.severity}  ${r.summary}\n`);
    }
  });

program
  .command("spec-info")
  .description("Print metadata about the loaded contract.")
  .option("--spec <path>", "Override the bundled contract.")
  .action((opts: { spec?: string }) => {
    const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();
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
    for (const [k, v] of lines) {
      process.stdout.write(`${k.padEnd(width)}  ${v}\n`);
    }
  });

program
  .command("doctor")
  .description("Audit rules against the loaded contract; report stale or deprecated rules.")
  .option("--spec <path>", "Override the bundled contract.")
  .option("-f, --format <format>", "Output format: text|json", "text")
  .action(async (opts: { spec?: string; format: string }) => {
    const fmt = opts.format;
    if (fmt !== "text" && fmt !== "json") {
      process.stderr.write(`error: unknown --format '${fmt}' (expected text|json)\n`);
      process.exit(2);
    }
    // Dynamic import — keeps the doctor module out of the cold-path
    // startup graph (same convention as `extract`).
    const { runDoctor } = await import("./doctor.js");
    const spec = opts.spec ? loadSpec(opts.spec) : loadDefaultSpec();
    const report = runDoctor(spec);

    if (fmt === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    for (const r of report.rules) {
      const icon = r.overall === "ok" ? "✓" : r.overall === "deprecated" ? "—" : "✗";
      process.stdout.write(
        `${icon} ${r.ruleId}  ${r.overall.padEnd(11)}  verified ${r.verified_against}  status ${r.status}\n`,
      );
      if (r.overall === "stale") {
        for (const a of r.anchors.filter((x) => !x.resolved)) {
          process.stdout.write(`     missing anchor: ${a.path}\n`);
        }
      }
    }
  });

program
  .command("extract <bundle>")
  .description("Extract contract fragments from a Claude.app or CLI bundle.")
  .option(
    "--target <target>",
    "Bundle target: desktop (Claude.app .vite/build/index.js) | cli (Bun-SEA bundle).",
    "desktop",
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
