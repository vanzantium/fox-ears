import { midiToPc } from "@/lib/audio/pitch";

export const PC_NAMES: string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Circle-of-fifths index for a pitch class (C=0). */
export const FIFTHS_INDEX = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export type DegreeState = {
  delta: number;
  degree: string;
  /** Descriptive label from the chromatic table — INTERPRETED, not a measurement. */
  feeling: string;
  /** Mode-relative tension 1–10 (measurement). */
  tension: number;
  euler: number;
  hue: number;
  axis: "tonic" | "open" | "warm" | "minor" | "polar";
  /** True when this degree is stable in the given mode. */
  stable: boolean;
  mode: "major" | "minor";
};

/**
 * Chromatic template relative to a major tonic (reference table).
 * Tension values here are major-mode defaults; degreeOf() remaps for minor.
 * Feeling strings are interpretive labels — prefer citing tension/stable in digests.
 */
export const DEGREE_MAP: DegreeState[] = [
  { delta: 0, degree: "1", feeling: "home · rest · ground", tension: 1, euler: 1, hue: 42, axis: "tonic", stable: true, mode: "major" },
  { delta: 1, degree: "b2", feeling: "bitter · urgent · biting", tension: 9.5, euler: 11, hue: 8, axis: "polar", stable: false, mode: "major" },
  { delta: 2, degree: "2", feeling: "crystalline · calm · open", tension: 3, euler: 8, hue: 195, axis: "open", stable: true, mode: "major" },
  { delta: 3, degree: "b3", feeling: "solemn · archetypal minor", tension: 6.5, euler: 10, hue: 252, axis: "minor", stable: false, mode: "major" },
  { delta: 4, degree: "3", feeling: "warmth · sweetness · life", tension: 2, euler: 7, hue: 32, axis: "warm", stable: true, mode: "major" },
  { delta: 5, degree: "4", feeling: "contractive · square · inward", tension: 4, euler: 5, hue: 22, axis: "open", stable: true, mode: "major" },
  { delta: 6, degree: "#4", feeling: "alien · electric · polar void", tension: 10, euler: 14, hue: 88, axis: "polar", stable: false, mode: "major" },
  { delta: 7, degree: "5", feeling: "open · consonant · expansive", tension: 1.5, euler: 4, hue: 186, axis: "open", stable: true, mode: "major" },
  { delta: 8, degree: "b6", feeling: "tragic · heavy · bleak", tension: 8.5, euler: 12, hue: 272, axis: "minor", stable: false, mode: "major" },
  { delta: 9, degree: "6", feeling: "pastel · delicate · sweet", tension: 3.5, euler: 8, hue: 328, axis: "warm", stable: true, mode: "major" },
  { delta: 10, degree: "b7", feeling: "grounded minor · groove", tension: 5, euler: 9, hue: 158, axis: "minor", stable: false, mode: "major" },
  { delta: 11, degree: "7", feeling: "bittersweet · strained light", tension: 7.5, euler: 9, hue: 286, axis: "warm", stable: false, mode: "major" },
];

/** Diatonic / stable pitch-class deltas for a mode (from tonic). */
export function stableDeltas(mode: "major" | "minor"): Set<number> {
  if (mode === "minor") return new Set([0, 2, 3, 5, 7, 8, 10]); // natural minor
  return new Set([0, 2, 4, 5, 7, 9, 11]);
}

/**
 * Mode-relative tension. In minor, ♭3 is home-adjacent (not 6.5);
 * natural 3 is the outsider.
 */
export function tensionForMode(delta: number, mode: "major" | "minor"): number {
  const d = ((delta % 12) + 12) % 12;
  const base = DEGREE_MAP[d]?.tension ?? 5;
  if (mode === "minor") {
    if (d === 3) return 1.8; // ♭3 stable third
    if (d === 8) return 3.2; // ♭6 structural color, not polar
    if (d === 10) return 3.5; // ♭7 diatonic
    if (d === 4) return 7.2; // natural 3 against minor tonic
    if (d === 9) return 5.5; // natural 6 less "pastel" in minor
    if (d === 11) return 6.5; // leading tone still pulls
  } else {
    if (d === 3) return 6.8; // ♭3 outsider in major
    if (d === 8) return 8.0;
    if (d === 10) return 5.5;
  }
  return base;
}

function feelingForMode(delta: number, mode: "major" | "minor"): string {
  const d = ((delta % 12) + 12) % 12;
  if (mode === "minor") {
    if (d === 3) return "stable minor third · home-adjacent";
    if (d === 4) return "bright outsider · major third against minor";
    if (d === 8) return "dark diatonic sixth · color, not crisis";
    if (d === 10) return "flat seventh · open minor plate";
  }
  return DEGREE_MAP[d]?.feeling ?? "?";
}

export function wrapPc(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

/**
 * Scale-degree reading vs tonic. Mode is required for correct tension;
 * defaults to major only for backward-compatible call sites.
 */
export function degreeOf(
  pc: number,
  tonic: number,
  mode: "major" | "minor" = "major",
): DegreeState {
  const delta = wrapPc(pc - tonic);
  const base = DEGREE_MAP[delta] ?? DEGREE_MAP[0]!;
  const stable = stableDeltas(mode).has(delta);
  return {
    ...base,
    tension: tensionForMode(delta, mode),
    feeling: feelingForMode(delta, mode),
    stable,
    mode,
  };
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i] ?? 0;
    mb += b[i] ?? 0;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = (a[i] ?? 0) - ma;
    const xb = (b[i] ?? 0) - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const d = Math.sqrt(da * db);
  return d < 1e-12 ? 0 : num / d;
}

export function estimateTonic(chroma: number[]): {
  pc: number;
  name: string;
  mode: "major" | "minor";
  corr: number;
} | null {
  const mag = chroma.reduce((s, v) => s + v, 0);
  if (mag < 0.2) return null;
  let best = { pc: 0, mode: "major" as "major" | "minor", corr: -1 };
  for (let t = 0; t < 12; t++) {
    const shifted = chroma.map((_, i) => chroma[(i + t) % 12] ?? 0);
    const rMaj = pearson(shifted, MAJOR_PROFILE);
    const rMin = pearson(shifted, MINOR_PROFILE);
    if (rMaj > best.corr) best = { pc: t, mode: "major", corr: rMaj };
    if (rMin > best.corr) best = { pc: t, mode: "minor", corr: rMin };
  }
  if (best.corr < 0.12) return null;
  return { ...best, name: PC_NAMES[best.pc] ?? "C" };
}

export type RomanChord = {
  roman: string;
  root_degree: string;
  bass_degree: string;
  inverted: boolean;
  feeling: string;
  tension: number;
};

export function romanize(
  rootPc: number,
  bassPc: number,
  quality: string,
  tonic: number,
  mode: "major" | "minor",
): RomanChord {
  const rootDeg = wrapPc(rootPc - tonic);
  const bassDeg = wrapPc(bassPc - tonic);
  const root = degreeOf(rootPc, tonic, mode);
  const bass = degreeOf(bassPc, tonic, mode);
  const inverted = wrapPc(rootPc) !== wrapPc(bassPc);
  let numeral = numeralFor(rootDeg, quality, mode);
  if (quality === "7") numeral = `${numeral.replace(/°$/, "")}7`;
  else if (quality === "m7") numeral = `${numeral.toLowerCase().replace("°", "")}7`;
  else if (quality === "maj7") numeral = `${numeral}Δ`;
  else if (quality === "sus4") numeral = `${numeral}sus4`;
  else if (quality === "sus2") numeral = `${numeral}sus2`;
  else if (quality === "dim") numeral = numeral.includes("°") ? numeral : `${numeral}°`;
  if (inverted) {
    const third = wrapPc(rootPc + (quality.includes("m") || quality === "dim" ? 3 : 4));
    const fifth = wrapPc(rootPc + (quality === "dim" ? 6 : 7));
    if (wrapPc(bassPc) === third) numeral = `${numeral}6`;
    else if (wrapPc(bassPc) === fifth) numeral = `${numeral}64`;
    else numeral = `${numeral}/${bass.degree}`;
  }
  const tension = Math.min(
    10,
    root.tension * 0.65 + (inverted ? 0.8 : 0) + (quality === "7" ? 0.7 : 0),
  );
  return {
    roman: numeral,
    root_degree: root.degree,
    bass_degree: bass.degree,
    inverted,
    feeling: inverted ? `${root.feeling} over ${bass.degree}` : root.feeling,
    tension: Math.round(tension * 10) / 10,
  };
}

function numeralFor(delta: number, quality: string, mode: "major" | "minor"): string {
  const maj: Record<number, string> = {
    0: "I",
    2: "ii",
    4: "iii",
    5: "IV",
    7: "V",
    9: "vi",
    11: "vii°",
  };
  const min: Record<number, string> = {
    0: "i",
    2: "ii°",
    3: "III",
    5: "iv",
    7: "v",
    8: "VI",
    10: "VII",
  };
  const table = mode === "major" ? maj : min;
  if (table[delta]) {
    const n = table[delta]!;
    if (quality === "min" || quality === "m7") return n.toLowerCase().replace("°", "°");
    if (quality === "maj" || quality === "7" || quality === "maj7") {
      if (mode === "minor" && (delta === 0 || delta === 5 || delta === 7)) {
        return n.toUpperCase().replace("°", "");
      }
    }
    return n;
  }
  return `${DEGREE_MAP[delta]?.degree ?? "?"}${quality === "min" ? "-" : ""}`;
}

export type LiveFunction = {
  tonic: string;
  mode: "major" | "minor";
  corr: number;
  melody: DegreeState | null;
  bass: DegreeState | null;
  tension: number;
  /** Signed change vs previous snapshot. */
  tension_delta: number;
  time_since_tonic_ms: number | null;
  resolving: boolean;
};

export class TonicTracker {
  acc = new Array<number>(12).fill(0);
  pc = 0;
  mode: "major" | "minor" = "major";
  corr = 0;
  ready = false;
  private lastTension = 0;
  private lastTonicAt: number | null = null;
  private peakTension = 0;
  private peakAt = 0;
  private lastT = 0;

  reset() {
    this.acc = new Array<number>(12).fill(0);
    this.pc = 0;
    this.mode = "major";
    this.corr = 0;
    this.ready = false;
    this.lastTension = 0;
    this.lastTonicAt = null;
    this.peakTension = 0;
    this.peakAt = 0;
    this.lastT = 0;
  }

  push(chroma: number[], weight: number, t_ms = 0) {
    if (!chroma.length) return;
    const w = Math.max(0.02, weight);
    for (let i = 0; i < 12; i++) this.acc[i] = (this.acc[i] ?? 0) * 0.988 + (chroma[i] ?? 0) * w;
    const est = estimateTonic(this.acc);
    if (!est) return;
    if (!this.ready || est.pc === this.pc || est.corr > this.corr + 0.08) {
      this.pc = est.pc;
      this.mode = est.mode;
      this.corr = est.corr;
      this.ready = true;
    } else {
      this.corr = this.corr * 0.9 + est.corr * 0.1;
    }
    this.lastT = t_ms;
  }

  ofPc(pc: number | null): DegreeState | null {
    if (pc === null || !this.ready) return null;
    return degreeOf(pc, this.pc, this.mode);
  }

  snapshot(melodyPc: number | null, bassPc: number | null, t_ms = this.lastT): LiveFunction | null {
    if (!this.ready) return null;
    const melody = this.ofPc(melodyPc);
    const bass = this.ofPc(bassPc);
    const tension = Math.max(melody?.tension ?? 0, bass?.tension ?? 0);
    const tension_delta = Math.round((tension - this.lastTension) * 10) / 10;

    if (melody?.degree === "1" || bass?.degree === "1") {
      this.lastTonicAt = t_ms;
    }
    if (tension >= this.peakTension) {
      this.peakTension = tension;
      this.peakAt = t_ms;
    }
    const resolving =
      (melody?.stable || bass?.stable || false) &&
      this.peakTension - tension >= 1.5 &&
      t_ms - this.peakAt < 2000;
    if (resolving || t_ms - this.peakAt > 3000) {
      this.peakTension = tension;
      this.peakAt = t_ms;
    }

    this.lastTension = tension;
    return {
      tonic: PC_NAMES[this.pc] ?? "C",
      mode: this.mode,
      corr: this.corr,
      melody,
      bass,
      tension,
      tension_delta,
      time_since_tonic_ms: this.lastTonicAt == null ? null : Math.max(0, t_ms - this.lastTonicAt),
      resolving,
    };
  }
}

export const liveTracker = new TonicTracker();
