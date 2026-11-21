/**
 * Concert-pitch pre-pass. Estimate cents off A440 from voiced pitch_hz,
 * optionally rotate chroma / remap note names, and report A4 Hz.
 * The estimate is labeled SOFT until a second method or an answer key
 * backs it. A shift is only applied when the offset is clearly off, so
 * songs already at A440 keep their chroma bins.
 */
import { hzToMidi, midiToName } from "@/lib/audio/pitch";
import type { HearingFrame } from "./types";

export const TUNING = {
  a4RefHz: 440,
  /** Apply a correction only when |cents| clears this and the cluster is tight. */
  applyMinAbsCents: 12,
  minVoiced: 24,
  minConfidence: 0.35,
  minPitchConfidence: 0.22,
} as const;

export type TuningEstimate = {
  cents_vs_440: number | null;
  a4_hz: number | null;
  confidence: number;
  n_voiced: number;
  applied: boolean;
  label: "SOFT";
  note: string;
};

/** Residual of a frequency versus the nearest A440 semitone, in cents. */
export function centsOffA440(hz: number, a4Hz = TUNING.a4RefHz): number {
  const midi = 69 + 12 * Math.log2(hz / a4Hz);
  return (midi - Math.round(midi)) * 100;
}

function circularMeanCents(cents: number[]): number {
  // 100 cents = one semitone = one wrap.
  let s = 0;
  let c = 0;
  for (const x of cents) {
    const a = (x / 100) * 2 * Math.PI;
    s += Math.sin(a);
    c += Math.cos(a);
  }
  const n = Math.max(1, cents.length);
  return (Math.atan2(s / n, c / n) / (2 * Math.PI)) * 100;
}

function circularConfidence(cents: number[], mean: number): number {
  let s = 0;
  let c = 0;
  for (const x of cents) {
    const a = (x / 100) * 2 * Math.PI;
    s += Math.sin(a);
    c += Math.cos(a);
  }
  const n = Math.max(1, cents.length);
  const r = Math.hypot(s / n, c / n);
  // Penalise a tiny sample a little.
  return Math.max(0, Math.min(1, r * Math.min(1, n / 40)));
}

function circDistCents(a: number, b: number): number {
  let d = Math.abs(a - b) % 100;
  if (d > 50) d = 100 - d;
  return d;
}

function histogramPeakCents(cents: number[], weights?: number[], bin = 2): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < cents.length; i++) {
    const b = Math.round(cents[i]! / bin) * bin;
    counts.set(b, (counts.get(b) ?? 0) + (weights?.[i] ?? 1));
  }
  let best = 0;
  let n = -Infinity;
  for (const [b, c] of counts) {
    if (c > n || (c === n && Math.abs(b) < Math.abs(best))) {
      best = b;
      n = c;
    }
  }
  return best;
}

/** Smoothed circular mode, so a 20-cent-wide cluster still has a clear centre. */
function kdeModeCents(cents: number[], weights?: number[], bandwidth = 8, step = 1): number {
  let best = 0;
  let bestS = -Infinity;
  for (let x = -50; x <= 50; x += step) {
    let s = 0;
    for (let i = 0; i < cents.length; i++) {
      const d = circDistCents(cents[i]!, x);
      s += (weights?.[i] ?? 1) * Math.exp(-0.5 * (d / bandwidth) * (d / bandwidth));
    }
    if (s > bestS) {
      bestS = s;
      best = x;
    }
  }
  return best;
}

export function estimateTuningFromFrames(frames: HearingFrame[]): TuningEstimate {
  const cents: number[] = [];
  const weights: number[] = [];
  for (const f of frames) {
    if (f.pitch_hz == null || !(f.pitch_hz > 0)) continue;
    if ((f.pitch_confidence ?? 0) < TUNING.minPitchConfidence) continue;
    const c = centsOffA440(f.pitch_hz);
    if (!Number.isFinite(c)) continue;
    cents.push(c);
    weights.push(Math.max(0.05, f.pitch_confidence ?? 0.22));
  }
  const n = cents.length;
  if (n < 8) {
    return {
      cents_vs_440: null,
      a4_hz: null,
      confidence: 0,
      n_voiced: n,
      applied: false,
      label: "SOFT",
      note: `tuning pre-pass: only ${n} voiced frames; A4 left at 440 Hz (SOFT)`,
    };
  }
  // When enough high-confidence frames exist, use that subset: mid-confidence
  // residuals pull the mode sharp of a clearly flat (or sharp) cluster.
  let usedCents = cents;
  let usedWeights = weights;
  const highIdx = cents
    .map((_, i) => i)
    .filter((i) => (weights[i] ?? 0) >= 0.8);
  if (highIdx.length >= 80) {
    usedCents = highIdx.map((i) => cents[i]!);
    usedWeights = highIdx.map((i) => weights[i]!);
  }
  // A large high-confidence subset can use a narrower KDE and a tighter trim
  // so a secondary bump 10–20 ¢ away does not pull the mode (SOFT).
  const bandwidth = highIdx.length >= 80 ? 5 : 8;
  const kdeStep = highIdx.length >= 80 ? 0.5 : 1;
  const trimWidth = highIdx.length >= 80 ? 12 : 18;
  const mode = kdeModeCents(usedCents, usedWeights, bandwidth, kdeStep);
  // Trim octave/semitone errors around the mode so a tight cluster is not
  // drowned by wild residuals; those outliers are what kept R ≈ 0.16 on A432 material.
  const trimmed: number[] = [];
  const tWeights: number[] = [];
  for (let i = 0; i < usedCents.length; i++) {
    if (circDistCents(usedCents[i]!, mode) <= trimWidth) {
      trimmed.push(usedCents[i]!);
      tWeights.push(usedWeights[i]!);
    }
  }
  const pool = trimmed.length >= 8 ? trimmed : usedCents;
  const poolW = trimmed.length >= 8 ? tWeights : usedWeights;
  const mean = circularMeanCents(pool);
  const conf = circularConfidence(pool, mean);
  const disagree = circDistCents(mean, mode);
  const confidence = round3(disagree > 8 ? conf * 0.7 : conf);
  const centsOut = round2(mean);
  const a4 = TUNING.a4RefHz * 2 ** (centsOut / 1200);
  const applied =
    n >= TUNING.minVoiced &&
    confidence >= TUNING.minConfidence &&
    Math.abs(centsOut) >= TUNING.applyMinAbsCents;
  const note = applied
    ? `tuning pre-pass: ${centsOut >= 0 ? "+" : ""}${centsOut} ¢ vs A440 (A4 ≈ ${a4.toFixed(1)} Hz) from ${n} voiced frames, conf ${confidence}; applied to chroma and note mapping (SOFT)`
    : `tuning pre-pass: ${centsOut >= 0 ? "+" : ""}${centsOut} ¢ vs A440 (A4 ≈ ${a4.toFixed(1)} Hz) from ${n} voiced frames, conf ${confidence}; not applied (SOFT)`;
  return {
    cents_vs_440: centsOut,
    a4_hz: Math.round(a4 * 10) / 10,
    confidence,
    n_voiced: n,
    applied,
    label: "SOFT",
    note,
  };
}

/** Rotate a 12-bin chroma vector by `shiftBins` (positive = toward sharper pitch classes). */
export function rotateChroma(chroma: number[], shiftBins: number): number[] {
  if (!chroma.length) return chroma.slice();
  const n = chroma.length;
  if (Math.abs(shiftBins) < 1e-9) return chroma.slice();
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    // Energy currently at bin (i - shift) moves to i.
    const src = ((i - shiftBins) % n + n) % n;
    const i0 = Math.floor(src);
    const i1 = (i0 + 1) % n;
    const f = src - i0;
    out[i] = (chroma[i0] ?? 0) * (1 - f) + (chroma[i1] ?? 0) * f;
  }
  return out;
}

export function applyTuningToFrames(frames: HearingFrame[], est: TuningEstimate): HearingFrame[] {
  if (!est.applied || est.cents_vs_440 == null || est.a4_hz == null) return frames;
  const a4 = est.a4_hz;
  const shiftBins = -est.cents_vs_440 / 100;
  return frames.map((f) => {
    const midi = f.pitch_hz != null && f.pitch_hz > 0 ? hzToMidi(f.pitch_hz, a4) : f.midi;
    return {
      ...f,
      midi: midi ?? null,
      note: midi != null ? midiToName(midi) : f.note,
      chroma: rotateChroma(f.chroma, shiftBins),
      bass_chroma: rotateChroma(f.bass_chroma, shiftBins),
    };
  });
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
