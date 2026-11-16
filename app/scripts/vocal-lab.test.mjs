// Deterministic fixtures for the Fox Ears vocal cues (tuning pass 1, 2026-11-14).
// Runs under Node type-stripping; no bundler or audio files needed.
import test from "node:test";
import assert from "node:assert/strict";
import { vocalFeatures, vocalCuesPass, vocalMask, VOCAL_TUNING } from "../src/lib/audio/vocal.ts";

const SR = 44100;
const N = 2048;

function tone({ f0, harmonics, panL = 1, panR = 1, amp = 0.2 }) {
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin((2 * Math.PI * f0 * h * i) / SR) / h;
    L[i] = v * amp * panL;
    R[i] = v * amp * panR;
  }
  return { L, R };
}

test("centred harmonic voice-like tone passes the vocal cues", () => {
  const { L, R } = tone({ f0: 150, harmonics: 16 });
  const f = vocalFeatures(L, R, SR);
  assert.ok(f.peaks >= VOCAL_TUNING.minPeaks, `peaks ${f.peaks}`);
  assert.ok(f.sideDb < VOCAL_TUNING.centreDb, `side ${f.sideDb}`);
  assert.equal(vocalCuesPass(f, f.midDb), true);
});

test("a lone centred sine is not a voice", () => {
  const { L, R } = tone({ f0: 980, harmonics: 1 });
  const f = vocalFeatures(L, R, SR);
  assert.equal(vocalCuesPass(f, f.midDb), false, `peaks ${f.peaks}`);
});

test("a hard-panned harmonic tone is not a centre vocal", () => {
  const { L, R } = tone({ f0: 150, harmonics: 16, panL: 1, panR: 0.1 });
  const f = vocalFeatures(L, R, SR);
  assert.equal(vocalCuesPass(f, f.midDb), false, `side ${f.sideDb}`);
});

test("vocal mask drops runs shorter than the minimum", () => {
  const on = { sideDb: -15, midDb: 40, peaks: 8 };
  const off = { sideDb: 0, midDb: 10, peaks: 1 };
  const feats = [...Array(20).fill(off), ...Array(3).fill(on), ...Array(20).fill(off), ...Array(12).fill(on), ...Array(20).fill(off)];
  const m = vocalMask(feats);
  assert.equal(m.slice(20, 23).some(Boolean), false);
  assert.ok(m.slice(45, 53).every(Boolean));
});
