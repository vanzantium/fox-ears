import { midiToName, midiToPc } from "@/lib/audio/pitch";
import { chromaReliability } from "@/lib/audio/chroma";
import { inferChords } from "./chords";
import { hierarchicalForm } from "./form";
import { beatGridAligned, estimateTempo } from "./tempo";
import { falsifyChromatic, type PassOptions } from "./songModel";
import { buildAffect } from "./affect";
import {
  degreeOf,
  estimateTonic,
  PC_NAMES,
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
  const onsets = frames.filter((f) => Math.max(f.left_ear.onset, f.right_ear.onset, f.flux) > 0.18);
  const onsetMs = onsets.map((f) => f.t_ms);
  const tempo = estimateTempo(onsetMs);
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const beats = tempo?.bpm ? beatGridAligned(lastT, tempo.bpm, onsetMs) : [];
  const rel = chromaReliability(frames.map((f) => ({ chroma: f.chroma })));
  const hypotheses = [
    ...(pass?.keyPrior ?? []),
    ...keyHypotheses(frames),
  ].slice(0, 4);
  const key = rel.ok ? estimateKey(frames) : null;
  let chords = rel.ok ? inferChords(frames, key, hypotheses, pass?.chordWinMs ?? 2200) : [];
  if (pass?.kind === "contradiction") chords = falsifyChromatic({ ...emptyChart(), chords }, frames).chords;
  const sections = hierarchicalForm(frames);
  const vocal_regions = vocalRegions(frames).filter((v) =>
    pass?.vocalIgnoreIntroMs ? v.t_start_ms >= pass.vocalIgnoreIntroMs || v.t_end_ms - v.t_start_ms > 1800 : true,
  );
  let vocal_melody = vocalMelody(notes, frames);
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

function estimateKey(frames: HearingFrame[]): SongChart["key"] {
  const acc = new Array<number>(12).fill(0);
  for (const f of frames) {
    const ch = f.chroma;
    if (!ch || ch.length !== 12) continue;
    const w = (f.left_ear.level + f.right_ear.level) * 0.5 + 0.05;
    for (let i = 0; i < 12; i++) acc[i] = (acc[i] ?? 0) + (ch[i] ?? 0) * w;
  }
  const est = estimateTonic(acc);
  if (!est) return null;
  return { tonic: est.name, mode: est.mode, confidence: Math.round(Math.max(0, est.corr) * 100) / 100 };
}

function vocalRegions(frames: HearingFrame[]): SongChart["vocal_regions"] {
  const out: SongChart["vocal_regions"] = [];
  let start: HearingFrame | null = null;
  let peak = 0;
  const close = (t: number) => {
    if (!start) return;
    if (t - start.t_ms >= 480) {
      out.push({ t_start_ms: start.t_ms, t_end_ms: t, likelihood: peak });
    }
    start = null;
    peak = 0;
  };
  for (const f of frames) {
    const v = f.vocal_likelihood ?? 0;
    if (v > 0.72 && f.vocal_gate) {
      if (!start) start = f;
      peak = Math.max(peak, v);
    } else if (start) {
      close(f.t_ms);
    }
  }
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

function vocalMelody(notes: NoteEvent[], frames: HearingFrame[]): NoteEvent[] {
  const mask = sustainedVocal(frames, 5);
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

function sustainedVocal(frames: HearingFrame[], minFrames: number): Set<number> {
  const on = new Set<number>();
  let run: HearingFrame[] = [];
  const flush = () => {
    if (run.length >= minFrames) for (const f of run) on.add(f.t_ms);
    run = [];
  };
  for (const f of frames) {
    if (f.vocal_gate && (f.vocal_likelihood ?? 0) >= 0.7) run.push(f);
    else flush();
  }
  flush();
  return on;
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
