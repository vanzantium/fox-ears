import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root, "src") + "/" } });
const { buildAffect } = await jiti.import(resolve(root, "src/lib/hearing/affect.ts"));
const { modeChangeReceipt, modeValenceContribution } = await jiti.import(resolve(root, "src/lib/hearing/modeReceipt.ts"));
const { emptyModel, refineFromChart } = await jiti.import(resolve(root, "src/lib/hearing/songModel.ts"));
const { emptyChart } = await jiti.import(resolve(root, "src/lib/hearing/score.ts"));

function frames(mode) {
  return Array.from({ length: 40 }, (_, i) => ({
    t_ms: i * 80,
    energy: 0.2,
    onset: 0.05,
    centroid_hz: 800,
    high_band: 0.1,
    pitch_hz: 220,
    pitch_confidence: 0.7,
    level: 0.2,
    tension: 2,
    tension_delta: 0,
    melody_midi: 57,
    bass_midi: 45,
    mode,
  }));
}

test("p1 mode does not own valence: major and minor frames share valence when other cues match", () => {
  const maj = buildAffect(frames("major"));
  const min = buildAffect(frames("minor"));
  assert.equal(maj.mean_valence, min.mean_valence);
  assert.equal(modeValenceContribution("minor"), 0);
  assert.equal(modeValenceContribution("major"), 0);
});

test("p1 a mode flip emits a REVIEW / changed-input receipt and does not promote a feeling", () => {
  const receipt = modeChangeReceipt("major", "minor");
  assert.ok(receipt);
  assert.equal(receipt.kind, "REVIEW");
  assert.equal(receipt.reason, "changed-input");
  assert.equal(receipt.cue, "mode");
  assert.equal(receipt.from, "major");
  assert.equal(receipt.to, "minor");
  assert.equal(modeChangeReceipt("minor", "minor"), null);

  const chartMaj = { ...emptyChart(), key: { tonic: "E", mode: "major", confidence: 0.9 } };
  const chartMin = { ...emptyChart(), key: { tonic: "E", mode: "minor", confidence: 0.9 } };
  const map = {
    title: "t",
    duration_ms: 1000,
    frames: [],
    captured_at: new Date().toISOString(),
    source: { kind: "file", name: "t.wav" },
  };
  const first = refineFromChart(emptyModel("id", "t", 1000), chartMaj, map, "orientation", []);
  // First listen must not map major → release / minor → inward.
  assert.notEqual(first.appraisal.valence, "release");
  assert.notEqual(first.appraisal.valence, "inward");
  const second = refineFromChart(first.model, chartMin, map, "orientation", []);
  const found = (second.model.input_change_receipts || []).find((r) => r.kind === "REVIEW" && r.cue === "mode");
  assert.ok(found, "mode flip should be a REVIEW receipt on the model");
  assert.equal(found.reason, "changed-input");
  assert.notEqual(second.appraisal.valence, "inward");
});
