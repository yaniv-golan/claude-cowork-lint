/**
 * Unit tests for the AST-based bundle extractors.
 *
 * Tested against the synthetic fixtures under test/fixtures/bundles/. Real
 * Claude.app + CLI bundles are validated manually after this suite passes
 * (see Tasks C1+C2 acceptance gate in the plan).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { AMBIGUOUS, buildContext, resolveStringSet } from "../../src/extractors/_ast.js";
import { extractHostLoop } from "../../src/extractors/host-loop.js";
import { runExtractors } from "../../src/extractors/index.js";
import { extractKernelEnvAllowlist } from "../../src/extractors/kernel-env-allowlist.js";
import { extractSecretUnsetList } from "../../src/extractors/secret-unset-list.js";
import { extractSubagentFilter } from "../../src/extractors/subagent-filter.js";

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "bundles");
const desktopSource = readFileSync(join(FIXTURES_DIR, "synthetic-desktop.js"), "utf-8");
const cliSource = readFileSync(join(FIXTURES_DIR, "synthetic-cli.js"), "utf-8");
const ambiguousSource = readFileSync(join(FIXTURES_DIR, "synthetic-ambiguous.js"), "utf-8");

const desktopCtx = buildContext(desktopSource);
const cliCtx = buildContext(cliSource);

describe("extractKernelEnvAllowlist", () => {
  it("extracts the MGn-style allowlist with HOME / PATH / OPERON_SECRET_VARS", () => {
    const frag = extractKernelEnvAllowlist(desktopCtx);
    expect(frag).not.toBeNull();
    if (frag === null) return;
    expect(frag.allowlist).toContain("HOME");
    expect(frag.allowlist).toContain("PATH");
    expect(frag.allowlist).toContain("OPERON_SECRET_VARS");
    expect(frag.deleted_after_filter).toContain("HOME");
  });
});

describe("extractSecretUnsetList", () => {
  it("extracts the secret-unset list with the anchor triple", () => {
    const frag = extractSecretUnsetList(desktopCtx);
    expect(frag).not.toBeNull();
    if (frag === null) return;
    expect(frag.names).toContain("ANTHROPIC_API_KEY");
    expect(frag.names).toContain("OPENAI_API_KEY");
    expect(frag.names).toContain("OPERON_EZPROXY_COOKIE");
    expect(frag.count).toBe(frag.names.length);
  });
});

describe("extractHostLoop", () => {
  it("resolves spread members in host_loop_safe_set (count = 17, includes TodoWrite)", () => {
    const frag = extractHostLoop(desktopCtx);
    expect(frag).not.toBeNull();
    if (frag === null) return;
    expect(frag.host_loop_safe_set).toBeDefined();
    if (frag.host_loop_safe_set === undefined) return;
    expect(frag.host_loop_safe_set.count).toBe(17);
    expect(frag.host_loop_safe_set.names).toContain("TodoWrite");
    expect(frag.host_loop_safe_set.names).toContain("SendUserMessage");
  });

  it("identifies host_loop_excluded_builtins as exactly 5 names with mcp_replacements", () => {
    const frag = extractHostLoop(desktopCtx);
    expect(frag).not.toBeNull();
    if (frag === null) return;
    expect(frag.host_loop_excluded_builtins).toBeDefined();
    if (frag.host_loop_excluded_builtins === undefined) return;
    expect(frag.host_loop_excluded_builtins.count).toBe(5);
    expect(new Set(frag.host_loop_excluded_builtins.names)).toEqual(
      new Set(["Bash", "NotebookEdit", "REPL", "JavaScript", "WebFetch"]),
    );
    expect(frag.host_loop_excluded_builtins.mcp_replacements.Bash).toBe("mcp__workspace__bash");
    expect(frag.host_loop_excluded_builtins.mcp_replacements.WebFetch).toBe(
      "mcp__workspace__web_fetch",
    );
  });
});

describe("extractSubagentFilter", () => {
  it("resolves symbols (19 names in async allowlist; symbol = Ys_; drop_set = 6)", () => {
    const frag = extractSubagentFilter(cliCtx);
    expect(frag).not.toBeNull();
    if (frag === null) return;
    expect(frag.filter_fn_symbol).toBe("LW8");

    expect(frag.async_dispatch_allowlist).toBeDefined();
    if (frag.async_dispatch_allowlist === undefined) return;
    expect(frag.async_dispatch_allowlist.symbol).toBe("Ys_");
    expect(frag.async_dispatch_allowlist.count).toBe(19);
    expect(frag.async_dispatch_allowlist.names).toContain("Bash");
    expect(frag.async_dispatch_allowlist.names).toContain("PowerShell");

    expect(frag.drop_set).toBeDefined();
    if (frag.drop_set === undefined) return;
    expect(frag.drop_set.count).toBe(6);

    expect(frag.non_builtin_extra_drop_set).toBeDefined();
    if (frag.non_builtin_extra_drop_set === undefined) return;
    expect(frag.non_builtin_extra_drop_set.count).toBe(6);
  });
});

describe("runExtractors", () => {
  it("routes desktop targets to desktop extractors only", () => {
    const out = runExtractors(desktopSource, "desktop");
    expect(out.kernel_env_passthrough).toBeDefined();
    expect(out.secret_unset_list).toBeDefined();
    expect(out.host_loop_tool_substitution).toBeDefined();
    expect(out.subagent_tool_filter).toBeUndefined();
  });

  it("routes cli targets to cli extractors only", () => {
    const out = runExtractors(cliSource, "cli");
    expect(out.subagent_tool_filter).toBeDefined();
    expect(out.kernel_env_passthrough).toBeUndefined();
    expect(out.host_loop_tool_substitution).toBeUndefined();
  });
});

describe("AMBIGUOUS sentinel", () => {
  it("returns [] when an identifier has multiple top-level bindings", () => {
    const ctx = buildContext(ambiguousSource);
    expect(ctx.symbolMap.get("H9")).toBe(AMBIGUOUS);
    const result = resolveStringSet(ctx, t.identifier("H9"));
    expect(result).toEqual([]);
  });
});

describe("AssignmentExpression capture", () => {
  it("completes forward declarations without poisoning module-init bindings", () => {
    const src = `
      var $zH;
      $zH = new Set(["TaskOutput", "ExitPlanMode"]);
      function helper() { $zH = "junk"; }   // reassignment in inner scope — must NOT poison
    `;
    const ctx = buildContext(src);
    expect(ctx.symbolMap.get("$zH")).not.toBe(AMBIGUOUS);
    const names = resolveStringSet(ctx, t.identifier("$zH"));
    expect(names).toEqual(["TaskOutput", "ExitPlanMode"]);
  });

  it("does not record assignments to identifiers without a forward declaration", () => {
    const src = `
      function f() { x = 1; }   // no \`var x;\` ahead — must not appear in symbolMap
      var foo = "kept";
    `;
    const ctx = buildContext(src);
    expect(ctx.symbolMap.has("x")).toBe(false);
    expect(ctx.symbolMap.has("foo")).toBe(true);
  });
});
