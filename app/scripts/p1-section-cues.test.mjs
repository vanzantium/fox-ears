import test from "node:test";
import assert from "node:assert/strict";
import { attachSectionCues, lyricRepetitionCues } from "../src/lib/hearing/sectionCues.ts";

test("p1 vocal entry and lyric repetition are explicit cues, not silent overrides", () => {
  const sections = [
    { t_start_ms: 0, t_end_ms: 15800, label: "A", energy_mean: 0.1, hypothesis: "x", role: "intro" },
    { t_start_ms: 15800, t_end_ms: 40000, label: "B", energy_mean: 0.2, hypothesis: "x", role: "verse" },
  ];
  const frames = [];
  // silence, then a sustained vocal gate from 27.6 s (Song B-like)
  for (let t = 0; t <= 40000; t += 80) {
    const on = t >= 27600;
    frames.push({
      t_ms: t,
      left_ear: { level: 0.1, bands: { 500: 0, 1000: 0, 2000: 0, 4000: 0 }, onset: 0 },
      right_ear: { level: 0.1, bands: { 500: 0, 1000: 0, 2000: 0, 4000: 0 }, onset: 0 },
      binaural_measurement: { level_delta_L_minus_R: 0, itd_ms_R_minus_L: null },
      centroid_hz: 0, flux: 0, pitch_hz: null, midi: null, note: null,
      pitch_confidence: 0, harmonicity: 0, chroma: [], bass_chroma: [],
      vocal_likelihood: on ? 0.9 : 0, vocal_gate: on,
    });
  }
  const mask = frames.map((f) => Boolean(f.vocal_gate));
  const lyrics = [
    { t_ms: 75500, text: "Tired of feeding the lie", source: "pasted" },
    { t_ms: 137000, text: "Tired of feeding the lie", source: "pasted" },
    { t_ms: 221000, text: "Tired of feeding the lie", source: "pasted" },
  ];
  const rec = attachSectionCues(sections, frames, { vocalMask: mask, lyrics });
  // Cuts are unchanged — vocal entry is a receipt, not a hidden split.
  assert.equal(rec.sections[0].t_end_ms, 15800);
  const vocal = rec.cues.find((c) => c.kind === "vocal_entry");
  assert.ok(vocal);
  assert.ok(Math.abs(vocal.t_ms - 27600) < 200);
  assert.equal(vocal.used, false);
  assert.ok(rec.disagreement.some((d) => /vocal entry/.test(d.statement)));
  const reps = lyricRepetitionCues(lyrics);
  assert.equal(reps.length, 2);
  assert.ok(rec.cues.filter((c) => c.kind === "lyric_repetition").length >= 2);
  assert.ok(rec.cues.some((c) => c.kind === "novelty_cut" && c.t_ms === 15800));
});
