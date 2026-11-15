// Display-independence lab for the Fox Ears tempo path (P0, 2026-11-15).
// Runs under Node type-stripping; no bundler, browser or audio needed.
//
// One synthetic "song" (a continuous onset-energy envelope) is observed the way
// the app observes it: an analyser read on every requestAnimationFrame tick,
// stamped with the audio clock. We vary the display rate (60 / 90 / 120 Hz), add
// frame jitter, and drop ticks for 3 s like a backgrounded tab. Each tick's flux
// is the positive energy change since the previous tick, as the analyser gives.
//
// Declared tolerance: displayed BPM within ±1% of the true tempo at every rate,
// and the three rates within 0.5 BPM of each other.
import test from "node:test";
import assert from "node:assert/strict";
import { tempoFromTicks, resampleTicks, TIMING } from "../src/lib/hearing/tempo.ts";

export const TOL_REL = 0.01;
export const TOL_SPREAD_BPM = 0.5;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Onset-energy envelope: quarters (accented 1 and 3), weaker off-beat 8ths, a little noise. */
function makeSong(bpm, seconds, seed = 7) {
  const beat = 60000 / bpm;
  const events = [];
  for (let i = 0; i * beat < seconds * 1000; i++) {
    events.push({ t: i * beat, a: i % 2 === 0 ? 1 : 0.75 });
    events.push({ t: i * beat + beat / 2, a: 0.3 });
  }
  const r = rng(seed);
  const noise = Array.from({ length: Math.ceil(seconds * 100) + 2 }, () => r() * 0.04);
  const attack = 12; // ms
  const decay = 70; // ms
  return (t) => {
    let e = noise[Math.floor(t / 10)] ?? 0;
    for (const ev of events) {
      const d = t - ev.t;
      if (d < 0 || d > decay * 8) continue;
      e += ev.a * (d < attack ? d / attack : Math.exp(-(d - attack) / decay));
    }
    return e;
  };
}

/** Observe the song like the app: ticks at hz with jitter, a background gap, flux = positive change. */
function observe(energy, seconds, hz, { jitterMs = 0, gap = null, seed = 1 } = {}) {
  const r = rng(seed * 31 + hz);
  const tickMs = [];
  const flux = [];
  let prevE = energy(0);
  for (let k = 1; ; k++) {
    let t = (k * 1000) / hz + (r() * 2 - 1) * jitterMs;
    if (t > seconds * 1000) break;
    if (gap && t > gap[0] && t < gap[1]) continue; // tab in background: no rAF
    t = Math.round(t * 10) / 10; // sampler stores 0.1 ms
    if (tickMs.length && t <= tickMs[tickMs.length - 1]) continue;
    const e = energy(t);
    tickMs.push(t);
    flux.push(Math.max(0, e - prevE));
    prevE = e;
  }
  return { tickMs, flux };
}

const SECONDS = 40;
const CASES = [96, 108, 120];
const RATES = [60, 90, 120];

for (const bpm of CASES) {
  test(`tempo ${bpm} BPM is display-independent (60/90/120 Hz, jitter, background gap)`, () => {
    const song = makeSong(bpm, SECONDS, bpm);
    const got = [];
    for (const hz of RATES) {
      const obs = observe(song, SECONDS, hz, { jitterMs: 3, gap: [15000, 18000], seed: bpm });
      const { tempo, grid } = tempoFromTicks(obs.tickMs, obs.flux);
      const shown = tempo?.bpm ?? null;
      console.log(
        `  ${bpm} BPM @ ${hz} Hz: ${obs.tickMs.length} ticks, median ${grid.medianTickMs.toFixed(1)} ms, ` +
          `gaps ${grid.gaps.map(([a, b]) => `${(a / 1000).toFixed(2)}-${(b / 1000).toFixed(2)}s`).join(",") || "none"} -> ${shown} BPM`,
      );
      assert.ok(shown !== null, `${hz} Hz: no tempo`);
      assert.ok(Math.abs(shown - bpm) / bpm <= TOL_REL, `${hz} Hz: ${shown} vs ${bpm} (tol ±${TOL_REL * 100}%)`);
      assert.equal(grid.gaps.length, 1, `${hz} Hz: background gap not detected`);
      got.push(shown);
    }
    const spread = Math.max(...got) - Math.min(...got);
    assert.ok(spread <= TOL_SPREAD_BPM, `rates disagree by ${spread} BPM: ${got.join(" / ")}`);
  });
}

test("resampleTicks: fixed 10 ms grid, no data invented across a gap, post-gap tick dropped", () => {
  const tickMs = [0, 16.7, 33.3, 50, 66.7, 1066.7, 1083.3, 1100];
  const flux = [0, 1, 1, 1, 1, 50, 1, 1];
  const g = resampleTicks(tickMs, flux);
  assert.equal(TIMING.gridMs, 10);
  for (let i = 1; i < g.t_ms.length; i++) {
    const d = g.t_ms[i] - g.t_ms[i - 1];
    assert.ok(d === 10 || d > TIMING.maxGapMs, `grid step ${d}`);
  }
  assert.deepEqual(g.gaps, [[66.7, 1066.7]]);
  assert.ok(!g.t_ms.some((t) => t > 70 && t < 1070), "no grid points inside the gap");
  assert.ok(Math.max(...g.flux) < 5, "the tick that spans the gap must not become an onset");
});

// Found in the first headless Chrome pass (2026-11-15): AudioContext.currentTime
// advances once per audio callback (~10.7 ms), so 60/120 Hz reads share
// timestamps. The sampler must merge, not drop, the flux of a read whose clock
// did not move, and tempo must survive the quantised clock.
test("quantised audio clock (10.7 ms callbacks): sampler conserves flux, tempo holds at 60 and 120 Hz", async () => {
  const { HearingSampler } = await import("../src/lib/hearing/sampler.ts");
  const bpm = 96;
  const song = makeSong(bpm, SECONDS, 3);
  for (const hz of [60, 120]) {
    const obs = observe(song, SECONDS, hz, { jitterMs: 2, seed: 5 });
    const quantum = 512 / 48; // ms
    const s = new HearingSampler();
    s.start();
    for (let i = 0; i < obs.tickMs.length; i++) {
      s.tick(obs.flux[i], Math.floor(obs.tickMs[i] / quantum) * quantum);
    }
    // tick() keeps ticks in its buffer until push(); read them via a frame-less flush
    const ticks = { t: s["tickMs"], f: s["tickFlux"] };
    const total = obs.flux.reduce((a, b) => a + b, 0);
    const kept = ticks.f.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(kept - total) / total < 0.01, `${hz} Hz: flux kept ${kept.toFixed(2)} of ${total.toFixed(2)}`);
    for (let i = 1; i < ticks.t.length; i++) assert.ok(ticks.t[i] > ticks.t[i - 1], "timestamps strictly increase");
    const { tempo } = tempoFromTicks(ticks.t, ticks.f);
    console.log(`  quantised clock @ ${hz} Hz: ${obs.tickMs.length} reads -> ${ticks.t.length} ticks -> ${tempo?.bpm} BPM`);
    assert.ok(tempo && Math.abs(tempo.bpm - bpm) / bpm <= TOL_REL, `${hz} Hz: ${tempo?.bpm}`);
  }
});
