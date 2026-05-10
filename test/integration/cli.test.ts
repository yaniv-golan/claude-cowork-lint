/**
 * Smoke tests for the commander-based CLI (Task B1).
 *
 * Spawns `tsx src/cli.ts` as a subprocess so we exercise the same exit-code
 * + stdout path users see; intentionally avoids importing `cli.ts` directly,
 * since that file calls `process.exit` on the module-init path.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      // Clean repo emits the "no findings" sentinel rather than a "Summary"
      // line — assert on that to keep this test non-tautological.
      expect(out).toContain("no findings");
      expect(out).toContain("1.6608.2");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("check in warn-only mode reports findings via Summary and exits 0", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      // hooks/hooks.json fires CW011 (warn). Warn-only mode = exit 0, but
      // the Summary line must show "0 error" since CW011 isn't error-level.
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      mkdirSync(join(repo, "hooks"), { recursive: true });
      writeFileSync(join(repo, "hooks", "hooks.json"), '{"hooks": {}}');
      const out = execFileSync("npx", ["tsx", cliPath, "check", repo], { encoding: "utf-8" });
      expect(out).toContain("Summary:");
      expect(out).toContain("0 error");
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

  // ------------------------------------------------------------------
  // v0.2.0 envelope + --json alias tests.
  //
  // `finishedAt` is an ISO 8601 timestamp generated at run time; match it
  // with a regex so the tests don't flake on the actual clock.
  // ------------------------------------------------------------------

  const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("list-rules --json emits the envelope and rules array (CW010 deprecated)", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "list-rules", "--json"], {
      encoding: "utf-8",
    });
    const payload = JSON.parse(out) as {
      schemaVersion: string;
      finishedAt: string;
      rules: Array<{ ruleId: string; deprecated: boolean; status: string }>;
    };
    expect(payload.schemaVersion).toBe("0.1");
    expect(payload.finishedAt).toMatch(ISO_PATTERN);
    expect(payload.rules.length).toBe(11);
    const cw010 = payload.rules.find((r) => r.ruleId === "CW010");
    expect(cw010?.deprecated).toBe(true);
    expect(cw010?.status).toBe("deprecated");
  });

  it("list-rules --format json matches --json output shape", () => {
    const fromAlias = execFileSync("npx", ["tsx", cliPath, "list-rules", "--json"], {
      encoding: "utf-8",
    });
    const fromFormat = execFileSync("npx", ["tsx", cliPath, "list-rules", "--format", "json"], {
      encoding: "utf-8",
    });
    // Both should parse to the same shape modulo finishedAt.
    const a = JSON.parse(fromAlias) as { rules: unknown };
    const b = JSON.parse(fromFormat) as { rules: unknown };
    expect(a.rules).toEqual(b.rules);
  });

  it("spec-info --json emits the envelope and structural counts", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "spec-info", "--json"], {
      encoding: "utf-8",
    });
    const payload = JSON.parse(out) as {
      schemaVersion: string;
      finishedAt: string;
      spec_version: string;
      counts: { subagent_async_dispatch_allowlist: number };
    };
    expect(payload.schemaVersion).toBe("0.1");
    expect(payload.finishedAt).toMatch(ISO_PATTERN);
    expect(payload.spec_version).toBe("0");
    expect(payload.counts.subagent_async_dispatch_allowlist).toBe(19);
  });

  it("check --json wraps the report in the envelope while keeping the inner fields", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      const out = execFileSync("npx", ["tsx", cliPath, "check", repo, "--json"], {
        encoding: "utf-8",
      });
      const payload = JSON.parse(out) as {
        schemaVersion: string;
        finishedAt: string;
        cwlint_version: string;
        spec_version: string;
        claude_app_version: string;
        findings: unknown[];
        summary: { error: number; warn: number; info: number };
      };
      expect(payload.schemaVersion).toBe("0.1");
      expect(payload.finishedAt).toMatch(ISO_PATTERN);
      expect(payload.spec_version).toBe("0");
      expect(payload.claude_app_version).toBe("1.6608.2");
      expect(payload.cwlint_version).toBeDefined();
      expect(Array.isArray(payload.findings)).toBe(true);
      expect(payload.summary).toEqual({ error: 0, warn: 0, info: 0 });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("doctor --json emits the envelope with a flat (un-nested) shape", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "doctor", "--json"], {
      encoding: "utf-8",
    });
    const payload = JSON.parse(out) as {
      schemaVersion: string;
      finishedAt: string;
      spec_version: string;
      claude_app_version: string;
      rules: unknown[];
      report?: unknown;
    };
    expect(payload.schemaVersion).toBe("0.1");
    expect(payload.finishedAt).toMatch(ISO_PATTERN);
    expect(payload.spec_version).toBe("0");
    expect(payload.claude_app_version).toBeDefined();
    expect(Array.isArray(payload.rules)).toBe(true);
    // The doctor payload must NOT be nested under a `report` key.
    expect(payload.report).toBeUndefined();
  });

  it("--json with explicit --format sarif yields SARIF (format wins)", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      const out = execFileSync(
        "npx",
        ["tsx", cliPath, "check", repo, "--json", "--format", "sarif"],
        { encoding: "utf-8" },
      );
      const payload = JSON.parse(out) as {
        version: string;
        runs: unknown[];
        schemaVersion?: string;
      };
      // SARIF doesn't carry our envelope; format wins over the alias.
      expect(payload.version).toBe("2.1.0");
      expect(Array.isArray(payload.runs)).toBe(true);
      expect(payload.schemaVersion).toBeUndefined();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("--no-color flag produces output with no ANSI escape codes", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      const out = execFileSync("npx", ["tsx", cliPath, "check", repo, "--no-color"], {
        encoding: "utf-8",
      });
      // ANSI CSI sequences start with ESC (0x1B) + '['; build the pattern
      // dynamically to avoid embedding a control character in the source.
      const ansiPattern = new RegExp(`${String.fromCharCode(0x1b)}\\[`);
      expect(out).not.toMatch(ansiPattern);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("NO_COLOR=1 env var produces output with no ANSI escape codes", () => {
    const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
    try {
      writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
      const out = execFileSync("npx", ["tsx", cliPath, "check", repo], {
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      // ANSI CSI sequences start with ESC (0x1B) + '['; build the pattern
      // dynamically to avoid embedding a control character in the source.
      const ansiPattern = new RegExp(`${String.fromCharCode(0x1b)}\\[`);
      expect(out).not.toMatch(ansiPattern);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
