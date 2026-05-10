/**
 * Snapshot test for the human-readable text formatter.
 *
 * Locks the on-disk output shape so accidental drift in `src/output/text.ts`
 * (icon glyphs, padding, summary line) is caught at review time. The temp-dir
 * prefix is rewritten to `<repo>` so the snapshot is stable across machines
 * and CI runners.
 */

import { describe, expect, it } from "vitest";

import { checkRepo } from "../../src/engine.js";
import { formatText } from "../../src/output/text.js";
import { loadDefaultSpec } from "../../src/spec.js";
import { makeRepo } from "../helpers.js";

describe("text output snapshot", () => {
  it("known-bad fixture renders consistently", () => {
    const { root, cleanup } = makeRepo({
      "SKILL.md": "---\nuser-invocable: true\ndisable-model-invocation: true\n---\nbody",
    });
    try {
      const report = checkRepo(root, loadDefaultSpec());
      // Replace the temp-dir prefix so the snapshot is path-stable.
      const stable = formatText(report).replaceAll(root, "<repo>");
      expect(stable).toMatchSnapshot();
    } finally {
      cleanup();
    }
  });
});
