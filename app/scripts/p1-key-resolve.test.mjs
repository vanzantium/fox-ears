import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root0 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti0 = createJiti(import.meta.url, { alias: { "@/": resolve(root0, "src") + "/" } });
const { estimateKeyDetailed, uniqueDegreeVote } = await jiti0.import(resolve(root0, "src/lib/hearing/keyResolve.ts"));

const G = 7, D = 2, C = 0, CS = 1, A = 9, FS = 6;

function triad(root, major = true, bass = root) {
  const ch = new Array(12).fill(0.03);
  ch[root] = 0.42;
  ch[(root + (major ? 4 : 3)) % 12] = 0.26;
  ch[(root + 7) % 12] = 0.22;
  const b = new Array(12).fill(0.04);
  b[bass] = 0.7;
  return { ch, b };
}

function framesFromRegions(regions, hop = 80) {
  const end = Math.max(...regions.map((r) => r.until));
  const out = [];
  for (let t = 0; t <= end; t += hop) {
    const r = regions.find((x) => t >= x.from && t < x.until) ?? regions[regions.length - 1];
    const { ch, b } = triad(r.root, r.major !== false, r.bass ?? r.root);
    // A G-major body may still have a prominent D (dominant) in the midrange.
    if (r.dominantPedal) {
      ch[r.dominantPedal] = Math.max(ch[r.dominantPedal], 0.38);
      b[r.dominantPedal] = Math.max(b[r.dominantPedal], 0.55);
    }
    out.push({
      t_ms: t,
      chroma: ch,
      bass_chroma: b,
      pitch_hz: null,
      midi: null,
      pitch_confidence: 0,
    });
  }
  return out;
}

test("p1 unique degree vote: C vs C# favours G over D major", () => {
  const a = new Array(12).fill(0.05);
  a[C] = 0.12;
  a[CS] = 0.03;
  const v = uniqueDegreeVote(a, G, D, "major");
  assert.equal(v.vote, G);
});

test("p1 a D-major intro plus G cadence is G, not a locked D intro key", () => {
  // Fox-at-the-Gate-like: D vamp intro, D-heavy midrange, G "home" ending.
  const frames = framesFromRegions([
    { from: 0, until: 2000, root: D, bass: D },
    { from: 2000, until: 10000, root: G, bass: D, dominantPedal: D },
    { from: 10000, until: 14000, root: G, bass: G },
  ]);
  const sections = [
    { t_start_ms: 0, t_end_ms: 2000, role: "intro" },
    { t_start_ms: 2000, t_end_ms: 10000, role: "verse" },
    { t_start_ms: 10000, t_end_ms: 14000, role: "outro" },
  ];
  const est = estimateKeyDetailed(frames, sections);
  assert.equal(est.key?.tonic, "G", `expected G, got ${est.key?.tonic} ${est.key?.mode} (${est.note})`);
  assert.equal(est.key?.mode, "major");
  const intro = est.hypotheses.find((h) => h.role === "intro_key");
  const cadence = est.hypotheses.find((h) => h.role === "cadence_key");
  const rival = est.hypotheses.find((h) => h.role === "dominant_rival");
  const global = est.hypotheses.find((h) => h.role === "global_key");
  assert.equal(intro?.tonic, "D", `intro_key should be D, got ${intro?.tonic}`);
  assert.equal(cadence?.tonic, "G", `cadence_key should be G, got ${cadence?.tonic}`);
  assert.equal(global?.tonic, "G");
  assert.ok(rival, "dominant_rival hypothesis present");
  assert.notEqual(est.note.includes("kept the profile winner") && est.key?.tonic === "D", true);
});

test("p1 tonic-vs-dominant is UNRESOLVED when cadence and degree split", () => {
  // Close G/D profile (alternating triads), ending on D, unique 4th (C) votes G.
  const frames = framesFromRegions([
    { from: 0, until: 2000, root: D, bass: D },
    { from: 2000, until: 4000, root: G, bass: G },
    { from: 4000, until: 6000, root: D, bass: D },
    { from: 6000, until: 8000, root: G, bass: G },
    { from: 8000, until: 12000, root: D, bass: D },
  ]);
  for (const f of frames) {
    f.chroma[C] = Math.max(f.chroma[C], 0.16);
    f.chroma[CS] = 0.01;
  }
  const sections = [
    { t_start_ms: 0, t_end_ms: 2000, role: "intro" },
    { t_start_ms: 2000, t_end_ms: 8000, role: "verse" },
    { t_start_ms: 8000, t_end_ms: 12000, role: "outro" },
  ];
  const est = estimateKeyDetailed(frames, sections);
  assert.match(est.note, /tonic-vs-dominant/, `expected a fifth ambiguity, got: ${est.note}`);
  assert.equal(est.status, "UNRESOLVED", `split evidence should be UNRESOLVED (${est.note})`);
  assert.ok(est.hypotheses.some((h) => h.role === "dominant_rival"));
});

const MASTER = "/workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav";
const STRETCH = "/workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav";

test("p1 stretch and master both read G major when local wavs exist", async (t) => {
  if (process.env.FOX_EARS_P1_RATE_FILES !== "1" || !existsSync(MASTER) || !existsSync(STRETCH)) {
    t.skip("set FOX_EARS_P1_RATE_FILES=1 with local master/stretch wavs");
    return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root, "src") + "/" } });
  const { hearPcm } = await jiti.import(resolve(root, "../harness/offline-engine.ts"));
  const { assembleMap } = await jiti.import(resolve(root, "src/lib/hearing/bind.ts"));
  const { SAMPLE_INTERVAL_MS } = await jiti.import(resolve(root, "src/lib/hearing/sampler.ts"));
  const { readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");

  async function hear(path) {
    const tmp = `/tmp/fox-ears-p1/keyreg-${path.split("/").pop()}.f32`;
    execFileSync("ffmpeg", ["-y", "-i", path, "-ac", "2", "-ar", "44100", "-f", "f32le", tmp], { stdio: "ignore" });
    const buf = readFileSync(tmp);
    const n = buf.length / 8;
    const L = new Float32Array(n), R = new Float32Array(n);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < n; i++) {
      L[i] = dv.getFloat32(i * 8, true);
      R[i] = dv.getFloat32(i * 8 + 4, true);
    }
    const frames = hearPcm(L, R, 44100, { sensitivity: 0.58 });
    return assembleMap({
      title: path.split("/").pop(),
      sourceKind: "file",
      sourceName: path.split("/").pop(),
      frames,
      intervalMs: SAMPLE_INTERVAL_MS,
    });
  }
  const master = await hear(MASTER);
  const stretch = await hear(STRETCH);
  assert.equal(master.chart.key?.tonic, "G", `master ${master.chart.key?.tonic} ${master.chart.key?.mode} (${master.chart.key_note})`);
  assert.equal(master.chart.key?.mode, "major");
  assert.equal(stretch.chart.key?.tonic, "G", `stretch ${stretch.chart.key?.tonic} ${stretch.chart.key?.mode} (${stretch.chart.key_note})`);
  assert.equal(stretch.chart.key?.mode, "major");
});
