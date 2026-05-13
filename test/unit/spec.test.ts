/**
 * Tests for the spec loader + public package surface.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as cwlint from "../../src/index.js";
import { loadDefaultSpec, loadSpec, resolveDefaultSpecPath } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("package surface", () => {
  it("loadDefaultSpec returns spec_version '0'", () => {
    const spec = cwlint.loadDefaultSpec();
    expect(spec.spec_version).toBe("0");
  });

  it("re-exports the public API", () => {
    expect(typeof cwlint.checkRepo).toBe("function");
    expect(typeof cwlint.loadDefaultSpec).toBe("function");
    expect(typeof cwlint.loadSpec).toBe("function");
    expect(typeof cwlint.discover).toBe("function");
    expect(typeof cwlint.parseSuppressions).toBe("function");
    expect(Array.isArray(cwlint.ALL_RULES)).toBe(true);
  });
});

describe("loadSpec", () => {
  it("loads cowork-v2.1.121.json", () => {
    const spec = loadSpec(join(REPO_ROOT, "contracts", "cowork-v2.1.121.json"));
    expect(spec.spec_version).toBe("0");
    expect(spec.claude_app_version).toBe("1.6259.1");
    expect(spec.operon_core_version).toBe("2.1.121");
  });

  it("rejects spec_version != '0'", () => {
    const canonical = loadSpec(join(REPO_ROOT, "contracts", "cowork-v2.1.121.json")) as Record<
      string,
      unknown
    >;
    canonical.spec_version = "1";
    const { root, cleanup } = makeRepo({});
    try {
      const bad = join(root, "bad.json");
      writeFileSync(bad, JSON.stringify(canonical));
      expect(() => loadSpec(bad)).toThrowError(/Unsupported spec_version/);
    } finally {
      cleanup();
    }
  });
});

describe("loadDefaultSpec", () => {
  it("resolves the latest contract", () => {
    const spec = loadDefaultSpec();
    expect(spec.claude_app_version).toBe("1.6608.2");
  });

  it("async_dispatch_allowlist contains Bash", () => {
    const spec = loadDefaultSpec();
    expect(spec.subagent_tool_filter.async_dispatch_allowlist.names).toContain("Bash");
  });

  it("drop_set contains AskUserQuestion", () => {
    const spec = loadDefaultSpec();
    expect(spec.subagent_tool_filter.drop_set.names).toContain("AskUserQuestion");
  });

  it("kernel_env_passthrough allowlist contains PATH and HOME-deleted-after-filter", () => {
    const spec = loadDefaultSpec();
    expect(spec.kernel_env_passthrough.allowlist).toContain("PATH");
    expect(spec.kernel_env_passthrough.deleted_after_filter).toContain("HOME");
  });

  it("host_loop_excluded_builtins includes Bash with mcp__workspace__bash replacement", () => {
    const spec = loadDefaultSpec();
    const excluded = spec.host_loop_tool_substitution.host_loop_excluded_builtins;
    expect(excluded.names).toContain("Bash");
    expect(excluded.mcp_replacements?.Bash).toBe("mcp__workspace__bash");
  });
});

describe("resolveDefaultSpecPath", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cwlint-spec-resolve-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prefers cowork-latest.json when present", () => {
    const dir = join(tmp, "contracts");
    mkdirSync(dir);
    writeFileSync(join(dir, "cowork-latest.json"), "{}");
    writeFileSync(join(dir, "cowork-v9.9.9.json"), "{}");
    expect(resolveDefaultSpecPath([dir])).toBe(join(dir, "cowork-latest.json"));
  });

  it("falls back to the lexicographically-last cowork-v*.json when no symlink", () => {
    const dir = join(tmp, "contracts");
    mkdirSync(dir);
    writeFileSync(join(dir, "cowork-v1.6608.2.json"), "{}");
    writeFileSync(join(dir, "cowork-v2.1.121.json"), "{}");
    // Note: v2 > v1 lexicographically, so v2 wins — exactly the reason
    // cowork-latest.json is the preferred pointer in practice.
    expect(resolveDefaultSpecPath([dir])).toBe(join(dir, "cowork-v2.1.121.json"));
  });

  it("ignores non-matching filenames in the directory", () => {
    const dir = join(tmp, "contracts");
    mkdirSync(dir);
    writeFileSync(join(dir, "README.md"), "");
    writeFileSync(join(dir, "cowork-v1.6608.2.json"), "{}");
    writeFileSync(join(dir, "diff.md"), "");
    writeFileSync(join(dir, "schema.json"), "{}");
    expect(resolveDefaultSpecPath([dir])).toBe(join(dir, "cowork-v1.6608.2.json"));
  });

  it("skips unreadable / missing candidate directories and tries the next one", () => {
    const missing = join(tmp, "does-not-exist");
    const real = join(tmp, "contracts");
    mkdirSync(real);
    writeFileSync(join(real, "cowork-latest.json"), "{}");
    expect(resolveDefaultSpecPath([missing, real])).toBe(join(real, "cowork-latest.json"));
  });

  it("throws when no candidate yields a contract", () => {
    const emptyDir = join(tmp, "empty");
    mkdirSync(emptyDir);
    const missing = join(tmp, "does-not-exist");
    expect(() => resolveDefaultSpecPath([missing, emptyDir])).toThrowError(
      /No bundled cowork-v\*\.json contract found/,
    );
  });

  it("throws on an empty candidate list", () => {
    expect(() => resolveDefaultSpecPath([])).toThrowError(/No bundled cowork-v\*\.json/);
  });
});
