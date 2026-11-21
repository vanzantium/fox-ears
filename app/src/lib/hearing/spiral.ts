/**
 * TENSION RIBBON (P4, 2026-11-21) — Chew's spiral array with Herremans & Chew's
 * three tension measures, reimplemented natively (no dependency):
 *
 *   cloud diameter  — how far apart the sounding pitches are on the spiral
 *                     (dissonance / spread of the harmony in this bar)
 *   cloud momentum  — how far the bar's centre of effect moved from the last
 *                     bar (harmonic motion)
 *   tensile strain  — how far the bar's centre of effect sits from the key's
 *                     centre (distance from home)
 *
 * References: E. Chew, "Towards a Mathematical Model of Tonality" (PhD, MIT,
 * 2000) and "Mathematical and Computational Modeling of Tonality" (2014);
 * D. Herremans & E. Chew, "Tension ribbons: Quantifying and visualising tonal
 * tension" (TENOR 2016). Weights below are the commonly published defaults
 * (0.536 / 0.274 / 0.19, α = β = 0.75); check against the papers before
 * treating any number as calibrated.
 *
 * SOFT. Pitches come from chroma, not a score, so octave and voicing are lost:
 * this measures harmonic distance, not voice-leading.
 */
import { FIFTHS_INDEX, PC_NAMES } from "./sonofield";
import type { SonarBar, SonarUnit } from "./sonar";

const R = 1;
const H = Math.sqrt(2 / 15);
const W: [number, number, number] = [0.536, 0.274, 0.19];
const ALPHA = 0.75;
const BETA = 0.75;

export const SPIRAL_TUNING = {
  /** A pitch class sounds in a bar when its weight is at least this share of the bar's strongest. */
  presentShare: 0.35,
  /** At most this many pitch classes per bar. */
  maxPcs: 6,
  /** Bass chroma weight when building the bar's pitch weights. */
  wBass: 0.6,
} as const;

type V3 = [number, number, number];

export function spiralPoint(k: number): V3 {
  return [R * Math.sin((k * Math.PI) / 2), R * Math.cos((k * Math.PI) / 2), k * H];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix3 = (a: V3, b: V3, c: V3): V3 => add(add(scale(a, W[0]), scale(b, W[1])), scale(c, W[2]));

export function majorChord(k: number): V3 {
  return mix3(spiralPoint(k), spiralPoint(k + 1), spiralPoint(k + 4));
}
export function minorChord(k: number): V3 {
  return mix3(spiralPoint(k), spiralPoint(k + 1), spiralPoint(k - 3));
}
export function keyCentre(k: number, mode: "major" | "minor"): V3 {
  if (mode === "major") return mix3(majorChord(k), majorChord(k + 1), majorChord(k - 1));
  const dom = add(scale(majorChord(k + 1), ALPHA), scale(minorChord(k + 1), 1 - ALPHA));
  const sub = add(scale(minorChord(k - 1), BETA), scale(majorChord(k - 1), 1 - BETA));
  return mix3(minorChord(k), dom, sub);
}

export function pcFromName(name: string): number | null {
  const flat: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E" };
  const n = flat[name] ?? name;
  const i = PC_NAMES.indexOf(n);
  return i >= 0 ? i : null;
}

/** Line-of-fifths index for a pitch class, spelled near the key (so C# in D major, Db in Ab major). */
export function spell(pc: number, tonicK: number, mode: "major" | "minor"): number {
  const c = FIFTHS_INDEX[pc] ?? 0;
  const centre = mode === "major" ? tonicK + 2 : tonicK - 0.5;
  let best = c;
  for (const m of [-24, -12, 0, 12, 24]) if (Math.abs(c + m - centre) < Math.abs(best - centre)) best = c + m;
  return best;
}

export type SpiralBar = {
  bar: number;
  t_ms: number;
  diameter: number;
  momentum: number;
  strain: number;
  /** Pitch classes that counted as sounding. */
  pcs: string[];
};

export type SpiralTension = {
  label: "SOFT";
  method: string;
  key: string;
  bars: SpiralBar[];
  peak_strain_bar: number | null;
  peak_diameter_bar: number | null;
  max: { diameter: number; momentum: number; strain: number };
  note: string;
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function spiralTension(
  units: SonarUnit[],
  bars: SonarBar[],
  key: { tonic: string; mode: "major" | "minor" },
): SpiralTension | null {
  const tonicPc = pcFromName(key.tonic);
  if (tonicPc == null) return null;
  const tonicK = FIFTHS_INDEX[tonicPc] ?? 0;
  const home = keyCentre(tonicK, key.mode);
  const out: SpiralBar[] = [];
  let prev: V3 | null = null;
  for (const b of bars) {
    const w = new Array<number>(12).fill(0);
    let live = 0;
    for (let u = b.u0; u < b.u1; u++) {
      const x = units[u]!;
      if (x.silent) continue;
      live++;
      for (let p = 0; p < 12; p++) w[p] += (x.chroma[p] ?? 0) + SPIRAL_TUNING.wBass * (x.bass[p] ?? 0);
    }
    if (!live) continue;
    const mx = Math.max(...w);
    if (mx <= 0) continue;
    const pcs = w
      .map((v, p) => ({ v, p }))
      .filter((o) => o.v >= SPIRAL_TUNING.presentShare * mx)
      .sort((a, b2) => b2.v - a.v)
      .slice(0, SPIRAL_TUNING.maxPcs);
    const pts = pcs.map((o) => ({ pt: spiralPoint(spell(o.p, tonicK, key.mode)), v: o.v }));
    const tot = pts.reduce((a, o) => a + o.v, 0);
    let ce: V3 = [0, 0, 0];
    for (const o of pts) ce = add(ce, scale(o.pt, o.v / tot));
    let diameter = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) diameter = Math.max(diameter, dist(pts[i]!.pt, pts[j]!.pt));
    out.push({
      bar: b.index,
      t_ms: Math.round(b.t_start_ms),
      diameter: r3(diameter),
      momentum: r3(prev ? dist(ce, prev) : 0),
      strain: r3(dist(ce, home)),
      pcs: pcs.map((o) => PC_NAMES[o.p] ?? "?"),
    });
    prev = ce;
  }
  if (!out.length) return null;
  const max = {
    diameter: Math.max(...out.map((b) => b.diameter)),
    momentum: Math.max(...out.map((b) => b.momentum)),
    strain: Math.max(...out.map((b) => b.strain)),
  };
  const argmax = (f: (b: SpiralBar) => number) => out.reduce((bi, b) => (f(b) > f(bi) ? b : bi), out[0]!).bar;
  return {
    label: "SOFT",
    method: "Chew spiral array; Herremans & Chew tension ribbons (diameter, momentum, strain); native reimplementation",
    key: `${key.tonic} ${key.mode}`,
    bars: out,
    peak_strain_bar: argmax((b) => b.strain),
    peak_diameter_bar: argmax((b) => b.diameter),
    max: { diameter: r3(max.diameter), momentum: r3(max.momentum), strain: r3(max.strain) },
    note: "chroma-based (no octave or voicing); harmonic distance from the measured key, not a felt-tension score",
  };
}
