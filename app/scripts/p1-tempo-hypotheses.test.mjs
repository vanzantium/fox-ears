import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTempoHypotheses,
  scoreTempoRole,
  attachHypothesesToEstimate,
} from "../src/lib/hearing/tempoHypotheses.ts";

function grid(periodMs, durationMs, jitterMs = 0, seed = 1) {
  const out = [];
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let t = 2; t <= durationMs; t += periodMs) {
    const j = jitterMs ? (rand() * 2 - 1) * jitterMs : 0;
    out.push(t + j);
  }
  return out;
}

test("p1 multi-pulse: Song A-like 80 click plus ~83.3 groove reports both roles", () => {
  // Sparse click every 750 ms (80 BPM), dense strum every 720 ms (83.333 BPM).
  const click = grid(750, 30_000, 1.2, 3);
  const groove = grid(720, 30_000, 6, 9);
  const set = detectTempoHypotheses(click, {
    denseOnsetMs: groove,
    grooveBpm: 84,
    grooveConfidence: 0.32,
    grooveSource: "fox_ears_subgrid",
  });
  const clickScore = scoreTempoRole(set, "reference_click", 80);
  const grooveScore = scoreTempoRole(set, "performed_groove", 83.4);
  assert.equal(clickScore.hit, true, clickScore.note);
  assert.equal(grooveScore.hit, true, grooveScore.note);
  assert.ok(set.preferred_for.transcription_grid != null);
  assert.ok(Math.abs(set.preferred_for.transcription_grid - 80) / 80 <= 0.04);
  assert.ok(Math.abs(set.preferred_for.felt_groove - 84) / 84 <= 0.04);
  // A 84 groove is not a miss of the click task.
  const punished = scoreTempoRole(
    { tempo_hypotheses: set.tempo_hypotheses.filter((h) => h.role === "performed_groove"), preferred_for: set.preferred_for },
    "reference_click",
    80,
  );
  assert.equal(punished.hit, false);
  assert.match(punished.note, /no reference_click hypothesis/);
});

test("p1 per-role scoring does not treat a double as a click miss", () => {
  const set = attachHypothesesToEstimate({ bpm: 79.9, confidence: 0.4 }, grid(750, 20_000, 0.8, 2), grid(750, 20_000, 8, 4));
  const click = scoreTempoRole(set, "reference_click", 80);
  const groove = scoreTempoRole(set, "performed_groove", 80);
  assert.equal(groove.hit, true, groove.note);
  if (click.got != null) assert.equal(click.hit, true, click.note);
  const double = set.tempo_hypotheses.find((h) => h.role === "subdivision_or_double");
  assert.ok(double, "double/subdivision hypothesis present");
  assert.ok(double.value_bpm > 140);
});

test("p1 a 168 lock with a strong 84 rival reports 84 as the performed groove", () => {
  const click = grid(750, 30_000, 1.0, 5);
  const strum = grid(720, 30_000, 8, 11);
  const set = attachHypothesesToEstimate(
    {
      bpm: 168.1,
      confidence: 0.32,
      candidates: [
        { bpm: 168.1, votes: 25, role: "beat" },
        { bpm: 84, votes: 21, role: "pulse" },
      ],
    },
    click,
    strum,
  );
  const groove = scoreTempoRole(set, "performed_groove", 84);
  const subdiv = scoreTempoRole(set, "subdivision_or_double", 168);
  const clickScore = scoreTempoRole(set, "reference_click", 80);
  assert.equal(groove.hit, true, groove.note);
  assert.equal(subdiv.hit, true, subdiv.note);
  assert.equal(clickScore.hit, true, clickScore.note);
  assert.equal(set.preferred_for.unresolved, true);
});
