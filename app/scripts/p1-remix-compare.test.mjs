import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root2 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root2, "src") + "/" } });
const { assertVersionRecord } = await jiti.import(resolve(root2, "src/lib/hearing/version.ts"));
const { remixCompare } = await jiti.import(resolve(root2, "src/lib/hearing/remixCompare.ts"));

const pack = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/works/p1-versions.json"), "utf8"),
);

test("p1 remix compare is a first-class object generated from version records", () => {
  const versions = pack.versions.map((v) => assertVersionRecord(v));
  const orig = versions.find((v) => v.version_id === "dreaming-like-a-rocket-ship/solo-2026-11-16");
  const remix = versions.find((v) => v.version_id === "dreaming-like-a-rocket-ship/suno-remix-2026-11-16");
  const cmp = remixCompare(orig, remix);
  assert.equal(cmp.work_id, orig.work_id);
  assert.equal(cmp.relation, "remix");
  assert.ok(cmp.measured_changes.tempo.some((t) => /click/i.test(t)));
  assert.ok(cmp.measured_changes.key.some((k) => /E major/.test(k)));
  assert.equal(cmp.listener_readings.original.text, orig.listener_reading.text);
  assert.notEqual(cmp.listener_readings.original, cmp.measured_changes);
});

test("p1 remix compare refuses to join two different works", () => {
  const versions = pack.versions.map((v) => assertVersionRecord(v));
  const a = versions.find((v) => v.work_id.includes("rocket"));
  const b = versions.find((v) => v.work_id.includes("feeding"));
  assert.throws(() => remixCompare(a, b), /same work_id/);
});
