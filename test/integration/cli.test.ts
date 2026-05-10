/**
 * Smoke tests for the commander-based CLI (Task B1).
 *
 * Spawns `tsx src/cli.ts` as a subprocess so we exercise the same exit-code
 * + stdout path users see; intentionally avoids importing `cli.ts` directly,
 * since that file calls `process.exit` on the module-init path.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "../../src/cli.ts");

describe("cli", () => {
  it("--version prints claude-cowork-lint 0.1.0", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "--version"], { encoding: "utf-8" });
    expect(out.trim()).toBe("claude-cowork-lint 0.1.0");
  });

  it("list-rules prints 11 rules with no CW007", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "list-rules"], { encoding: "utf-8" });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(11);
    expect(out).not.toContain("CW007");
    expect(out).toContain("CW001");
    expect(out).toContain("CW012");
  });

  it("check on a clean repo exits 0", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      const out = execFileSync("npx", ["tsx", cliPath, "check", repo], { encoding: "utf-8" });
      // Stub text formatter is minimal; just check we got SOME output and no throw.
      expect(out.length).toBeGreaterThan(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("check with --strict and a CW004 violation exits 1", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(
        join(repo, "SKILL.md"),
        "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
      );
      let exitCode = 0;
      try {
        execFileSync("npx", ["tsx", cliPath, "check", repo, "--strict"], {
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (err) {
        exitCode = (err as { status?: number }).status ?? -1;
      }
      expect(exitCode).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
