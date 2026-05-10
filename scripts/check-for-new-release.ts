#!/usr/bin/env node
/**
 * Check for a newer Claude.app and run the extractor end-to-end.
 *
 * Node-native port of `_legacy/python/scripts/check_for_new_release.py`.
 *
 * Behaviour:
 *
 *   - With `--bundle <path>`: extract from a local bundle path. Used in CI
 *     to test the pipeline against the synthetic fixtures shipped under
 *     `test/fixtures/bundles/`.
 *
 *   - With `--app <path>` (default `/Applications/Claude.app`): inspect a
 *     real Claude.app installation. If the bundle's CFBundleShortVersionString
 *     differs from the bundled contract's `claude_app_version`, run the
 *     extractor pipeline against it and produce:
 *
 *         - `<output-dir>/cowork-v<NEW>.json`     - candidate contract
 *         - `<output-dir>/diff.md`                - PR-body markdown
 *
 *   - With `--dry-run`: skip the extraction; just emit a JSON summary
 *     indicating whether work would be done.
 *
 * `--cli-bundle <path>` lets the caller point at a pre-extracted Claude Code
 * CLI JS file. Auto-extracting the CLI from the Bun-SEA Mach-O binary the way
 * the legacy Python script tried is intentionally out of scope for D1 — pass
 * a pre-extracted file instead.
 *
 * Exits 0 always (use the report's `action` field to gate downstream steps).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import asarImport from "@electron/asar";
import plistImport from "plist";

import { diffSpecs, renderMarkdownDiff } from "../src/diff.js";
import { runExtractors } from "../src/extractors/index.js";
import { loadDefaultSpec } from "../src/spec.js";

// NodeNext default-export interop dance: some CJS modules are exposed both as
// the namespace itself and (when bundlers wrap them) as a `.default`. Prefer
// the namespace; fall back to `.default` when present.
const asar = (asarImport as unknown as { default?: typeof asarImport }).default ?? asarImport;
const plist = (plistImport as unknown as { default?: typeof plistImport }).default ?? plistImport;

interface CliArgs {
  app: string;
  bundle: string | undefined;
  cliBundle: string | undefined;
  outputDir: string;
  report: string;
  dryRun: boolean;
}

interface Summary {
  mode: "live" | "dry-run";
  current_known_claude_app_version: string;
  target_version: string | null;
  action?: "extracted" | "skip" | "fail" | "would-extract";
  reason?: string;
  candidate_contract?: string;
  diff_markdown?: string;
  fragment_keys?: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    app: "/Applications/Claude.app",
    bundle: undefined,
    cliBundle: undefined,
    outputDir: "watcher-output",
    report: "report.json",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--app":
        args.app = mustNext(argv, i++, "--app");
        break;
      case "--bundle":
        args.bundle = mustNext(argv, i++, "--bundle");
        break;
      case "--cli-bundle":
        args.cliBundle = mustNext(argv, i++, "--cli-bundle");
        break;
      case "--output-dir":
        args.outputDir = mustNext(argv, i++, "--output-dir");
        break;
      case "--report":
        args.report = mustNext(argv, i++, "--report");
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        process.stderr.write(`unknown argument: ${arg}\n`);
        process.exit(2);
    }
  }
  return args;
}

function mustNext(argv: string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (next === undefined) {
    process.stderr.write(`${flag} requires a value\n`);
    process.exit(2);
  }
  return next;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: check-for-new-release [options]",
      "",
      "Options:",
      "  --app <path>           Path to Claude.app (default: /Applications/Claude.app)",
      "  --bundle <path>        Pre-extracted desktop JS bundle (skips asar extraction)",
      "  --cli-bundle <path>    Pre-extracted CLI JS bundle",
      "  --output-dir <path>    Where to write candidate contract + diff.md (default: watcher-output)",
      "  --report <path>        Path to write the JSON summary (default: report.json)",
      "  --dry-run              Don't extract; just report what would happen",
      "  -h, --help             Show this help",
      "",
    ].join("\n"),
  );
}

function readAppVersion(appPath: string): string | null {
  const plistPath = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plistPath)) return null;
  let xml: string;
  try {
    xml = readFileSync(plistPath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = plist.parse(xml);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const v = (parsed as Record<string, unknown>)["CFBundleShortVersionString"];
  return typeof v === "string" ? v : null;
}

function extractAsar(asarPath: string, dest: string): boolean {
  try {
    asar.extractAll(asarPath, dest);
    return true;
  } catch (err) {
    process.stderr.write(
      `asar extraction failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return false;
  }
}

function loadCurrentContractRaw(): { path: string; data: Record<string, unknown> } {
  // Preserve every key from the bundled JSON (the typed `Spec` view drops
  // some, but `loadSpec` just JSON.parses then casts, so the underlying
  // record is intact). To be defensive, read the file ourselves the same way
  // `loadDefaultSpec` resolves it.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "contracts"), join(here, "..", "..", "contracts")];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("cowork-v") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) continue;
    const first = files[0];
    if (first === undefined) continue;
    const path = join(dir, first);
    return { path, data: JSON.parse(readFileSync(path, "utf-8")) };
  }
  throw new Error("No bundled cowork-v*.json contract found");
}

function writeReport(summary: Summary, reportPath: string): void {
  // Ensure parent dir exists for the report.
  const parent = dirname(resolve(reportPath));
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  const text = JSON.stringify(summary, null, 2);
  writeFileSync(reportPath, text, "utf-8");
  process.stdout.write(`${text}\n`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // Sanity: make sure our spec loader can find a contract (raises otherwise).
  loadDefaultSpec();
  const { data: currentDict } = loadCurrentContractRaw();
  const currentVersion =
    typeof currentDict["claude_app_version"] === "string"
      ? (currentDict["claude_app_version"] as string)
      : "";

  // Resolve target version
  let targetVersion: string | null = null;
  if (args.bundle) {
    targetVersion = "manual-bundle";
  } else if (existsSync(args.app)) {
    targetVersion = readAppVersion(args.app);
  }

  const summary: Summary = {
    mode: args.dryRun ? "dry-run" : "live",
    current_known_claude_app_version: currentVersion,
    target_version: targetVersion,
  };

  if (targetVersion === null) {
    summary.action = "skip";
    summary.reason = "no Claude.app found and no --bundle provided";
    writeReport(summary, args.report);
    return;
  }

  if (targetVersion === currentVersion) {
    summary.action = "skip";
    summary.reason = "current contract already matches installed Claude.app";
    writeReport(summary, args.report);
    return;
  }

  if (args.dryRun) {
    summary.action = "would-extract";
    writeReport(summary, args.report);
    return;
  }

  mkdirSync(args.outputDir, { recursive: true });

  // Resolve desktop bundle path
  let desktopBundle: string;
  if (args.bundle) {
    desktopBundle = args.bundle;
  } else {
    const asarPath = join(args.app, "Contents", "Resources", "app.asar");
    const extractDir = join(args.outputDir, "asar-extract");
    if (!extractAsar(asarPath, extractDir)) {
      summary.action = "fail";
      summary.reason = "asar extraction failed";
      writeReport(summary, args.report);
      return;
    }
    desktopBundle = join(extractDir, ".vite", "build", "index.js");
  }

  if (!existsSync(desktopBundle)) {
    summary.action = "fail";
    summary.reason = `desktop bundle not found at ${desktopBundle}`;
    writeReport(summary, args.report);
    return;
  }

  const desktopText = readFileSync(desktopBundle, "utf-8");
  const fragments: Record<string, unknown> = { ...runExtractors(desktopText, "desktop") };

  if (args.cliBundle && existsSync(args.cliBundle)) {
    const cliText = readFileSync(args.cliBundle, "utf-8");
    const cliFragments = runExtractors(cliText, "cli");
    for (const [k, v] of Object.entries(cliFragments)) {
      fragments[k] = v;
    }
  }

  // Compose a candidate contract by merging fragments over a shallow copy of
  // the current spec. For object-typed fields we shallow-merge so the
  // candidate keeps fields the extractor doesn't touch (e.g. `_description`).
  const candidate: Record<string, unknown> = { ...currentDict };
  candidate["claude_app_version"] = targetVersion;
  for (const [key, value] of Object.entries(fragments)) {
    const existing = candidate[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      candidate[key] = { ...existing, ...value };
    } else {
      candidate[key] = value;
    }
  }

  const candidatePath = join(args.outputDir, `cowork-v${targetVersion}.json`);
  writeFileSync(candidatePath, JSON.stringify(candidate, null, 2), "utf-8");

  const diff = diffSpecs(currentDict, candidate);
  const diffMd = renderMarkdownDiff(diff, currentVersion, targetVersion);
  const diffPath = join(args.outputDir, "diff.md");
  writeFileSync(diffPath, diffMd, "utf-8");

  summary.action = "extracted";
  summary.candidate_contract = candidatePath;
  summary.diff_markdown = diffPath;
  summary.fragment_keys = Object.keys(fragments).sort();
  writeReport(summary, args.report);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// CLI entrypoint — guard so importers can re-use the helpers if needed.
const invokedAsScript = (() => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  main();
}
