/**
 * Fox Ears calibration harness.
 *   node calibration/run.mjs <audio files...> [--sens 0.58] [--json out.json] [--demo]
 *   [--truth test-song/results/scoring-truth-master.json fox-at-the-gate-master.wav]
 *   [--tick-hz 60|90|120] [--jitter-ms 3] [--gap 15000:18000]   (display-rate simulation, P0)
 *   [--compare previous.json]   (report key-mode flips = appraisal-input flips, P0)
 * Tempo vs FOX_REF is reported STRICT (displayed BPM within ±4%) and FORGIVEN
 * (half/double/2:3/3:2 also accepted) separately. All numbers are SOFT until
 * Taylor's own BPM/key answer key replaces the librosa stand-in.
 * Decodes each file with ffmpeg (44.1 kHz stereo f32), runs the offline engine
 * replica -> HearingSampler -> assembleMap (the same seal path as the app), and
 * prints the key calibration metrics plus an onset-gate sweep for tempo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { hearPcm, tickOnsetsMs } from "./offline-engine";
import { assembleMap } from "@/lib/hearing/bind";
import * as score from "@/lib/hearing/score";
import { estimateTempo, tempoForgiven, tempoStrict } from "@/lib/hearing/tempo";
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
  // chartTempo / chartVocalMask arrived in tuning pass 1; older app trees
  // fall back to their own logic so before/after runs share one harness.
  const sc = score as unknown as Record<string, ((f: HearingFrame[]) => unknown) | undefined>;
  const tp = (sc.chartTempo?.(frames) as { path: string } | undefined) ?? { path: "frame (pre-pass-1 app)" };
  const mask = (sc.chartVocalMask?.(frames) as boolean[] | undefined) ?? legacyVocalMask(frames);
  const lvl = frames.map((f) => (f.left_ear.level + f.right_ear.level) / 2);
  return {
    name, sensitivity: sens, duration_s: r2((frames.at(-1)?.t_ms ?? 0) / 1000), frames: frames.length,
    level: { mean: r2(lvl.reduce((a, b) => a + b, 0) / n), max: r2(Math.max(...lvl)), silent_frames: pct(lvl.filter((v) => v < 0.005).length / n) },
    pitch: { voiced: pct(frames.filter((f) => f.pitch_hz != null).length / n), vocal_gate: pct(frames.filter((f) => f.vocal_gate).length / n) },
    itd_null: pct(frames.filter((f) => f.binaural_measurement.itd_ms_R_minus_L == null).length / n),
    tempo: { bpm: r2(c.tempo_bpm), confidence: r2(c.tempo_confidence), note: c.tempo_note ?? "", path: tp.path },
    tempo_hypotheses: c.tempo_hypotheses ?? [],
    preferred_for: c.preferred_for ?? { transcription_grid: c.tempo_bpm, felt_groove: c.tempo_bpm, unresolved: false },
    section_cues: c.section_cues ?? [],
    section_disagreement: c.section_disagreement ?? [],
    input_change_receipts: c.input_change_receipts ?? [],
    onset_sweep: sweep,
    tick_onset_tempo: { onsets: tOn.length, bpm: tickTempo?.bpm ?? null, conf: r2(tickTempo?.confidence ?? 0), note: tickTempo?.note ?? "" },
    key: c.key ? `${c.key.tonic} ${c.key.mode} (${r2(c.key.confidence)})` : "UNKNOWN",
    key_note: c.key_note ?? "",
    chroma_reliable: c.chroma_reliable, chroma_note: c.chroma_note,
    chords: c.chords.length, sections: c.sections.length,
    section_list: c.sections.map((s) => `${(s.t_start_ms / 1000).toFixed(1)}-${(s.t_end_ms / 1000).toFixed(1)}s ${s.role} ${s.label}`),
    section_schema: c.section_schema ?? null,
    tuning: c.tuning ?? null,
    vocal_mask: pct(mask.filter(Boolean).length / n), vocal_mask_frames: mask.map((v, i) => (v ? frames[i]!.t_ms : -1)).filter((t) => t >= 0),
    vocal_regions: c.vocal_regions.length, notes: c.notes.length, vocal_notes: c.vocal_melody.length,
    range: c.range, vocal_range: c.vocal_range,
    frame_times: frames.map((f) => f.t_ms),
    section_cuts_s: c.sections.slice(1).map((s) => s.t_start_ms / 1000),
    objects: map.objects.length, conflicts: map.conflicts.length,
    object_list: map.objects.map((o) => `${(o.t_start_ms / 1000).toFixed(1)}-${(o.t_end_ms / 1000).toFixed(1)}s ${o.birth_band}Hz hops=${o.hops.length}`),
  };
}

/** Pre-pass-1 sustained-vocal rule (score.ts sustainedVocal, 5 frames). */
function legacyVocalMask(frames: HearingFrame[]): boolean[] {
  const on = frames.map((f) => Boolean(f.vocal_gate) && (f.vocal_likelihood ?? 0) >= 0.7);
  const out = on.slice();
  for (let i = 0; i < on.length; ) {
    if (!on[i]) { i++; continue; }
    let j = i; while (j < on.length && on[j]) j++;
    if (j - i < 5) for (let k = i; k < j; k++) out[k] = false;
    i = j;
  }
  return out;
}

// Demo etude ground truth (lib/audio/demo.ts): 9 grains as [t0, t1, band].
const DEMO_GRAINS: Array<[number, number, number]> = [
  [0.18, 4.23, 1000], [4.12, 8.17, 4000], [10.05, 13.9, 2000], [15.55, 18.7, 2000],
  [19.05, 21.47, 1000], [21.42, 23.97, 1000], [24.2, 28.6, 4000], [29.0, 35.6, 1000], [29.0, 35.6, 4000],
];
let demoName = "";
function demoGrains(frames: HearingFrame[]): string {
  const map = assembleMap({ title: "demo", sourceKind: "file", sourceName: "demo", frames, intervalMs: 80 });
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  let found = 0;
  for (const [g0, g1, band] of DEMO_GRAINS) {
    if (map.objects.some((o) => (o.birth_band === band || o.dominant_band === band) && ov(o.t_start_ms / 1000, o.t_end_ms / 1000, g0, g1) > 0.5)) found++;
  }
  const fake = map.objects.filter((o) => !DEMO_GRAINS.some(([g0, g1, band]) => (o.birth_band === band || o.dominant_band === band) && ov(o.t_start_ms / 1000, o.t_end_ms / 1000, g0, g1) > 0)).length;
  return `${found}/9 grains found as sound objects · ${fake} objects match no grain · ${map.objects.length} objects total`;
}

type Truth = { vocal_stem: { frame_ms: number; regions_s: number[][] }; srt_vocal_spans_s: number[][]; boundaries_s: { lyric: number[]; musical_bars: number[] }; tempo_bpm: number };
let truth: Truth | null = null;
let truthFor = "";
function scoreTruth(m: ReturnType<typeof metrics>): string {
  if (!truth) return "";
  const inR = (t: number, regs: number[][]) => regs.some(([a, b]) => t >= a! && t < b!);
  const onSet = new Set(m.vocal_mask_frames);
  let tp = 0, fp = 0, fn = 0, tpS = 0, fpS = 0, fnS = 0;
  for (const t of m.frame_times) {
    const s = t / 1000 - 0.04; // frame window centre
    const pred = onSet.has(t);
    const y = inR(s, truth.vocal_stem.regions_s);
    const yS = inR(s, truth.srt_vocal_spans_s);
    if (pred && y) tp++; else if (pred) fp++; else if (y) fn++;
    if (pred && yS) tpS++; else if (pred) fpS++; else if (yS) fnS++;
  }
  const P = tp / Math.max(1, tp + fp), R = tp / Math.max(1, tp + fn);
  const PS = tpS / Math.max(1, tpS + fpS), RS = tpS / Math.max(1, tpS + fnS);
  const cuts = m.section_cuts_s;
  const err = (gt: number[]) => gt.map((g) => Math.min(...cuts.map((c) => Math.abs(c - g)), Infinity));
  const eL = err(truth.boundaries_s.lyric), eB = err(truth.boundaries_s.musical_bars);
  const f = (a: number[]) => a.map((x) => (Number.isFinite(x) ? x.toFixed(2) : "—")).join(", ");
  const tempoErr = m.tempo.bpm == null ? "—" : `${(((Number(m.tempo.bpm) - truth.tempo_bpm) / truth.tempo_bpm) * 100).toFixed(2)}%`;
  return `tempo err ${tempoErr} · vocal frames vs stem P ${P.toFixed(2)} R ${R.toFixed(2)} · vs SRT spans P ${PS.toFixed(2)} R ${RS.toFixed(2)} · section cuts ${cuts.length} [${cuts.map((c) => c.toFixed(1)).join(", ")}] · nearest-cut error vs bars [${f(eB)}] s, vs lyrics [${f(eL)}] s`;
}

async function main() {
  const args = process.argv.slice(2);
  let sens = 0.58; let jsonOut: string | null = null; const files: string[] = []; let demo = false;
  let tickHz = 60; let jitterMs = 0; let gapMs: [number, number] | undefined; let comparePath = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--sens") sens = Number(args[++i]);
    else if (a === "--json") jsonOut = args[++i]!;
    else if (a === "--demo") demo = true;
    else if (a === "--tick-hz") tickHz = Number(args[++i]);
    else if (a === "--jitter-ms") jitterMs = Number(args[++i]);
    else if (a === "--gap") { const [g0, g1] = args[++i]!.split(":").map(Number); gapMs = [g0!, g1!]; }
    else if (a === "--compare") comparePath = args[++i]!;
    else if (a === "--truth") { const tp = args[++i]!; truth = JSON.parse(readFileSync(tp, "utf8")); truthFor = args[++i]!; }
    else files.push(a);
  }
  const results: unknown[] = [];
  const jobs: Array<[string, () => Promise<{ L: Float32Array; R: Float32Array }>]> = [];
  if (demo) demoName = "demo: Listening etude (36 s, ground truth = 9 grains / 5 scenes H N C T Q)";
  if (demo) jobs.push(["demo: Listening etude (36 s, ground truth = 9 grains / 5 scenes H N C T Q)", demoPcm]);
  for (const f of files) jobs.push([basename(f), async () => decode(f)]);
  for (const [name, load] of jobs) {
    const t0 = Date.now();
    const { L, R } = await load();
    const tickFlux: number[] = [];
    const frames = hearPcm(L, R, SR, { sensitivity: sens, tickFlux, tickHz, jitterMs, gapMs });
    const m = metrics(name, frames, sens, tickFlux);
    results.push(m);
    console.log(`\n=== ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s compute; ticks ${tickHz} Hz${jitterMs ? ` ±${jitterMs} ms` : ""}${gapMs ? ` gap ${gapMs[0]}-${gapMs[1]} ms` : ""})`);
    console.log(`  duration ${m.duration_s}s · frames ${m.frames} · level mean ${m.level.mean} max ${m.level.max} · silent ${m.level.silent_frames}`);
    console.log(`  tempo ${m.tempo.bpm} BPM conf ${m.tempo.confidence} — ${m.tempo.note}`);
    if (m.tempo_hypotheses?.length) console.log(`  tempo_hypotheses: ${m.tempo_hypotheses.map((h) => `${h.role}=${h.value_bpm}`).join(", ")} · preferred_for grid=${m.preferred_for?.transcription_grid} groove=${m.preferred_for?.felt_groove} unresolved=${m.preferred_for?.unresolved}`);
    console.log(`  onset-gate sweep: ` + m.onset_sweep.map((s) => `${s.gate}:${s.onsets}on→${s.bpm ?? "—"}bpm@${r2(s.conf)}`).join("  "));
    console.log(`  [old proposal, kept for comparison] 60Hz adaptive onsets: ${m.tick_onset_tempo.onsets}on → ${m.tick_onset_tempo.bpm ?? "—"} BPM conf ${m.tick_onset_tempo.conf} — ${m.tick_onset_tempo.note}`);
    console.log(`  app tempo path: ${m.tempo.path}`);
    console.log(`  key ${m.key} · chroma_reliable ${m.chroma_reliable} · chords ${m.chords} · sections ${m.sections}${m.key_note ? ` · ${m.key_note}` : ""}`);
    console.log(`  sections: ${m.section_list.join(" | ")}`);
    if (m.section_schema) console.log(`  section_schema: ${m.section_schema.note}`);
    if (m.tuning) console.log(`  tuning: A4=${m.tuning.a4_hz ?? "—"} Hz, ${m.tuning.cents_vs_440 ?? "—"} ¢ vs 440, applied=${m.tuning.applied} (${m.tuning.label})`);
    if (m.section_disagreement?.length) console.log(`  section disagreement: ${m.section_disagreement.map((d) => d.statement).join(" | ")}`);
    console.log(`  chart vocal mask ${m.vocal_mask} · vocal regions ${m.vocal_regions}`);
    if (demoName === name) console.log(`  demo grains: ${demoGrains(frames)}`);
    if (truth && name === basename(truthFor)) console.log(`  vs truth: ${scoreTruth(m)}`);
    console.log(`  voiced ${m.pitch.voiced} · vocal_gate ${m.pitch.vocal_gate} · notes ${m.notes} (vocal ${m.vocal_notes}) · range ${m.range ? `${m.range.low}–${m.range.high}` : "—"}`);
    console.log(`  ITD null ${m.itd_null} · sound objects ${m.objects} · binding conflicts ${m.conflicts}`);
    if (!m.chroma_reliable) console.log(`  chroma note: ${m.chroma_note}`);
  }
  const refPath = process.env.FOX_REF ?? "";
  if (refPath && existsSync(refPath)) {
    const ref: Array<{ file: string; librosa_bpm: number; ks_key: string }> = JSON.parse(readFileSync(refPath, "utf8"));
    let tS = 0, tF = 0, tB = 0, kA = 0, n = 0;
    console.log("\n--- vs librosa stand-in reference (SOFT; Taylor's answer key pending) ---");
    console.log("    STRICT = displayed BPM within ±4% · FORGIVEN = also half/double/2:3/3:2 within ±4%");
    for (const r of results as Array<any>) {
      const x = ref.find((q) => q.file === r.name); if (!x) continue; n++;
      const s = tempoStrict(r.tempo.bpm, x.librosa_bpm), f = tempoForgiven(r.tempo.bpm, x.librosa_bpm);
      const b = tempoForgiven(r.tick_onset_tempo.bpm, x.librosa_bpm), k = String(r.key).startsWith(x.ks_key);
      tS += +s; tF += +f; tB += +b; kA += +k;
      r.tempo_strict = s; r.tempo_forgiven = f;
      console.log(`  ${r.name.padEnd(28)} ref ${String(x.librosa_bpm).padStart(6)} BPM ${x.ks_key.padEnd(9)} | app ${String(r.tempo.bpm).padStart(5)} strict ${s ? "✓" : "✗"} forgiven ${f ? "✓" : "✗"} | old 60Hz proposal ${String(r.tick_onset_tempo.bpm ?? "—").padStart(4)} ${b ? "✓" : "✗"} | key ${r.key} ${k ? "✓" : "✗"}`);
    }
    console.log(`  SCORE tempo STRICT ${tS}/${n} · tempo FORGIVEN ${tF}/${n} · old 60Hz proposal (forgiven) ${tB}/${n} · key exact ${kA}/${n}`);
  }
  if (comparePath && existsSync(comparePath)) reportAppraisalFlips(JSON.parse(readFileSync(comparePath, "utf8")), results as Array<any>);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(results, null, 2)); console.log(`\nwrote ${jsonOut}`); }
}
/**
 * P1: a key-mode change is a REVIEW / changed-input receipt, not a feeling
 * promotion. Mode no longer drives first-listen valence (inward/release).
 */
function reportAppraisalFlips(prev: Array<any>, cur: Array<any>) {
  const mode = (k: string) => (/\bminor\b/.test(k) ? "minor" : /\bmajor\b/.test(k) ? "major" : "unknown");
  const tonic = (k: string) => String(k).split(" ")[0];
  let flips = 0, n = 0;
  console.log("\n--- REVIEW / changed-input receipts (mode flip; not a feeling promotion) ---");
  for (const r of cur) {
    const p = prev.find((q) => q.name === r.name); if (!p) continue; n++;
    const a = mode(String(p.key)), b = mode(String(r.key));
    const tonicMoved = tonic(p.key) !== tonic(r.key);
    if (a !== b) {
      flips++;
      console.log(`  REVIEW changed-input cue=mode ${r.name}: ${p.key} -> ${r.key}`);
    } else if (tonicMoved) {
      console.log(`  key tonic moved (mode kept) ${r.name}: ${p.key} -> ${r.key}`);
    }
  }
  console.log(`  ${flips}/${n} songs issued a mode changed-input receipt`);
}

main().catch((e) => { console.error(e); process.exit(1); });
