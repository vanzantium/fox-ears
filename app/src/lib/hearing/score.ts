import { midiToName, midiToPc } from "@/lib/audio/pitch";
import { chromaReliability } from "@/lib/audio/chroma";
import { vocalMask } from "@/lib/audio/vocal";
import { inferChords } from "./chords";
import { hierarchicalForm } from "./form";
import { beatGridAligned, estimateTempo, estimateTempoSubgrid, pickTickOnsets } from "./tempo";
import { falsifyChromatic, type PassOptions } from "./songModel";
import { buildAffect } from "./affect";
import {
  degreeOf,
  estimateTonic,
  MAJOR_PROFILE,
  MINOR_PROFILE,
  PC_NAMES,
  pearson,
} from "./sonofield";
import type {
  ChordEvent,
  DegreeEvent,
  HearingFrame,
  LyricLine,
  NoteEvent,
  SongChart,
} from "./types";

export function emptyChart(): SongChart {
  return {
    tempo_bpm: null,
    tempo_confidence: 0,
    tempo_candidates: [],
    tempo_note: undefined,
    key: null,
    key_hypotheses: [],
    local_centers: [],
    chroma_reliable: true,
    range: null,
    vocal_range: null,
    notes: [],
    vocal_melody: [],
    chords: [],
    beats: [],
    sections: [],
    melody: [],
    vocal_regions: [],
    lyrics: { source: "none", text: "", lines: [] },
    function: { tonic: null, mode: null, degrees: [], mean_tension: 0, peak_tension: 0 },
  };
}

export function buildChart(
  frames: HearingFrame[],
  lyrics: { source: SongChart["lyrics"]["source"]; text: string; lines: LyricLine[] },
  pass?: PassOptions,
): SongChart {
  const notes = segmentNotes(frames);
  const { tempo, onsetMs } = chartTempo(frames);
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const beats = tempo?.bpm ? beatGridAligned(lastT, tempo.bpm, onsetMs) : [];
  const rel = chromaReliability(frames.map((f) => ({ chroma: f.chroma })));
  const vMask = chartVocalMask(frames);
  const sections = hierarchicalForm(frames, tempo?.bpm ?? null, beats, vMask);
  const keyEst = estimateKey(frames, sections);
  const key = rel.ok ? (keyEst?.key ?? null) : null;
  const hypotheses = [
    ...(pass?.keyPrior ?? []),
    ...(keyEst?.key ? hypothesesFromKey(keyEst.key) : keyHypotheses(frames)),
  ].slice(0, 4);
  let chords = rel.ok ? inferChords(frames, key, hypotheses, pass?.chordWinMs ?? 2200) : [];
  if (pass?.kind === "contradiction") chords = falsifyChromatic({ ...emptyChart(), chords }, frames).chords;
  const vocal_regions = vocalRegions(frames, vMask).filter((v) =>
    pass?.vocalIgnoreIntroMs ? v.t_start_ms >= pass.vocalIgnoreIntroMs || v.t_end_ms - v.t_start_ms > 1800 : true,
  );
  let vocal_melody = vocalMelody(notes, frames, vMask);
  const minMs = pass?.vocalMinMs;
  if (minMs) vocal_melody = vocal_melody.filter((n) => n.dur_ms >= minMs);
  const ignoreIntro = pass?.vocalIgnoreIntroMs;
  if (ignoreIntro) vocal_melody = vocal_melody.filter((n) => n.t_ms >= ignoreIntro);
  const local_centers = localCenters(frames);
  const fn = buildFunction(frames, vocal_melody, chords, key);
  const macro = macroTension(frames);
  if (fn) {
    fn.macro_peak_ms = macro.peak_ms;
    fn.macro_peak = macro.peak;
  }

  const midis = notes.map((n) => n.midi);
  let range: SongChart["range"] = null;
  if (midis.length) {
    const lo = Math.min(...midis);
    const hi = Math.max(...midis);
    const med = midis.slice().sort((a, b) => a - b)[Math.floor(midis.length / 2)] ?? lo;
    range = { low: midiToName(lo), high: midiToName(hi), median: midiToName(med) };
  }

  const vMidis = vocal_melody.map((n) => n.midi);
  let vocal_range: SongChart["vocal_range"] = null;
  if (vMidis.length) {
    const lo = Math.min(...vMidis);
    const hi = Math.max(...vMidis);
    const med = vMidis.slice().sort((a, b) => a - b)[Math.floor(vMidis.length / 2)] ?? lo;
    vocal_range = { low: midiToName(lo), high: midiToName(hi), median: midiToName(med) };
  }

  return {
    tempo_bpm: tempo?.bpm ?? null,
    tempo_confidence: tempo?.confidence ?? 0,
    tempo_candidates: tempo?.candidates,
    tempo_note: tempo?.note,
    key,
    key_hypotheses: hypotheses,
    local_centers,
    chroma_reliable: rel.ok,
    chroma_note: rel.note,
    key_note: rel.ok ? keyEst?.note : undefined,
    range,
    vocal_range,
    notes,
    vocal_melody,
    chords,
    beats,
    sections,
    melody: vocal_melody.map((n) => ({ t_ms: n.t_ms, midi: n.midi, name: n.name })),
    vocal_regions,
    lyrics,
    function: fn,
  };
}

function segmentNotes(frames: HearingFrame[]): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let cur: NoteEvent | null = null;
  const flush = (tEnd: number) => {
    if (!cur) return;
    cur.dur_ms = Math.max(40, tEnd - cur.t_ms);
    if (cur.dur_ms >= 110 && cur.confidence > 0.28) notes.push(cur);
    cur = null;
  };
  for (const f of frames) {
    const midi = f.midi;
    const conf = f.pitch_confidence ?? 0;
    if (midi === null || conf < 0.22) {
      if (cur) flush(f.t_ms);
      continue;
    }
    if (!cur) {
      cur = {
        t_ms: f.t_ms,
        dur_ms: 0,
        midi: Math.round(midi),
        name: f.note ?? midiToName(midi),
        hz: f.pitch_hz ?? 0,
        confidence: conf,
      };
      continue;
    }
    if (Math.abs(midi - cur.midi) < 0.7) {
      cur.confidence = Math.max(cur.confidence, conf);
      cur.hz = f.pitch_hz ?? cur.hz;
    } else if (Math.abs(Math.abs(midi - cur.midi) - 12) < 0.8) {
      // Octave jump: keep the ongoing register.
      cur.confidence = Math.max(cur.confidence * 0.9, conf * 0.6);
    } else {
      flush(f.t_ms);
      cur = {
        t_ms: f.t_ms,
        dur_ms: 0,
        midi: Math.round(midi),
        name: f.note ?? midiToName(midi),
        hz: f.pitch_hz ?? 0,
        confidence: conf,
      };
    }
  }
  const last = frames[frames.length - 1];
  if (cur && last) flush(last.t_ms);
  return notes;
}

/** Frame-gate threshold for the legacy 80 ms onset path (maps without ticks). */
const LEGACY_ONSET_GATE = 0.18;

/**
 * Tempo for the chart. Maps sealed since tuning pass 1 carry per-tick flux, so
 * onsets are peak-picked at ~60 Hz and fed to the sub-grid estimator (comb +
 * octave prior + fine grid fit). Older maps fall back to the 80 ms frame gate.
 */
export function chartTempo(frames: HearingFrame[]): {
  tempo: ReturnType<typeof estimateTempo>;
  onsetMs: number[];
  path: "subgrid" | "frame";
} {
  const tickMs: number[] = [];
  const tickFlux: number[] = [];
  for (const f of frames) {
    if (!f.ticks) continue;
    for (let i = 0; i < f.ticks.t_ms.length; i++) {
      tickMs.push(f.ticks.t_ms[i] ?? 0);
      tickFlux.push(f.ticks.flux[i] ?? 0);
    }
  }
  if (tickMs.length >= frames.length * 2) {
    // With ticks present the sub-grid answer stands, including "no stable
    // pulse" (null): the coarse 80 ms gate is not a better second opinion.
    const onsets = pickTickOnsets(tickMs, tickFlux);
    return { tempo: estimateTempoSubgrid(onsets), onsetMs: onsets.map((o) => o.t_ms), path: "subgrid" };
  }
  const onsetMs = frames
    .filter((f) => Math.max(f.left_ear.onset, f.right_ear.onset, f.flux) > LEGACY_ONSET_GATE)
    .map((f) => f.t_ms);
  return { tempo: estimateTempo(onsetMs), onsetMs, path: "frame" };
}

/** Key-finding constants (tuning pass 1, 2026-11-14). */
export const KEY_TUNING = {
  /** Weight of frames in the intro / first section (a dominant vamp there fooled the old reader). */
  introWeight: 0.3,
  /** If no first section is found, treat this fraction of the song as the intro. */
  introFallbackFrac: 0.1,
  /** A first section longer than this fraction is not treated as an intro. */
  introMaxFrac: 0.25,
  /** Bass chroma (55-180 Hz, mostly fundamentals) mixed into the profile. */
  bassWeight: 0.5,
  /** Fifth-related rivals closer than this (Pearson r) go to tonic-vs-dominant resolution. */
  closeCall: 0.1,
} as const;

/**
 * Whole-song key. Each voiced frame counts by duration (not loudness), the
 * intro / first section is discounted, and bass chroma is folded in because
 * the 90-1800 Hz chroma leans a fifth sharp (3rd harmonics). Then, when the
 * runner-up is a fifth away and close, tonic-vs-dominant resolution compares
 * the pitch class only one of the two keys owns (4th vs raised 4th; b6 vs 6 in
 * minor) and the bass tonic. Both must favour the rival to overturn the top
 * key; otherwise it stands, and a confirming test raises confidence.
 */
function estimateKey(
  frames: HearingFrame[],
  sections: SongChart["sections"] = [],
): { key: SongChart["key"]; note: string } | null {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const first = sections[0];
  const introEnd =
    first && sections.length > 1 && first.t_end_ms <= lastT * KEY_TUNING.introMaxFrac
      ? first.t_end_ms
      : lastT * KEY_TUNING.introFallbackFrac;
  const acc = new Array<number>(12).fill(0);
  const bass = new Array<number>(12).fill(0);
  for (const f of frames) {
    const ch = f.chroma;
    if (!ch || ch.length !== 12) continue;
    const sum = ch.reduce((a, b) => a + b, 0);
    if (sum < 0.05) continue;
    const w = f.t_ms < introEnd ? KEY_TUNING.introWeight : 1;
    for (let i = 0; i < 12; i++) acc[i] = (acc[i] ?? 0) + (ch[i] ?? 0) * w;
    const bc = f.bass_chroma;
    if (bc && bc.length === 12) for (let i = 0; i < 12; i++) bass[i] = (bass[i] ?? 0) + (bc[i] ?? 0) * w;
  }
  const aSum = acc.reduce((a, b) => a + b, 0);
  const bSum = bass.reduce((a, b) => a + b, 0);
  if (aSum <= 0) return null;
  const a = acc.map((v) => v / aSum);
  const b = bSum > 0 ? bass.map((v) => v / bSum) : new Array<number>(12).fill(0);
  const profile = a.map((v, i) => v + KEY_TUNING.bassWeight * (b[i] ?? 0));
  const ranked = rankKeys(profile);
  const top = ranked[0];
  if (!top || top.corr < 0.12) return null;
  let pick = top;
  let note = "duration-weighted chroma + bass, intro discounted";
  for (const d of [-7, 7]) {
    const altPc = (top.pc + d + 12) % 12;
    const alt = ranked.find((r) => r.pc === altPc && r.mode === top.mode);
    if (!alt || top.corr - alt.corr >= KEY_TUNING.closeCall) continue;
    const lower = d === -7 ? altPc : top.pc;
    const upper = (lower + 7) % 12;
    // Pitch class only the lower key owns minus the one only the upper key owns.
    const own =
      top.mode === "major"
        ? (a[(lower + 5) % 12] ?? 0) - (a[(lower + 6) % 12] ?? 0)
        : (a[(lower + 8) % 12] ?? 0) - (a[(lower + 9) % 12] ?? 0);
    const pcFavours = own > 0 ? lower : upper;
    const bassFavours = (b[lower] ?? 0) > (b[upper] ?? 0) ? lower : upper;
    if (pcFavours === altPc && bassFavours === altPc) {
      pick = alt;
      note = `tonic-vs-dominant: ${PC_NAMES[altPc]} over ${PC_NAMES[top.pc]} (scale-degree and bass tests agree)`;
    } else if (pcFavours === top.pc) {
      note = `tonic-vs-dominant: ${PC_NAMES[top.pc]} over ${PC_NAMES[altPc]} confirmed by the scale-degree test`;
    } else {
      note = `tonic-vs-dominant: ${PC_NAMES[top.pc]} vs ${PC_NAMES[altPc]} unresolved; kept the profile winner`;
    }
    break;
  }
  return {
    key: {
      tonic: PC_NAMES[pick.pc] ?? "C",
      mode: pick.mode,
      confidence: Math.round(Math.max(0, pick.corr) * 100) / 100,
    },
    note,
  };
}

function rankKeys(profile: number[]): Array<{ pc: number; mode: "major" | "minor"; corr: number }> {
  const rows: Array<{ pc: number; mode: "major" | "minor"; corr: number }> = [];
  for (let t = 0; t < 12; t++) {
    const shifted = profile.map((_, i) => profile[(i + t) % 12] ?? 0);
    rows.push({ pc: t, mode: "major", corr: pearson(shifted, MAJOR_PROFILE) });
    rows.push({ pc: t, mode: "minor", corr: pearson(shifted, MINOR_PROFILE) });
  }
  return rows.sort((x, y) => y.corr - x.corr);
}

/**
 * Whole-song vocal mask. Maps with vocal-band cues (vox) use the per-band
 * gate in lib/audio/vocal.ts with the song's own loud level, median smoothing
 * and a minimum run; older maps fall back to the live gate as recorded.
 */
export function chartVocalMask(frames: HearingFrame[]): boolean[] {
  const withVox = frames.filter((f) => f.vox).length;
  if (frames.length && withVox >= frames.length * 0.9) {
    return vocalMask(frames.map((f) => (f.vox ? { sideDb: f.vox.side_db, midDb: f.vox.mid_db, peaks: f.vox.peaks } : null)));
  }
  const on = frames.map((f) => Boolean(f.vocal_gate) && (f.vocal_likelihood ?? 0) >= 0.7);
  const out = on.slice();
  for (let i = 0; i < on.length; ) {
    if (!on[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < on.length && on[j]) j++;
    if (j - i < 5) for (let k = i; k < j; k++) out[k] = false;
    i = j;
  }
  return out;
}

function vocalRegions(frames: HearingFrame[], mask: boolean[]): SongChart["vocal_regions"] {
  const out: SongChart["vocal_regions"] = [];
  let start: HearingFrame | null = null;
  let peak = 0;
  const close = (t: number) => {
    if (!start) return;
    if (t - start.t_ms >= 480) {
      out.push({ t_start_ms: start.t_ms, t_end_ms: t, likelihood: Math.round(peak * 100) / 100 });
    }
    start = null;
    peak = 0;
  };
  frames.forEach((f, i) => {
    if (mask[i]) {
      if (!start) start = f;
      peak = Math.max(peak, f.vocal_likelihood ?? 0);
    } else if (start) {
      close(f.t_ms);
    }
  });
  const last = frames[frames.length - 1];
  if (start && last) close(last.t_ms);
  return out;
}

function buildFunction(
  frames: HearingFrame[],
  notes: NoteEvent[],
  chords: ChordEvent[],
  key: SongChart["key"],
): NonNullable<SongChart["function"]> {
  const tonicPc = key ? PC_NAMES.indexOf(key.tonic) : -1;
  const mode = key?.mode ?? "major";
  const degrees: DegreeEvent[] = [];
  if (tonicPc >= 0) {
    for (const n of notes) {
      const st = degreeOf(midiToPc(n.midi), tonicPc, mode);
      n.degree = st.degree;
      n.feeling = st.feeling;
      n.tension = st.tension;
      degrees.push({
        t_ms: n.t_ms,
        layer: "melody",
        degree: st.degree,
        feeling: st.feeling,
        tension: st.tension,
        euler: st.euler,
        midi: n.midi,
        stable: st.stable,
      });
    }
    for (const f of frames) {
      const bass = f.bass_chroma;
      if (!bass) continue;
      const pc = bass.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0);
      if ((bass[pc] ?? 0) < 0.35) continue;
      if (f.t_ms % 400 > 90) continue;
      const st = degreeOf(pc, tonicPc, mode);
      degrees.push({
        t_ms: f.t_ms,
        layer: "bass",
        degree: st.degree,
        feeling: st.feeling,
        tension: st.tension,
        euler: st.euler,
        midi: 36 + pc,
        stable: st.stable,
      });
    }
  }

  // Resolution events from degree stream (tense → stable)
  const byLayer = {
    melody: degrees.filter((d) => d.layer === "melody").sort((a, b) => a.t_ms - b.t_ms),
    bass: degrees.filter((d) => d.layer === "bass").sort((a, b) => a.t_ms - b.t_ms),
  } as const;
  const resolutions: NonNullable<SongChart["function"]>["resolutions"] = [];
  for (const layer of ["melody", "bass"] as const) {
    let peakT = 0;
    let peakAt = 0;
    let peakDeg = "1";
    for (const d of byLayer[layer]) {
      if (d.tension >= peakT) {
        peakT = d.tension;
        peakAt = d.t_ms;
        peakDeg = d.degree;
      }
      if (d.stable && peakT - d.tension >= 2.0 && d.t_ms - peakAt <= 2500 && peakT >= 4.0) {
        resolutions.push({
          t_ms: d.t_ms,
          from_degree: peakDeg,
          to_degree: d.degree,
          from_tension: peakT,
          to_tension: d.tension,
          drop: Math.round((peakT - d.tension) * 10) / 10,
          delay_ms: d.t_ms - peakAt,
          layer,
        });
        peakT = d.tension;
        peakAt = d.t_ms;
        peakDeg = d.degree;
      }
      if (d.t_ms - peakAt > 3000) {
        peakT = d.tension;
        peakAt = d.t_ms;
        peakDeg = d.degree;
      }
    }
  }

  // Per-frame tension for affect (mode-relative degree of dominant F0)
  const sortedDeg = [...degrees].sort((a, b) => a.t_ms - b.t_ms);
  let prevTen = 0;
  let deltaPeak = 0;
  const frameAffect = frames.map((f) => {
    let ten = 0;
    for (let i = sortedDeg.length - 1; i >= 0; i--) {
      if (sortedDeg[i]!.t_ms <= f.t_ms) {
        ten = sortedDeg[i]!.tension;
        break;
      }
    }
    if (tonicPc >= 0 && f.midi != null) {
      ten = Math.max(ten, degreeOf(midiToPc(f.midi), tonicPc, mode).tension);
    }
    const delta = ten - prevTen;
    deltaPeak = Math.max(deltaPeak, Math.abs(delta));
    prevTen = ten;
    const energy = (f.left_ear.level + f.right_ear.level) * 0.5;
    const onset = Math.max(f.left_ear.onset, f.right_ear.onset, f.flux);
    const high = f.left_ear.bands[4000] * 0.5 + f.right_ear.bands[4000] * 0.5;
    let bassMidi: number | null = null;
    if (f.bass_chroma) {
      const pc = f.bass_chroma.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0);
      if ((f.bass_chroma[pc] ?? 0) >= 0.25) bassMidi = 36 + pc;
    }
    return {
      t_ms: f.t_ms,
      energy,
      onset,
      centroid_hz: f.centroid_hz,
      high_band: high,
      pitch_hz: f.pitch_hz,
      pitch_confidence: f.pitch_confidence ?? 0,
      level: energy,
      tension: ten,
      tension_delta: delta,
      melody_midi: f.midi,
      bass_midi: bassMidi,
      mode: key?.mode ?? null,
    };
  });
  const affect = buildAffect(frameAffect);

  const tensions = [
    ...degrees.map((d) => d.tension),
    ...chords.map((c) => c.tension ?? 0),
  ].filter((n) => n > 0);
  const mean = tensions.length ? tensions.reduce((a, b) => a + b, 0) / tensions.length : 0;
  const peak = tensions.length ? Math.max(...tensions) : 0;
  return {
    tonic: key?.tonic ?? null,
    mode: key?.mode ?? null,
    degrees,
    mean_tension: Math.round(mean * 10) / 10,
    peak_tension: peak,
    tension_delta_peak: Math.round(deltaPeak * 10) / 10,
    resolutions: resolutions.slice(0, 24),
    affect: {
      mean_valence: affect.mean_valence,
      mean_arousal: affect.mean_arousal,
      peak_arousal: affect.peak_arousal,
      regions: affect.regions.slice(0, 16),
      conflicts: affect.conflicts.slice(0, 12),
    },
  };
}

function hypothesesFromKey(key: NonNullable<SongChart["key"]>): NonNullable<SongChart["key_hypotheses"]> {
  const pc = PC_NAMES.indexOf(key.tonic);
  const relPc = key.mode === "major" ? (pc + 9) % 12 : (pc + 3) % 12;
  return [
    { tonic: key.tonic, mode: key.mode, corr: key.confidence },
    {
      tonic: PC_NAMES[relPc] ?? "C",
      mode: key.mode === "major" ? "minor" : "major",
      corr: Math.round(key.confidence * 0.9 * 100) / 100,
    },
  ];
}

function keyHypotheses(frames: HearingFrame[]): NonNullable<SongChart["key_hypotheses"]> {
  const acc = new Array<number>(12).fill(0);
  for (const f of frames) {
    if (!f.chroma) continue;
    const w = (f.left_ear.level + f.right_ear.level) * 0.5;
    for (let i = 0; i < 12; i++) acc[i] += (f.chroma[i] ?? 0) * w;
  }
  const est = estimateTonic(acc);
  if (!est) return [];
  const rows: NonNullable<SongChart["key_hypotheses"]> = [
    { tonic: est.name, mode: est.mode, corr: Math.round(est.corr * 100) / 100 },
  ];
  const relPc = est.mode === "major" ? (est.pc + 9) % 12 : (est.pc + 3) % 12;
  rows.push({
    tonic: PC_NAMES[relPc] ?? "C",
    mode: est.mode === "major" ? "minor" : "major",
    corr: Math.round(est.corr * 0.9 * 100) / 100,
  });
  return rows;
}

function localCenters(frames: HearingFrame[]): NonNullable<SongChart["local_centers"]> {
  const raw: NonNullable<SongChart["local_centers"]> = [];
  if (frames.length < 20) return raw;
  const dt = Math.max(40, (frames[1]?.t_ms ?? 80) - (frames[0]?.t_ms ?? 0));
  const win = Math.max(16, Math.round(8000 / dt));
  const hop = Math.max(8, Math.floor(win / 2));
  for (let i = 0; i < frames.length; i += hop) {
    const slice = frames.slice(i, i + win);
    const acc = new Array<number>(12).fill(0);
    for (const f of slice) {
      if (!f.chroma) continue;
      const w = (f.left_ear.level + f.right_ear.level) * 0.5;
      for (let k = 0; k < 12; k++) acc[k] += (f.chroma[k] ?? 0) * w;
    }
    const est = estimateTonic(acc);
    if (!est) continue;
    raw.push({
      t_start_ms: slice[0]!.t_ms,
      t_end_ms: slice[slice.length - 1]!.t_ms,
      tonic: est.name,
      mode: est.mode,
      corr: Math.round(est.corr * 100) / 100,
    });
  }
  const out: NonNullable<SongChart["local_centers"]> = [];
  let hold: (typeof raw)[0] | null = null;
  let persist = 0;
  for (const c of raw) {
    if (!hold) {
      hold = { ...c };
      persist = 1;
      continue;
    }
    const same = hold.tonic === c.tonic && hold.mode === c.mode;
    if (same) {
      persist++;
      hold.t_end_ms = c.t_end_ms;
      hold.corr = Math.max(hold.corr, c.corr);
      continue;
    }
    const beats = c.corr > hold.corr + 0.08 && persist >= 1;
    if (beats && persist >= 2) {
      out.push(hold);
      hold = { ...c };
      persist = 1;
    } else {
      hold.t_end_ms = c.t_end_ms;
    }
  }
  if (hold) out.push(hold);
  return out;
}

function vocalMelody(notes: NoteEvent[], frames: HearingFrame[], vMask: boolean[]): NoteEvent[] {
  const mask = new Set<number>();
  frames.forEach((f, i) => {
    if (vMask[i]) mask.add(f.t_ms);
  });
  const gated = notes.filter((n) => {
    if (n.midi < 55 || n.midi > 76) return false;
    if (n.dur_ms < 400) return false;
    const span = frames.filter((f) => f.t_ms >= n.t_ms && f.t_ms <= n.t_ms + n.dur_ms);
    if (!span.length) return false;
    const v = span.filter((f) => mask.has(f.t_ms)).length / span.length;
    return v >= 0.55;
  });
  const out: NoteEvent[] = [];
  for (const n of gated) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(n.midi - prev.midi) >= 11) continue;
    out.push(n);
  }
  return out;
}

function macroTension(frames: HearingFrame[]): { peak_ms: number; peak: number } {
  if (!frames.length) return { peak_ms: 0, peak: 0 };
  const e = frames.map((f) => (f.left_ear.level + f.right_ear.level) * 0.5);
  const o = frames.map((f) => Math.max(f.left_ear.onset, f.right_ear.onset, f.flux));
  const c = frames.map((f) => f.centroid_hz / 4000);
  const v = frames.map((f) => (f.vocal_gate ? 1 : f.vocal_likelihood ?? 0));
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const me = mean(e);
  const mo = mean(o);
  const mc = mean(c);
  let bestI = 0;
  let best = -Infinity;
  for (let i = 0; i < frames.length; i++) {
    const t = (e[i]! - me) * 2.2 + (o[i]! - mo) * 1.4 + (c[i]! - mc) * 0.8 + v[i]! * 0.5;
    if (t > best) {
      best = t;
      bestI = i;
    }
  }
  return { peak_ms: frames[bestI]!.t_ms, peak: Math.round(best * 100) / 100 };
}

export function attachPastedLyrics(text: string, durationMs: number): LyricLine[] {
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  return lines.map((line, i) => ({
    t_ms: Math.round((i / Math.max(1, lines.length)) * durationMs),
    text: line,
    source: "pasted" as const,
  }));
}

export function formatChordChart(chart: SongChart): string {
  if (!chart.chords.length) return "(no stable harmony measured)";
  const lines: string[] = [];
  const sections = chart.sections.length
    ? chart.sections
    : [{ t_start_ms: 0, t_end_ms: Infinity, label: "A", hypothesis: "", role: "section" as const, energy_mean: 0 }];
  for (const sec of sections) {
    const chords = chart.chords.filter(
      (c) => c.t_ms >= sec.t_start_ms && c.t_ms < sec.t_end_ms,
    );
    if (!chords.length) continue;
    const heading = sec.hypothesis.split(" · ")[0] ?? sec.label;
    lines.push(`[${heading}]  ${fmtTime(sec.t_start_ms)}`);
    const symbols = chords.map((c) => c.roman || c.symbol);
    const letters = chords.map((c) => c.symbol);
    for (let i = 0; i < symbols.length; i += 4) {
      const bar = symbols.slice(i, i + 4);
      while (bar.length < 4) bar.push("—");
      lines.push(`| ${bar.map((s) => s.padEnd(6, " ")).join(" | ")} |`);
    }
    if (chords.some((c) => c.roman)) {
      for (let i = 0; i < letters.length; i += 4) {
        const bar = letters.slice(i, i + 4);
        while (bar.length < 4) bar.push("—");
        lines.push(`  ${bar.map((s) => s.padEnd(6, " ")).join("   ")}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}
