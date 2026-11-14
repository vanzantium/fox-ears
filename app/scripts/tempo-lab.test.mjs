// Deterministic fixtures for the Fox Ears tempo module.
// Runs under Node type-stripping; no bundler or audio needed.
// Mirrors the chroma lab: synthetic onset grids, assert honesty + accuracy.
import test from "node:test";
import assert from "node:assert/strict";
import { runTempoLab } from "../src/lib/hearing/tempo.ts";

test("fox ears tempo lab — all fixtures pass", () => {
  const rows = runTempoLab();
  for (const r of rows) {
    console.log(`  ${r.pass ? "ok" : "FAIL"} ${r.name} (expected ${r.expected}; got ${r.got})`);
  }
  const failed = rows.filter((r) => !r.pass);
  assert.equal(failed.length, 0, `${failed.length} tempo fixture(s) failed`);
});
