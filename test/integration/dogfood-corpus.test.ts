/**
 * Integration smoke test for the canonical dogfood corpus.
 *
 * Each fixture under `test/fixtures/dogfood/` mirrors a pattern that
 * surfaced during a real dogfood pass. The test walks every fixture, mounts
 * its content at the location the rule expects (skill / hook / agent), and
 * asserts a small per-fixture expectations table: which rules MUST fire and
 * which MUST NOT fire.
 *
 * Adding a new fixture: drop it in the corpus directory, add an entry to
 * `EXPECTATIONS`, and ensure the README provenance row is updated.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

interface FixtureExpectation {
  /** Where the fixture content lives inside the synthetic repo. */
  target: string;
  /** Rule IDs that MUST fire at least once. */
  must_fire: readonly string[];
  /** Rule IDs that MUST NOT fire. */
  must_not_fire?: readonly string[];
  /** Optional companion files needed for the rule to fire (e.g. plugin.json). */
  extras?: Record<string, string>;
  /**
   * Optional substrings that MUST NOT appear in the `message` of any finding.
   * Used to assert that a rule fires for the right reason — e.g. CW006 fires
   * on a `command:` field but NOT on tool-like words in `prompt:` prose.
   */
  forbidden_message_substrings?: readonly string[];
  /**
   * Optional upper-bound on the number of findings per rule. Used to guard
   * dedup/one-per-cue contracts: a fixture that exists to prove "this rule
   * fires AT MOST N times" declares the bound here. Without this, a
   * regression that multiplies findings would still satisfy `must_fire`.
   */
  per_rule_max?: Record<string, number>;
}

const CORPUS_DIR = join(__dirname, "..", "fixtures", "dogfood");

// One entry per fixture. Keys are the fixture filenames (relative to
// CORPUS_DIR). Rules listed in `must_not_fire` MUST stay silent — these
// are the "false-positive prevention" assertions.
const EXPECTATIONS: Record<string, FixtureExpectation> = {
  "clean-skill.md": {
    target: "skills/clean/SKILL.md",
    must_fire: [],
    must_not_fire: ["CW001", "CW002", "CW003", "CW004", "CW005", "CW006", "CW008"],
  },
  "disable-model-invocation.md": {
    target: "skills/scanner-helper/SKILL.md",
    must_fire: ["CW004"],
  },
  "hook-with-prompt-field.json": {
    // Plugin-scoped hooks file. CW011/CW012 fire because the file exists.
    // CW006 IS expected to fire — on the `command:` field that mentions
    // "WriteFile". The CRITICAL assertion is that CW006 fires ONLY on the
    // command, never on prose tokens like "Real" or "Read" appearing in
    // the natural-language `prompt:` field. This is enforced by
    // `forbidden_message_substrings` below.
    target: ".claude-plugin/hooks/hooks.json",
    must_fire: ["CW006", "CW011", "CW012"],
    extras: {
      ".claude-plugin/plugin.json": '{"name":"prose-prompt","version":"0.1.0"}',
    },
    // The prompt: field contains the English words "Real" and "Read".
    // Both are similar enough to known tool names that a regex-based
    // detector would flag them. CW006 must not.
    forbidden_message_substrings: ["'Real'", "'Read'"],
  },
  "hooks-with-broken-events.json": {
    target: ".claude-plugin/hooks/hooks.json",
    must_fire: ["CW011", "CW012"],
    extras: {
      ".claude-plugin/plugin.json": '{"name":"broken-events","version":"0.1.0"}',
    },
  },
  "multi-cue-bash-fence.md": {
    target: "skills/ship/SKILL.md",
    must_fire: ["CW008"],
    // Guards the B3 fix: even when multiple kernel-cue tokens appear inside
    // a single bash fence, CW008 must report it at most once.
    per_rule_max: { CW008: 1 },
  },
  "agents-with-shorthand-tools.md": {
    target: "agents/shorthand.md",
    must_fire: ["CW001", "CW002"],
  },
};

describe("dogfood corpus regression suite", () => {
  it("corpus directory is exhaustively covered by EXPECTATIONS", () => {
    const onDisk = readdirSync(CORPUS_DIR)
      .filter((n) => (n.endsWith(".md") || n.endsWith(".json")) && n !== "README.md")
      .sort();
    const declared = Object.keys(EXPECTATIONS).sort();
    expect(declared, "every fixture file must have an EXPECTATIONS entry").toEqual(onDisk);
  });

  for (const [fixture, exp] of Object.entries(EXPECTATIONS)) {
    const fireLabel = exp.must_fire.length === 0 ? "(none)" : exp.must_fire.join(",");
    const silentLabel = exp.must_not_fire?.length ? exp.must_not_fire.join(",") : "—";
    it(`${fixture} → fires:[${fireLabel}] silent:[${silentLabel}]`, () => {
      const content = readFileSync(join(CORPUS_DIR, fixture), "utf-8");
      const files: Record<string, string> = { [exp.target]: content, ...(exp.extras ?? {}) };
      const { root, cleanup } = makeRepo(files);
      try {
        const report = checkRepo(root, loadDefaultSpec());
        const fired = new Set(report.findings.map((f) => f.ruleId));
        for (const ruleId of exp.must_fire) {
          expect(
            fired.has(ruleId),
            `expected ${ruleId} to fire on ${fixture}; fired=[${[...fired].sort().join(",")}]`,
          ).toBe(true);
        }
        for (const ruleId of exp.must_not_fire ?? []) {
          expect(
            fired.has(ruleId),
            `expected ${ruleId} NOT to fire on ${fixture}; findings=${JSON.stringify(
              report.findings.filter((f) => f.ruleId === ruleId),
            )}`,
          ).toBe(false);
        }
        for (const [ruleId, max] of Object.entries(exp.per_rule_max ?? {})) {
          const count = report.findings.filter((f) => f.ruleId === ruleId).length;
          expect(
            count,
            `expected at most ${max} ${ruleId} findings on ${fixture}, got ${count}`,
          ).toBeLessThanOrEqual(max);
        }
        for (const substr of exp.forbidden_message_substrings ?? []) {
          const hit = report.findings.find((f) => f.message.includes(substr));
          expect(
            hit,
            `forbidden substring ${JSON.stringify(substr)} appeared in a finding on ${fixture}: ${JSON.stringify(hit)}`,
          ).toBeUndefined();
        }
        if (exp.must_fire.length === 0 && (exp.must_not_fire?.length ?? 0) > 0) {
          // Negative-control fixtures: assert zero findings end-to-end.
          expect(
            report.findings,
            `negative-control fixture produced findings: ${JSON.stringify(report.findings)}`,
          ).toEqual([]);
        }
      } finally {
        cleanup();
      }
    });
  }
});
