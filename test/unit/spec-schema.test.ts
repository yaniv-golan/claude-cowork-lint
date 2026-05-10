/**
 * The v0 JSON Schema must validate every vendored contract — ported from
 * `_legacy/python/tests/unit/test_spec_schema.py`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
// The vendored schema declares draft 2020-12; ajv ships a separate entry-point
// for that meta-schema (the default `Ajv` is draft-07). The CJS interop dance
// below is the same workaround used in the plan's E1 sample for ajv-formats:
// the runtime value lives at `.default` under NodeNext but TypeScript's static
// type sees the namespace object — so we reach through both layers.
import * as AjvNS from "ajv/dist/2020.js";
import * as AddFormatsNS from "ajv-formats";
import { describe, expect, it } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop dance documented above.
const Ajv: any = (AjvNS as any).default ?? AjvNS;
// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop dance documented above.
const addFormats: any = (AddFormatsNS as any).default ?? AddFormatsNS;

const REPO_ROOT = join(__dirname, "..", "..");

describe("v0.json schema", () => {
  const schema = JSON.parse(readFileSync(join(REPO_ROOT, "schemas", "v0.json"), "utf-8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const contracts = readdirSync(join(REPO_ROOT, "contracts")).filter(
    (f) => f.startsWith("cowork-v") && f.endsWith(".json"),
  );

  it("finds at least one contract", () => {
    expect(contracts.length).toBeGreaterThan(0);
  });

  for (const f of contracts) {
    it(`validates ${f}`, () => {
      const data = JSON.parse(readFileSync(join(REPO_ROOT, "contracts", f), "utf-8"));
      const ok = validate(data);
      if (!ok) {
        // surfacing ajv errors with the assertion makes failure diagnosis trivial.
        throw new Error(`${f} failed schema: ${JSON.stringify(validate.errors, null, 2)}`);
      }
      expect(ok).toBe(true);
    });
  }
});
