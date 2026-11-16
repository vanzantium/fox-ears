/**
 * P1: key and sections must be materially equivalent at 60 / 120 / 144 Hz.
 * Synthetic fixture always runs in CI. Master and stretch runs run when the
 * local wavs are present and record their verdict; they are skipped in CI
 * without those files (audio is not in the repo).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root, "src") + "/" } });

function synthChordSong(sr = 44100, seconds = 16) {
  // Moving E-major progression so chromaReliability does not suppress the key
  // (a stuck tonic bin is treated as unreliable). Intro is quieter for 2 s.
  const n = Math.round(sr * seconds);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const chords = [
    [164.81, 207.65, 329.63], // E
    [220.0, 277.18, 329.63],  // A
    [246.94, 311.13, 369.99], // B
    [164.81, 207.65, 246.94], // E/B
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const intro = t < 2;
    const chord = chords[Math.min(chords.length - 1, Math.floor(((t - 2) / Math.max(0.001, seconds - 2)) * chords.length))] ?? chords[0];
    let v = 0;
    for (const f of chord) v += Math.sin(2 * Math.PI * f * t) / chord.length;
    const env = intro ? 0.18 : 0.5 + 0.1 * Math.sin(2 * Math.PI * t / 4);
    const vox = intro ? 0 : 0.15 * Math.sin(2 * Math.PI * 659.25 * t);
    const s = (v * env + vox) * 0.5;
    L[i] = s;
    R[i] = s * 0.97;
  }
  return { L, R, sr };
}

async function hearAt(tickHz, L, R, sr) {
  const { hearPcm } = await jiti.import(resolve(root, "../harness/offline-engine.ts"));
  const { assembleMap } = await jiti.import(resolve(root, "src/lib/hearing/bind.ts"));
  const { SAMPLE_INTERVAL_MS } = await jiti.import(resolve(root, "src/lib/hearing/sampler.ts"));
  const frames = hearPcm(L, R, sr, { tickHz, sensitivity: 0.58 });
  const map = assembleMap({
    title: `rate-${tickHz}`,
    sourceKind: "file",
    sourceName: `synth-${tickHz}`,
    frames,
    intervalMs: SAMPLE_INTERVAL_MS,
  });
  return {
    tickHz,
    key: map.chart.key,
    chroma_reliable: map.chart.chroma_reliable,
    key_note: map.chart.key_note ?? map.chart.chroma_note,
    sections: map.chart.sections.map((s) => ({
      t0: s.t_start_ms,
      t1: s.t_end_ms,
      role: s.role,
    })),
    nSections: map.chart.sections.length,
  };
}

function materiallyEquivalent(a, b) {
  const notes = [];
  const keyA = a.key ? `${a.key.tonic} ${a.key.mode}` : `none(${a.chroma_reliable ? "reliable" : "unreliable"})`;
  const keyB = b.key ? `${b.key.tonic} ${b.key.mode}` : `none(${b.chroma_reliable ? "reliable" : "unreliable"})`;
  const sameKey = keyA === keyB;
  if (!sameKey) notes.push(`key ${a.tickHz}Hz ${keyA} vs ${b.tickHz}Hz ${keyB}`);
  if (Math.abs(a.nSections - b.nSections) > 1) notes.push(`section count ${a.nSections} vs ${b.nSections}`);
  const n = Math.min(a.sections.length, b.sections.length);
  for (let i = 0; i < n; i++) {
    if (Math.abs(a.sections[i].t0 - b.sections[i].t0) > 800) {
      notes.push(`cut ${i} ${a.sections[i].t0} vs ${b.sections[i].t0}`);
    }
  }
  return { ok: notes.length === 0 && sameKey, notes };
}

test("p1 key and sections are materially equivalent at 60/120/144 Hz on a synthetic song", async () => {
  const { L, R, sr } = synthChordSong();
  const r60 = await hearAt(60, L, R, sr);
  const r120 = await hearAt(120, L, R, sr);
  const r144 = await hearAt(144, L, R, sr);
  const a = materiallyEquivalent(r60, r120);
  const b = materiallyEquivalent(r60, r144);
  assert.equal(a.ok, true, `60 vs 120: ${a.notes.join("; ") || "ok"} | 60=${JSON.stringify({ key: r60.key, rel: r60.chroma_reliable, n: r60.nSections })}`);
  assert.equal(b.ok, true, `60 vs 144: ${b.notes.join("; ") || "ok"} | 144=${JSON.stringify({ key: r144.key, rel: r144.chroma_reliable, n: r144.nSections })}`);
});

const MASTER = "/workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav";
const STRETCH = "/workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav";

async function hearWav(path, tickHz) {
  const { readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const tmp = `/tmp/fox-ears-p1-${tickHz}-${path.split("/").pop()}.f32`;
  // stereo f32le 44100
  execFileSync("ffmpeg", ["-y", "-i", path, "-ac", "2", "-ar", "44100", "-f", "f32le", tmp], { stdio: "ignore" });
  const buf = readFileSync(tmp);
  const n = buf.length / 8;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < n; i++) {
    L[i] = dv.getFloat32(i * 8, true);
    R[i] = dv.getFloat32(i * 8 + 4, true);
  }
  return hearAt(tickHz, L, R, 44100);
}

test("p1 master and stretch key/sections match across 60/120/144 Hz when local wavs exist", async (t) => {
  // Audio is not in the repo. CI stays green without it. Set FOX_EARS_P1_RATE_FILES=1
  // to run the master/stretch proof (results written to docs/calibration/p1/rate-equivalence.json).
  if (process.env.FOX_EARS_P1_RATE_FILES !== "1" || !existsSync(MASTER) || !existsSync(STRETCH)) {
    t.skip("set FOX_EARS_P1_RATE_FILES=1 with local master/stretch wavs to run this proof");
    return;
  }
  // These files are long (~100s). Run all three rates; fail the test if they disagree.
  const results = { master: {}, stretch: {} };
  for (const [label, path] of [["master", MASTER], ["stretch", STRETCH]]) {
    const runs = [];
    for (const hz of [60, 120, 144]) {
      const r = await hearWav(path, hz);
      runs.push(r);
      results[label][hz] = { key: r.key, nSections: r.nSections, sections: r.sections };
    }
    const a = materiallyEquivalent(runs[0], runs[1]);
    const b = materiallyEquivalent(runs[0], runs[2]);
    assert.ok(a.ok, `${label} 60 vs 120: ${a.notes.join("; ")}`);
    assert.ok(b.ok, `${label} 60 vs 144: ${b.notes.join("; ")}`);
  }
  // Stash a compact receipt for the P1 log (not committed audio).
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(resolve(root, "../docs/calibration/p1"), { recursive: true });
  writeFileSync(
    resolve(root, "../docs/calibration/p1/rate-equivalence.json"),
    JSON.stringify({ dated: new Date().toISOString(), results }, null, 2),
  );
});
