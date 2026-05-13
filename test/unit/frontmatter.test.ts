/**
 * Unit tests for the tiny YAML-frontmatter parser. These exercise the
 * parsing branches that the rule-level integration tests didn't reach
 * directly (block lists, null/~, scalar booleans, the find-token fallback).
 */

import { describe, expect, it } from "vitest";

import { findTokenLine, parseFrontmatter } from "../../src/frontmatter.js";

describe("parseFrontmatter", () => {
  it("returns null when there is no frontmatter block at all", () => {
    expect(parseFrontmatter("# just a heading\n\nsome body")).toBeNull();
  });

  it("returns null when the closing `---` is missing", () => {
    expect(parseFrontmatter("---\nuser-invocable: true\n# never closes")).toBeNull();
  });

  it("parses inline list values", () => {
    const fm = parseFrontmatter("---\ntools: [Read, Write, Bash]\n---\nbody");
    expect(fm).not.toBeNull();
    expect(fm?.data.tools).toEqual(["Read", "Write", "Bash"]);
  });

  it("strips surrounding quotes from inline-list items", () => {
    const fm = parseFrontmatter(`---\ntools: ["Read", 'Write']\n---\n`);
    expect(fm?.data.tools).toEqual(["Read", "Write"]);
  });

  it("parses block-list values (the `key:\\n  - item` shape)", () => {
    const text = ["---", "tools:", "  - Read", "  - Write", "  - Bash", "---", "body"].join("\n");
    const fm = parseFrontmatter(text);
    expect(fm?.data.tools).toEqual(["Read", "Write", "Bash"]);
  });

  it("strips surrounding quotes from block-list items", () => {
    const text = ["---", "tools:", `  - "Read"`, `  - 'Write'`, "---"].join("\n");
    const fm = parseFrontmatter(text);
    expect(fm?.data.tools).toEqual(["Read", "Write"]);
  });

  it("parses scalar booleans and null/~", () => {
    const text = [
      "---",
      "user-invocable: true",
      "disable-model-invocation: false",
      "argument-hint: null",
      "description: ~",
      "---",
    ].join("\n");
    const fm = parseFrontmatter(text);
    expect(fm?.data["user-invocable"]).toBe(true);
    expect(fm?.data["disable-model-invocation"]).toBe(false);
    expect(fm?.data["argument-hint"]).toBeNull();
    expect(fm?.data.description).toBeNull();
  });

  it("strips surrounding quotes from scalar string values", () => {
    const fm = parseFrontmatter(`---\nname: "my-skill"\nargument-hint: 'optional'\n---\n`);
    expect(fm?.data.name).toBe("my-skill");
    expect(fm?.data["argument-hint"]).toBe("optional");
  });

  it("ignores blank lines and comment lines inside the frontmatter", () => {
    const text = [
      "---",
      "# this is a comment",
      "",
      "user-invocable: true",
      "# another comment",
      "---",
    ].join("\n");
    const fm = parseFrontmatter(text);
    expect(fm?.data["user-invocable"]).toBe(true);
    expect(Object.keys(fm?.data ?? {})).toEqual(["user-invocable"]);
  });

  it("skips malformed (no `: value`) lines without throwing", () => {
    const text = ["---", "this-line-has-no-colon-at-all", "user-invocable: true", "---"].join("\n");
    const fm = parseFrontmatter(text);
    expect(fm?.data["user-invocable"]).toBe(true);
    expect(fm?.data["this-line-has-no-colon-at-all"]).toBeUndefined();
  });

  it("records bodyStartLine = 2 (the line after the opening fence)", () => {
    const fm = parseFrontmatter("---\nfoo: bar\n---\nbody");
    expect(fm?.bodyStartLine).toBe(2);
  });
});

describe("findTokenLine", () => {
  const SKILL = ["---", "tools: [Read]", "---", "", "Use Bash here.", "", "Also Bash again."].join(
    "\n",
  );

  it("returns 1-based line number of the first match from line 1", () => {
    expect(findTokenLine(SKILL, "Bash")).toBe(5);
  });

  it("respects fromLine when scanning later", () => {
    expect(findTokenLine(SKILL, "Bash", 6)).toBe(7);
  });

  it("does not match substrings of CamelCase or snake_case identifiers", () => {
    // Line 1 contains only `BashTool` (Bash followed by T → fails the
    // lookahead) and `not_Bash_token` (underscores on both sides → fail the
    // lookbehind AND lookahead). No bare-Bash match on line 1.
    const text = "BashTool and not_Bash_token used here.\nBare Bash here.";
    expect(findTokenLine(text, "Bash")).toBe(2);
  });

  it("falls back to fromLine when the token is not present at or after it", () => {
    const text = "no token here\nstill no\n";
    // Token absent → caller-supplied fromLine returned (not 0, not -1).
    expect(findTokenLine(text, "Bash", 3)).toBe(3);
    expect(findTokenLine(text, "Bash")).toBe(1);
  });

  it("escapes regex metacharacters in the token name", () => {
    const text = "before\nmcp__workspace__bash here\nafter";
    // No throw, finds the literal `mcp__workspace__bash` token.
    expect(findTokenLine(text, "mcp__workspace__bash")).toBe(2);
  });
});
