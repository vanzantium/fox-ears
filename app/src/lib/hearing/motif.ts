/**
 * MOTIF FINDER (P4, 2026-11-21) — a matched filter, the one part of sonar that
 * transfers literally: slide a known "ping" (here, a riff) along the song and
 * listen for where it comes back.
 *
 * The template is a run of beats (bass-led harmonic vectors). It is matched at
 * every beat and in all 12 transpositions, so a riff that moves to the IV
 * (+5 semitones) is still found and reported as moved. Default template: the
 * first instance of the most repeated sonar phrase (the "home riff"); any bar
 * range can be passed instead.
 *
 * SOFT. Chroma-level, so it hears the riff's harmony and bass motion, not its
 * exact rhythm or octave.
 */
import type { SonarBar, SonarPhrase, SonarUnit } from "./sonar";
import { cos, rotate12 } from "./vec";

export const MOTIF_TUNING = {
  /** Bass leads: a bassist's riff is mostly the low line. */
  wChroma: 0.5,
  wBass: 1.0,
  /** Mean per-beat cosine for a hit. Provisional (docs/p4-sonar-log). */
  hit: 0.82,
  /** Longest default template, bars. */
  maxBars: 4,
  maxHits: 64,
} as const;

export type MotifHit = {
  t_ms: number;
  /** Bar containing the hit's first beat (null before the first bar). */
  bar: number | null;
  /** Beat index on the grid. */
  beat: number;
  score: number;
  /** Semitones relative to the template, -5..+6 (0 = same pitch). */
  transpose: number;
  on_downbeat: boolean;
  /** The template's own position. */
  origin: boolean;
};

export type MotifReading = {
  label: "SOFT";
  method: string;
  template: { letter: string | null; bar: number; bars: number; t_start_ms: number; t_end_ms: number };
  hits: MotifHit[];
  transposed_hits: number;
  note: string;
};

function motifVec(u: SonarUnit, s: number): number[] {
  return [
    ...rotate12(u.chroma, s).map((x) => x * MOTIF_TUNING.wChroma),
    ...rotate12(u.bass, s).map((x) => x * MOTIF_TUNING.wBass),
  ];
}

/** Mean per-beat cosine of the template at every start beat and transposition. */
export function matchTemplate(
  units: SonarUnit[],
  start: number,
  len: number,
): Array<{ unit: number; score: number; transpose: number }> {
  const tmpl: number[][][] = [];
  for (let s = 0; s < 12; s++) {
    const row: number[][] = [];
    for (let k = 0; k < len; k++) row.push(motifVec(units[start + k]!, s));
    tmpl.push(row);
  }
  const live = Array.from({ length: len }, (_, k) => !units[start + k]!.silent);
  const target = units.map((u) => motifVec(u, 0));
  const out: Array<{ unit: number; score: number; transpose: number }> = [];
  for (let j = 0; j + len <= units.length; j++) {
    let bestS = -1;
    let bestT = 0;
    for (let s = 0; s < 12; s++) {
      let sum = 0;
      let c = 0;
      for (let k = 0; k < len; k++) {
        if (!live[k]) continue;
        c++;
        if (units[j + k]!.silent) continue; // silence never matches a note
        sum += Math.max(0, cos(tmpl[s]![k]!, target[j + k]!));
      }
      const score = c ? sum / c : 0;
      if (score > bestS) {
        bestS = score;
        bestT = s;
      }
    }
    out.push({ unit: j, score: bestS, transpose: bestT > 6 ? bestT - 12 : bestT });
  }
  return out;
}

/** Non-maximum suppression: keep the best hit per template-length window. */
function pickHits(cands: Array<{ unit: number; score: number; transpose: number }>, len: number, min: number) {
  const sorted = cands.filter((c) => c.score >= min).sort((a, b) => b.score - a.score);
  const taken: typeof sorted = [];
  for (const c of sorted) {
    if (taken.some((t) => Math.abs(t.unit - c.unit) < len)) continue;
    taken.push(c);
    if (taken.length >= MOTIF_TUNING.maxHits) break;
  }
  return taken.sort((a, b) => a.unit - b.unit);
}

export function findMotifAt(
  units: SonarUnit[],
  bars: SonarBar[],
  startBar: number,
  nBars: number,
  letter: string | null = null,
): MotifReading | null {
  const first = bars[startBar];
  const last = bars[Math.min(bars.length - 1, startBar + nBars - 1)];
  if (!first || !last) return null;
  const start = first.u0;
  const len = last.u1 - first.u0;
  if (len < 2) return null;
  let liveBeats = 0;
  for (let k = start; k < start + len; k++) if (!units[k]!.silent) liveBeats++;
  if (liveBeats * 2 < len) return null;
  const hits = pickHits(matchTemplate(units, start, len), len, MOTIF_TUNING.hit).map((c) => {
    const barIdx = bars.findIndex((b) => c.unit >= b.u0 && c.unit < b.u1);
    const b = barIdx >= 0 ? bars[barIdx]! : null;
    return {
      t_ms: Math.round(units[c.unit]!.t0),
      bar: b ? b.index : null,
      beat: c.unit,
      score: Math.round(c.score * 1000) / 1000,
      transpose: c.transpose,
      on_downbeat: !!b && b.u0 === c.unit,
      origin: c.unit === start,
    };
  });
  return {
    label: "SOFT",
    method: "matched filter: bass-led beat chroma, all 12 transpositions, non-max suppression",
    template: {
      letter,
      bar: startBar,
      bars: Math.min(nBars, bars.length - startBar),
      t_start_ms: Math.round(first.t_start_ms),
      t_end_ms: Math.round(last.t_end_ms),
    },
    hits,
    transposed_hits: hits.filter((h) => h.transpose !== 0).length,
    note: "chroma-level riff match: hears harmony and bass motion, not exact rhythm or octave",
  };
}

/** Default: the first instance of the most repeated phrase letter. */
export function findMotif(units: SonarUnit[], bars: SonarBar[], phrases: SonarPhrase[]): MotifReading | null {
  const count = new Map<string, number>();
  for (const p of phrases) {
    const base = p.letter.replace(/'+$/, "");
    if (base === "–") continue;
    count.set(base, (count.get(base) ?? 0) + 1);
  }
  let top: string | null = null;
  let topN = 0;
  for (const p of phrases) {
    const base = p.letter.replace(/'+$/, "");
    const n = count.get(base) ?? 0;
    if (n > topN) {
      top = base;
      topN = n;
    }
  }
  if (!top) return null;
  const firstPhrase = phrases.find((p) => p.letter === top);
  if (!firstPhrase) return null;
  const nextBar = phrases[firstPhrase.index + 1]?.bar ?? bars.length;
  const nBars = Math.max(1, Math.min(MOTIF_TUNING.maxBars, nextBar - firstPhrase.bar));
  return findMotifAt(units, bars, firstPhrase.bar, nBars, top);
}
