/**
 * Unit tests for the text/json/sarif formatters.
 *
 * Originally ported line-for-line from `_legacy/python/tests/unit/test_output.py`;
 * the JSON checks now also cover the v0.2.0 envelope wrapper (`schemaVersion`
 * + `finishedAt`) and the new `list-rules` / `spec-info` JSON formatters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Finding, Report, Severity } from "../../src/findings.js";
import {
  type ErrorEnvelope,
  emitError,
  formatJson,
  formatSpecInfoJson,
  wrapEnvelope,
} from "../../src/output/json.js";
import { formatSarif } from "../../src/output/sarif.js";
import { formatText } from "../../src/output/text.js";
import { loadDefaultSpec } from "../../src/spec.js";

function makeReport(findings: Finding[] = []): Report {
  return {
    specVersion: "0",
    claudeAppVersion: "1.6259.1",
    findings,
  };
}

function makeFinding(ruleId = "CW001", severity: Severity = "error", line = 1): Finding {
  return {
    ruleId,
    severity,
    path: "agents/foo.md",
    line,
    message: "boom",
    detail: "some detail",
    suggestion: "fix it",
  };
}

describe("formatText", () => {
  it("renders the clean-report sentinel", () => {
    const out = formatText(makeReport());
    expect(out).toContain("no findings");
    expect(out).toContain("1.6259.1");
  });

  it("renders findings with rule id, path, message, suggestion, summary", () => {
    const out = formatText(makeReport([makeFinding()]));
    expect(out).toContain("CW001");
    expect(out).toContain("agents/foo.md");
    expect(out).toContain("boom");
    expect(out).toContain("fix it");
    expect(out).toContain("Summary");
  });
});

describe("formatJson", () => {
  it("matches the documented snake_case shape", () => {
    const payload = formatJson(makeReport([makeFinding()]));
    expect(payload.spec_version).toBe("0");
    expect(payload.claude_app_version).toBe("1.6259.1");
    expect(payload.findings[0]?.rule_id).toBe("CW001");
    expect(payload.findings[0]?.severity).toBe("error");
    expect(payload.findings[0]?.path).toBe("agents/foo.md");
    expect(payload.summary).toEqual({ error: 1, warn: 0, info: 0 });
  });

  it("is JSON-serialisable", () => {
    const payload = formatJson(makeReport([makeFinding()]));
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});

describe("wrapEnvelope", () => {
  it("emits schemaVersion + ISO finishedAt before the payload", () => {
    const env = wrapEnvelope({ hello: "world" });
    expect(env.schemaVersion).toBe("0.1");
    expect(env.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(env.hello).toBe("world");
    // Success envelopes must NOT carry an `ok` field — absence ≡ success.
    expect("ok" in env).toBe(false);
  });
});

describe("formatSpecInfoJson", () => {
  it("exposes the spec metadata + structural counts object", () => {
    const payload = formatSpecInfoJson(loadDefaultSpec());
    expect(payload.spec_version).toBe("0");
    expect(payload.claude_app_version).toBe("1.6608.2");
    expect(payload.counts.host_loop_safe_set).toBeGreaterThan(0);
    expect(payload.counts.subagent_async_dispatch_allowlist).toBe(19);
  });
});

describe("formatSarif", () => {
  it("emits a valid 2.1.0 envelope with the driver name", () => {
    const sarif = formatSarif(makeReport([makeFinding()])) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string } };
        results: Array<{ ruleId: string; level: string }>;
      }>;
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("claude-cowork-lint");
    expect(sarif.runs[0]?.results[0]?.ruleId).toBe("CW001");
    expect(sarif.runs[0]?.results[0]?.level).toBe("error");
  });

  it("maps severities error→error, warn→warning, info→note", () => {
    const sarif = formatSarif(
      makeReport([
        makeFinding("CW001", "error"),
        makeFinding("CW003", "warn"),
        makeFinding("CW009", "info"),
      ]),
    ) as { runs: Array<{ results: Array<{ level: string }> }> };
    const levels = sarif.runs[0]?.results.map((r) => r.level);
    expect(levels).toEqual(["error", "warning", "note"]);
  });

  it("deduplicates rules in tool.driver.rules", () => {
    const sarif = formatSarif(
      makeReport([
        makeFinding("CW001", "error", 1),
        makeFinding("CW001", "error", 2),
        makeFinding("CW003", "warn", 3),
      ]),
    ) as {
      runs: Array<{ tool: { driver: { rules: Array<{ id: string }> } } }>;
    };
    const ruleIds = sarif.runs[0]?.tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toEqual(["CW001", "CW003"]);
  });
});

describe("emitError", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const envelope: ErrorEnvelope = {
    ok: false,
    code: "E_PATH_NOT_FOUND",
    message: "repo path not found: /nonexistent",
    hint: "Pass the path to a directory containing SKILL.md.",
  };

  it("under --format json emits a single line of JSON on stdout, stderr stays empty", () => {
    emitError(envelope, { format: "json" });

    expect(stdoutChunks).toHaveLength(1);
    expect(stderrChunks).toEqual([]);

    const line = stdoutChunks[0] ?? "";
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line.trim()) as ErrorEnvelope;
    expect(parsed).toEqual(envelope);
    // Critical: success envelopes omit `ok`, error envelopes set it false —
    // agents discriminate on this first.
    expect(parsed.ok).toBe(false);
  });

  it("under --format text emits `<code>: <message>` then `hint:` on stderr, stdout stays empty", () => {
    emitError(envelope, { format: "text" });

    expect(stdoutChunks).toEqual([]);
    expect(stderrChunks).toEqual([
      "E_PATH_NOT_FOUND: repo path not found: /nonexistent\n",
      "hint: Pass the path to a directory containing SKILL.md.\n",
    ]);
  });

  it("under --format sarif also routes to stderr (same path as text)", () => {
    emitError(envelope, { format: "sarif" });

    expect(stdoutChunks).toEqual([]);
    expect(stderrChunks[0]).toContain("E_PATH_NOT_FOUND:");
  });

  it("omits the `hint:` line entirely when no hint is present", () => {
    const noHint: ErrorEnvelope = {
      ok: false,
      code: "E_USAGE",
      message: "unknown subcommand",
    };
    emitError(noHint, { format: "text" });

    expect(stderrChunks).toEqual(["E_USAGE: unknown subcommand\n"]);
  });

  it("JSON envelope on stdout is NOT wrapped — has no schemaVersion / finishedAt", () => {
    emitError(envelope, { format: "json" });
    const parsed = JSON.parse((stdoutChunks[0] ?? "").trim()) as Record<string, unknown>;
    // Per docs/CLI.md: agents branch on ok===false first; ErrorEnvelope is the
    // contract, not the success envelope.
    expect("schemaVersion" in parsed).toBe(false);
    expect("finishedAt" in parsed).toBe(false);
  });
});
