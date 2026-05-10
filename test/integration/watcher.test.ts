/**
 * Integration tests for the upstream-watcher script (Task D1).
 *
 * Spawns `tsx scripts/check-for-new-release.ts` against the synthetic
 * fixtures shipped under `test/fixtures/bundles/` so we exercise the same
 * CLI surface a CI run or a developer would.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/check-for-new-release.ts",
);

describe("watcher script", () => {
  it("--bundle on synthetic fixtures produces extracted output", () => {
    const outDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          scriptPath,
          "--bundle",
          "test/fixtures/bundles/synthetic-desktop.js",
          "--cli-bundle",
          "test/fixtures/bundles/synthetic-cli.js",
          "--output-dir",
          outDir,
          "--report",
          join(outDir, "report.json"),
        ],
        { encoding: "utf-8" },
      );
      const report = JSON.parse(readFileSync(join(outDir, "report.json"), "utf-8"));
      expect(report.action).toBe("extracted");
      expect(report.fragment_keys).toContain("subagent_tool_filter");
      expect(report.fragment_keys).toContain("host_loop_tool_substitution");
      // diff.md exists and starts with the expected header
      const diffMd = readFileSync(join(outDir, "diff.md"), "utf-8");
      expect(diffMd).toMatch(/^# Cowork contract:/);
      // Candidate contract was written, has the bumped version, and preserves
      // unchanged top-level fields from the bundled current contract.
      const candidatePath = join(outDir, `cowork-v${report.target_version}.json`);
      const candidate = JSON.parse(readFileSync(candidatePath, "utf-8"));
      expect(candidate.claude_app_version).toBe(report.target_version);
      expect(candidate.spec_version).toBe("0");
      expect(candidate.host_loop_tool_substitution).toBeDefined();
      expect(candidate.host_loop_tool_substitution.host_loop_safe_set.names).toContain("Task");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("--dry-run with --bundle reports would-extract without writing files", () => {
    const outDir = mkdtempSync(join(tmpdir(), "watcher-dryrun-"));
    try {
      const reportPath = join(outDir, "report.json");
      execFileSync(
        "npx",
        [
          "tsx",
          scriptPath,
          "--bundle",
          "test/fixtures/bundles/synthetic-desktop.js",
          "--dry-run",
          "--output-dir",
          outDir,
          "--report",
          reportPath,
        ],
        { encoding: "utf-8" },
      );
      const report = JSON.parse(readFileSync(reportPath, "utf-8"));
      expect(report.mode).toBe("dry-run");
      expect(report.action).toBe("would-extract");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
