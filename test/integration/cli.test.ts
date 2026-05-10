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
  it("--version prints claude-cowork-lint <semver>", () => {
    const out = execFileSync("npx", ["tsx", cliPath, "--version"], { encoding: "utf-8" });
    // Match the shape, not the exact version, so this test doesn't have
    // to be touched on every release bump.
    expect(out).toMatch(/^claude-cowork-lint \d+\.\d+\.\d+\b/);
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

  // These assertions verify the contract — that --no-color, NO_COLOR, and CI
  // produce zero ANSI escapes — but are currently VACUOUSLY satisfied because
  // the text formatter emits plain ASCII unconditionally. When the formatter
  // gains conditional ANSI output, these tests will become load-bearing
  // without needing changes (the `color` option is already threaded through).
  describe("--no-color and NO_COLOR/CI env vars suppress ANSI", () => {
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

  // ------------------------------------------------------------------
  // Commit 2: ErrorEnvelope + exit-code split tests.
  //
  // `execFileSync` throws on a non-zero exit; the error carries `status`
  // (exit code), `stdout`, and `stderr`. The helper below captures all
  // three so each assertion can read whichever stream is load-bearing.
  // ------------------------------------------------------------------

  function runCli(
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
  ): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", cliPath, ...args], {
        encoding: "utf-8",
        stdio: "pipe",
        env: env ?? process.env,
      });
      return { status: 0, stdout, stderr: "" };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        status: e.status ?? -1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  describe("ErrorEnvelope + exit-code split", () => {
    it("check /nonexistent --json emits ErrorEnvelope on stdout, exits 3", () => {
      const { status, stdout } = runCli(["check", "/nonexistent/path/here", "--json"]);
      expect(status).toBe(3);
      const env = JSON.parse(stdout) as {
        ok: boolean;
        code: string;
        message: string;
        hint?: string;
      };
      expect(env.ok).toBe(false);
      expect(env.code).toBe("E_PATH_NOT_FOUND");
      expect(env.message).toContain("/nonexistent/path/here");
      // Hints are documented as optional but emitted for E_PATH_NOT_FOUND
      // — pin the presence to lock in the agent UX.
      expect(env.hint).toBeDefined();
    });

    it("check /nonexistent (text mode) emits to stderr, exits 3", () => {
      const { status, stdout, stderr } = runCli(["check", "/nonexistent/path/here"]);
      expect(status).toBe(3);
      // stdout stays clean for piped report consumers.
      expect(stdout).toBe("");
      expect(stderr).toContain("E_PATH_NOT_FOUND");
      expect(stderr).toContain("/nonexistent/path/here");
      expect(stderr).toContain("hint:");
    });

    it("check . --spec /nonexistent/spec.json exits 3 with E_PATH_NOT_FOUND", () => {
      // Missing-file case is E_PATH_NOT_FOUND ("path doesn't exist"), NOT
      // E_SPEC_INVALID — the latter is reserved for files that exist but
      // are malformed or carry the wrong spec_version.
      const { status, stderr } = runCli(["check", ".", "--spec", "/nonexistent/spec/path.json"]);
      expect(status).toBe(3);
      expect(stderr).toContain("E_PATH_NOT_FOUND");
      expect(stderr).not.toContain("E_SPEC_INVALID");
      expect(stderr).toContain("/nonexistent/spec/path.json");
    });

    it("check . --spec /nonexistent/spec.json --json emits E_PATH_NOT_FOUND on stdout, exits 3", () => {
      const { status, stdout } = runCli([
        "check",
        ".",
        "--spec",
        "/nonexistent/spec/path.json",
        "--json",
      ]);
      expect(status).toBe(3);
      const env = JSON.parse(stdout) as {
        ok: boolean;
        code: string;
        message: string;
        hint?: string;
      };
      expect(env.ok).toBe(false);
      expect(env.code).toBe("E_PATH_NOT_FOUND");
      expect(env.message).toContain("/nonexistent/spec/path.json");
      expect(env.hint).toBeDefined();
    });

    it("check . --spec <malformed-json> --json emits E_SPEC_INVALID envelope on stdout, exits 3", () => {
      const specPath = join(tmpdir(), `cwlint-malformed-spec-${Date.now()}.json`);
      try {
        // Deliberately malformed JSON.
        writeFileSync(specPath, '{ "spec_version": "0", "broken":');
        const { status, stdout } = runCli(["check", ".", "--spec", specPath, "--json"]);
        expect(status).toBe(3);
        const env = JSON.parse(stdout) as { ok: boolean; code: string; message: string };
        expect(env.ok).toBe(false);
        expect(env.code).toBe("E_SPEC_INVALID");
        expect(env.message).toContain("malformed JSON");
        expect(env.message).toContain(specPath);
      } finally {
        rmSync(specPath, { force: true });
      }
    });

    it("unknown subcommand exits 64 with E_USAGE on stderr, stdout empty", () => {
      const { status, stdout, stderr } = runCli(["totally-bogus-cmd"]);
      expect(status).toBe(64);
      // Commander writes its own "error: unknown command ..." to stderr
      // before our handler appends the E_USAGE envelope on top; both lines
      // should be present. stdout must stay empty so piped report consumers
      // never see usage noise.
      expect(stderr).toContain("E_USAGE");
      expect(stdout).toBe("");
    });

    it("check --bad-flag --json routes E_USAGE envelope to stdout as JSON, exits 64", () => {
      // Commander's exit-override hook fires BEFORE the action body resolves
      // --json/--format, so handleCommanderError has to recover the intended
      // format via an argv pre-scan. This test pins that contract: usage
      // errors under --json land on stdout as a parseable envelope, not on
      // stderr as text.
      const { status, stdout, stderr } = runCli(["check", "--bad-flag", "--json"]);
      expect(status).toBe(64);
      const env = JSON.parse(stdout) as { ok: boolean; code: string; message: string };
      expect(env.ok).toBe(false);
      expect(env.code).toBe("E_USAGE");
      // Commander still writes its own "error: unknown option..." line to
      // stderr; we don't assert on its exact wording, just that the
      // structured envelope is on stdout.
      expect(stderr).not.toContain("{");
    });

    it("check . --strict on a repo with errors exits 1 (preserved contract)", () => {
      // Regression: --strict → 1 is the established CI gate and must not
      // be conflated with the new exit 3 (controlled error) or exit 64
      // (usage) buckets.
      const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
      try {
        writeFileSync(
          join(repo, "SKILL.md"),
          "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
        );
        const { status } = runCli(["check", repo, "--strict"]);
        expect(status).toBe(1);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("check . --quiet on a clean repo suppresses the success line", () => {
      const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
      try {
        writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
        const { status, stdout } = runCli(["check", repo, "--quiet"]);
        expect(status).toBe(0);
        // stdout intentionally empty under --quiet on a clean repo.
        expect(stdout).toBe("");
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("check . --quiet --json is a no-op (JSON output unaffected)", () => {
      const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
      try {
        writeFileSync(join(repo, "SKILL.md"), "---\nuser-invocable: true\n---\nbody");
        const { status, stdout } = runCli(["check", repo, "--quiet", "--json"]);
        expect(status).toBe(0);
        // --quiet must not suppress the JSON envelope.
        const payload = JSON.parse(stdout) as {
          schemaVersion: string;
          findings: unknown[];
        };
        expect(payload.schemaVersion).toBe("0.1");
        expect(Array.isArray(payload.findings)).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("check . --json --strict on a repo with errors exits 1 with envelope intact", () => {
      // Bonus: the JSON envelope still gets emitted; --strict only signals
      // via the exit code.
      const repo = mkdtempSync(join(tmpdir(), "cwlint-cli-"));
      try {
        writeFileSync(
          join(repo, "SKILL.md"),
          "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
        );
        const { status, stdout } = runCli(["check", repo, "--strict", "--json"]);
        expect(status).toBe(1);
        const payload = JSON.parse(stdout) as {
          schemaVersion: string;
          summary: { error: number };
          findings: unknown[];
        };
        expect(payload.schemaVersion).toBe("0.1");
        expect(payload.summary.error).toBeGreaterThan(0);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });
  });
});
