import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertVersionRecord, isRelationToWork, workId, versionId } from "../src/lib/hearing/version.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(resolve(root, "fixtures/works/p1-versions.json"), "utf8"));

test("p1 version schema rejects a missing work_id or a short digest", () => {
  assert.throws(() => assertVersionRecord({}), /work_id/);
  assert.throws(
    () =>
      assertVersionRecord({
        work_id: "work:x",
        version_id: "x/y",
        audio_sha256: "abcd",
        lyrics_source_id: null,
        relation_to_work: "original",
        measured: { tempo_hypotheses: [], preferred_for: { transcription_grid: null, felt_groove: null, unresolved: true }, key_hypotheses: [], tool: { name: "t", version: "0" }, receipt: {} },
        reported: null,
        listener_reading: null,
      }),
    /audio_sha256/,
  );
  assert.equal(isRelationToWork("remix"), true);
  assert.equal(isRelationToWork("bootleg"), false);
  assert.equal(workId("fox-at-the-gate"), "work:fox-at-the-gate");
  assert.equal(versionId("fox-at-the-gate", "master"), "fox-at-the-gate/master");
});

test("p1 fixtures populate Fox at the Gate, Dreaming Like a Rocket Ship, and Tired of Feeding the Lie", () => {
  const versions = pack.versions.map((v) => assertVersionRecord(v));
  const ids = new Set(versions.map((v) => v.version_id));
  for (const need of [
    "fox-at-the-gate/master",
    "fox-at-the-gate/stretch-108",
    "dreaming-like-a-rocket-ship/solo-2026-11-16",
    "dreaming-like-a-rocket-ship/suno-remix-2026-11-16",
    "tired-of-feeding-the-lie/solo-2026-11-16",
    "tired-of-feeding-the-lie/suno-remix-2026-11-16",
  ]) {
    assert.ok(ids.has(need), `missing fixture ${need}`);
  }
  const a = versions.find((v) => v.version_id.endsWith("solo-2026-11-16") && v.work_id.includes("rocket"));
  const ar = versions.find((v) => v.version_id.includes("rocket-ship/suno"));
  const b = versions.find((v) => v.version_id.includes("feeding-the-lie/solo"));
  const br = versions.find((v) => v.version_id.includes("feeding-the-lie/suno"));
  const master = versions.find((v) => v.version_id === "fox-at-the-gate/master");
  const stretch = versions.find((v) => v.version_id === "fox-at-the-gate/stretch-108");
  assert.equal(a.relation_to_work, "original");
  assert.equal(ar.relation_to_work, "remix");
  assert.equal(b.relation_to_work, "original");
  assert.equal(br.relation_to_work, "remix");
  assert.equal(master.relation_to_work, "original");
  assert.equal(stretch.relation_to_work, "stretch");
  assert.equal(a.lyrics_source_id, ar.lyrics_source_id);
  assert.equal(b.lyrics_source_id, br.lyrics_source_id);
  assert.notEqual(a.audio_sha256, ar.audio_sha256);
  assert.equal(a.reported.key.mode, "major");
  assert.equal(b.reported.key.mode, "minor");
  // Listener reading is present and not folded into measured.
  assert.ok(a.listener_reading?.text);
  assert.equal("listener_reading" in a.measured, false);
  assert.equal(a.measured.preferred_for.transcription_grid, 80);
  assert.equal(a.measured.preferred_for.felt_groove, 84);
});

test("p1 measured facts stay distinct from reported answers and listener readings", () => {
  const a = assertVersionRecord(pack.versions.find((v) => v.version_id === "dreaming-like-a-rocket-ship/solo-2026-11-16"));
  const click = a.measured.tempo_hypotheses.find((h) => h.role === "reference_click");
  const groove = a.measured.tempo_hypotheses.find((h) => h.role === "performed_groove");
  assert.equal(click.value_bpm, 80);
  assert.ok(groove.value_bpm >= 83 && groove.value_bpm <= 85);
  assert.equal(a.reported.tempo_bpm, 80);
  assert.ok(!JSON.stringify(a.measured).includes("Veyra"));
  assert.match(a.listener_reading.text, /click/i);
});
