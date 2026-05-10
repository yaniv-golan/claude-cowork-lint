/**
 * Schema-lock test — ported from `_legacy/python/tests/unit/test_schema_lock.py`.
 *
 * `spec_version: "0"` is locked by promise at v1.0; bumping it is a major-version
 * event for the cwlint project itself, not just a contract update. This test
 * exists so the lock can't slip — if a `spec_version: "1"` migration is genuinely
 * needed, delete this test and bump cwlint's major version in the same PR.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");

describe("schema lock", () => {
  it("every cowork-v*.json has spec_version '0'", () => {
    const dir = join(REPO_ROOT, "contracts");
    const contracts = readdirSync(dir).filter(
      (f) => f.startsWith("cowork-v") && f.endsWith(".json"),
    );
    expect(contracts.length).toBeGreaterThan(0);
    for (const f of contracts) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      expect(data.spec_version, `${f} has spec_version=${JSON.stringify(data.spec_version)}`).toBe(
        "0",
      );
    }
  });

  it("schemas/v0.json $id matches the canonical repo URL", () => {
    const schema = JSON.parse(readFileSync(join(REPO_ROOT, "schemas", "v0.json"), "utf-8"));
    expect(schema.$id).toBe("https://github.com/yaniv-golan/claude-cowork-lint/schemas/v0.json");
  });
});
