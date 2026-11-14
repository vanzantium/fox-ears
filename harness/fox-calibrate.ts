/**
 * Fox Ears calibration harness.
 *   node calibration/run.mjs <audio files...> [--sens 0.58] [--json out.json] [--demo]
 * Decodes each file with ffmpeg (44.1 kHz stereo f32), runs the offline engine
 * replica -> HearingSampler -> assembleMap (the same seal path as the app), and
 * prints the key calibration metrics plus an onset-gate sweep for tempo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { hearPcm, tickOnsetsMs } from "./offline-engine";
import { assembleMap } from "@/lib/hearing/bind";
import { estimateTempo } from "@/lib/hearing/tempo";
import { renderDemoWav } from "@/lib/audio/demo";
import type { HearingFrame } from "@/lib/hearing/types";

const SR = 44100;
const GATES = [0.10, 0.14, 0.18, 0.24, 0.30];

function decode(path: string): { L: Float32Array; R: Float32Array } {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = f.length >> 1, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]!; R[i] = f[2 * i + 1]!; }
  return { L, R };
}

async function demoPcm() {
  const blob = renderDemoWav();
  const b = Buffer.from(await blob.arrayBuffer());
  const n = (b.length - 44) / 4, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = b.readInt16LE(44 + 4 * i) / 32768; R[i] = b.readInt16LE(46 + 4 * i) / 32768; }
  return { L, R };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const r2 = (x: number | null | undefined) => (x == null ? "—" : Math.round(x * 100) / 100);

function metrics(name: string, frames: HearingFrame[], sens: number, tickFlux: number[] = []) {
  const map = assembleMap({ title: name, sourceKind: "file", sourceName: name, frames, intervalMs: 80 });
  const c = map.chart;
  const n = frames.length || 1;
  const onsetVal = (f: HearingFrame) => Math.max(f.left_ear.onset, f.right_ear.onset, f.flux);
  const sweep = GATES.map((g) => {
    const on = frames.filter((f) => onsetVal(f) > g).map((f) => f.t_ms);
    const t = estimateTempo(on);
    return { gate: g, onsets: on.length, bpm: t?.bpm ?? null, conf: t?.confidence ?? 0, note: t?.note ?? "null (sparse)" };
  });
  const tOn = tickOnsetsMs(tickFlux);
  const tickTempo = estimateTempo(tOn);
  const lvl = frames.map((f) => (f.left_ear.level + f.right_ear.level) / 2);
  return {
    name, sensitivity: sens, duration_s: r2((frames.at(-1)?.t_ms ?? 0) / 1000), frames: frames.length,
    level: { mean: r2(lvl.reduce((a, b) => a + b, 0) / n), max: r2(Math.max(...lvl)), silent_frames: pct(lvl.filter((v) => v < 0.005).length / n) },
    pitch: { voiced: pct(frames.filter((f) => f.pitch_hz != null).length / n), vocal_gate: pct(frames.filter((f) => f.vocal_gate).length / n) },
    itd_null: pct(frames.filter((f) => f.binaural_measurement.itd_ms_R_minus_L == null).length / n),
    tempo: { bpm: r2(c.tempo_bpm), confidence: r2(c.tempo_confidence), note: c.tempo_note ?? "" },
    onset_sweep: sweep,
    tick_onset_tempo: { onsets: tOn.length, bpm: tickTempo?.bpm ?? null, conf: r2(tickTempo?.confidence ?? 0), note: tickTempo?.note ?? "" },
    key: c.key ? `${c.key.tonic} ${c.key.mode} (${r2(c.key.confidence)})` : "UNKNOWN",
    chroma_reliable: c.chroma_reliable, chroma_note: c.chroma_note,
    chords: c.chords.length, sections: c.sections.length, notes: c.notes.length, vocal_notes: c.vocal_melody.length,
    range: c.range, vocal_range: c.vocal_range,
    objects: map.objects.length, conflicts: map.conflicts.length,
    object_list: map.objects.map((o) => `${(o.t_start_ms / 1000).toFixed(1)}-${(o.t_end_ms / 1000).toFixed(1)}s ${o.birth_band}Hz hops=${o.hops.length}`),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let sens = 0.58; let jsonOut: string | null = null; const files: string[] = []; let demo = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--sens") sens = Number(args[++i]);
    else if (a === "--json") jsonOut = args[++i]!;
    else if (a === "--demo") demo = true;
    else files.push(a);
  }
  const results: unknown[] = [];
  const jobs: Array<[string, () => Promise<{ L: Float32Array; R: Float32Array }>]> = [];
  if (demo) jobs.push(["demo: Listening etude (36 s, ground truth = 9 grains / 5 scenes H N C T Q)", demoPcm]);
  for (const f of files) jobs.push([basename(f), async () => decode(f)]);
  for (const [name, load] of jobs) {
    const t0 = Date.now();
    const { L, R } = await load();
    const tickFlux: number[] = [];
    const frames = hearPcm(L, R, SR, { sensitivity: sens, tickFlux });
    const m = metrics(name, frames, sens, tickFlux);
    results.push(m);
    console.log(`\n=== ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s compute)`);
    console.log(`  duration ${m.duration_s}s · frames ${m.frames} · level mean ${m.level.mean} max ${m.level.max} · silent ${m.level.silent_frames}`);
    console.log(`  tempo ${m.tempo.bpm} BPM conf ${m.tempo.confidence} — ${m.tempo.note}`);
    console.log(`  onset-gate sweep: ` + m.onset_sweep.map((s) => `${s.gate}:${s.onsets}on→${s.bpm ?? "—"}bpm@${r2(s.conf)}`).join("  "));
    console.log(`  [proposal] 60Hz adaptive onsets: ${m.tick_onset_tempo.onsets}on → ${m.tick_onset_tempo.bpm ?? "—"} BPM conf ${m.tick_onset_tempo.conf} — ${m.tick_onset_tempo.note}`);
    console.log(`  key ${m.key} · chroma_reliable ${m.chroma_reliable} · chords ${m.chords} · sections ${m.sections}`);
    console.log(`  voiced ${m.pitch.voiced} · vocal_gate ${m.pitch.vocal_gate} · notes ${m.notes} (vocal ${m.vocal_notes}) · range ${m.range ? `${m.range.low}–${m.range.high}` : "—"}`);
    console.log(`  ITD null ${m.itd_null} · sound objects ${m.objects} · binding conflicts ${m.conflicts}`);
    if (!m.chroma_reliable) console.log(`  chroma note: ${m.chroma_note}`);
  }
  const refPath = process.env.FOX_REF ?? "";
  if (refPath && existsSync(refPath)) {
    const ref: Array<{ file: string; librosa_bpm: number; ks_key: string }> = JSON.parse(readFileSync(refPath, "utf8"));
    const near = (a: number | null, b: number) => a != null && [0.5, 1, 2, 2 / 3, 1.5].some((k) => Math.abs(a - b * k) / (b * k) <= 0.04);
    let tA = 0, tB = 0, kA = 0, n = 0;
    console.log("\n--- vs independent reference (librosa; octave/3:2 errors forgiven, ±4%) ---");
    for (const r of results as Array<any>) {
      const x = ref.find((q) => q.file === r.name); if (!x) continue; n++;
      const a = near(r.tempo.bpm, x.librosa_bpm), b = near(r.tick_onset_tempo.bpm, x.librosa_bpm), k = String(r.key).startsWith(x.ks_key);
      tA += +a; tB += +b; kA += +k;
      console.log(`  ${r.name.padEnd(28)} ref ${String(x.librosa_bpm).padStart(6)} BPM ${x.ks_key.padEnd(9)} | app ${String(r.tempo.bpm).padStart(4)} ${a ? "✓" : "✗"} | 60Hz ${String(r.tick_onset_tempo.bpm ?? "—").padStart(4)} ${b ? "✓" : "✗"} | key ${r.key} ${k ? "✓" : "✗"}`);
    }
    console.log(`  SCORE tempo(app 80ms) ${tA}/${n} · tempo(60Hz proposal) ${tB}/${n} · key exact ${kA}/${n}`);
  }
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(results, null, 2)); console.log(`\nwrote ${jsonOut}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
