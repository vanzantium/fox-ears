/**
 * Vocal presence features (tuning pass 1, 2026-11-14).
 *
 * Why the old gate never opened on "Fox at the Gate" (a clear male lead):
 *  1. It asked the mix pitch tracker for a 185-560 Hz F0. On a full mix that
 *     tracker locks onto bass and guitar (its most common answer on the master
 *     was 80-100 Hz), and a male lead sits mostly below 185 Hz anyway.
 *  2. It closed whenever the HPSS percussive share passed 0.42-0.48. Sung
 *     consonants plus a kick and snare put the median vocal frame at 0.45.
 *  3. One global threshold, so there was no way to loosen one cue without
 *     opening the gate on guitars.
 *
 * The replacement uses three per-band cues measured on mid (L+R) and side (L-R):
 *  - centre: side/mid energy ratio in 300-3000 Hz. Lead vocals are mixed
 *    centre; on the master vocal frames sit near -11 dB, instrumental frames
 *    near -5 dB.
 *  - presence: mid energy in 300-3000 Hz relative to the song's loud level.
 *  - harmonic peaks: at least 4 prominent spectral peaks in 300-3000 Hz (8 on a
 *    mono source, where the centre cue is blind), so a lone sine
 *    or narrowband tone (the demo etude) cannot pass as a voice.
 * Each cue has its own threshold (VOCAL_TUNING), instead of one sensitivity.
 */

export const VOCAL_TUNING = {
  bandLoHz: 300,
  bandHiHz: 3000,
  /** Side/mid ratio in the vocal band must be below this (dB): centred. */
  centreDb: -7,
  /** Mid vocal-band energy must be within this many dB of the loud level (p95). */
  presenceDb: -14,
  /** Minimum spectral peaks in the vocal band (harmonic series, not a lone tone). */
  minPeaks: 4,
  /**
   * Side below this (dB re mid) means the source is mono (or a mic), so the
   * centre cue carries no information. Then the gate leans on the harmonic
   * cue instead and asks for more peaks.
   */
  monoSideDb: -35,
  minPeaksMono: 8,
  /** Peaks are counted if within this many dB of the band maximum... */
  peakFloorDb: 24,
  /** ...and at least this many dB above the bins two either side (prominence). */
  peakProminenceDb: 6,
  /** Chart smoothing: median window and minimum run, in 80 ms frames. */
  medianFrames: 7,
  minRunFrames: 6,
  /** Live gate: release of the loud-level follower, per second (dB). */
  liveReleaseDbPerS: 1.5,
} as const;

export type VocalFeatures = {
  /** 10·log10(side/mid) energy in the vocal band. Lower = more centred. */
  sideDb: number;
  /** 10·log10 of mid energy in the vocal band (gain-dependent; compare within a song). */
  midDb: number;
  /** Spectral peaks in the vocal band within peakFloorDb of the band max. */
  peaks: number;
};

let cache: { n: number; rev: Uint32Array; cos: Float64Array; sin: Float64Array; win: Float64Array } | null = null;

function plan(n: number) {
  if (cache && cache.n === n) return cache;
  const bits = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
  }
  cache = { n, rev, cos, sin, win };
  return cache;
}

function powerSpectrum(x: Float64Array): Float64Array {
  const n = x.length;
  const p = plan(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[p.rev[i] ?? 0] = (x[i] ?? 0) * (p.win[i] ?? 0);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let s = 0; s < n; s += size) {
      for (let j = 0; j < half; j++) {
        const k = j * step;
        const wr = p.cos[k] ?? 1;
        const wi = p.sin[k] ?? 0;
        const a = s + j;
        const b = a + half;
        const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
  return out;
}

/** Mid/side vocal-band features from one stereo analyser buffer. */
export function vocalFeatures(left: Float32Array, right: Float32Array, sampleRate: number): VocalFeatures {
  let n = 1;
  while (n * 2 <= Math.min(left.length, right.length)) n *= 2;
  const mid = new Float64Array(n);
  const side = new Float64Array(n);
  const off = Math.min(left.length, right.length) - n;
  for (let i = 0; i < n; i++) {
    const l = left[off + i] ?? 0;
    const r = right[off + i] ?? 0;
    mid[i] = (l + r) * 0.5;
    side[i] = (l - r) * 0.5;
  }
  const pm = powerSpectrum(mid);
  const ps = powerSpectrum(side);
  const binHz = sampleRate / n;
  const lo = Math.max(1, Math.floor(VOCAL_TUNING.bandLoHz / binHz));
  const hi = Math.min(pm.length - 2, Math.ceil(VOCAL_TUNING.bandHiHz / binHz));
  let em = 0;
  let es = 0;
  let peakMax = 0;
  for (let k = lo; k <= hi; k++) {
    em += pm[k] ?? 0;
    es += ps[k] ?? 0;
    peakMax = Math.max(peakMax, pm[k] ?? 0);
  }
  const floor = peakMax * 10 ** (-VOCAL_TUNING.peakFloorDb / 10);
  let peaks = 0;
  const prom = 10 ** (VOCAL_TUNING.peakProminenceDb / 10);
  for (let k = lo + 2; k < hi - 1; k++) {
    const v = pm[k] ?? 0;
    if (v <= floor || v <= (pm[k - 1] ?? 0) || v < (pm[k + 1] ?? 0)) continue;
    if (v > prom * Math.max(pm[k - 2] ?? 0, 1e-30) && v > prom * Math.max(pm[k + 2] ?? 0, 1e-30)) peaks++;
  }
  return {
    sideDb: 10 * Math.log10((es + 1e-12) / (em + 1e-12)),
    midDb: 10 * Math.log10(em + 1e-12),
    peaks,
  };
}

/** Per-cue gate decision given the song's (or the follower's) loud level. */
export function vocalCuesPass(f: VocalFeatures, loudDb: number): boolean {
  const mono = f.sideDb < VOCAL_TUNING.monoSideDb;
  return (
    (mono || f.sideDb < VOCAL_TUNING.centreDb) &&
    f.midDb > loudDb + VOCAL_TUNING.presenceDb &&
    f.peaks >= (mono ? VOCAL_TUNING.minPeaksMono : VOCAL_TUNING.minPeaks)
  );
}

/** 0..1 soft score from the same cues (for vocal_likelihood and painting). */
export function vocalScore(f: VocalFeatures, loudDb: number): number {
  const sig = (x: number) => 1 / (1 + Math.exp(-x));
  const mono = f.sideDb < VOCAL_TUNING.monoSideDb;
  const centre = mono ? 0.75 : sig((VOCAL_TUNING.centreDb - f.sideDb) / 1.5);
  const presence = sig((f.midDb - (loudDb + VOCAL_TUNING.presenceDb)) / 2.5);
  const harmonic = f.peaks >= (mono ? VOCAL_TUNING.minPeaksMono : VOCAL_TUNING.minPeaks) ? 1 : 0.2;
  return Math.max(0, Math.min(1, centre * presence * harmonic));
}

/**
 * Causal loud-level follower for the live gate: jumps up to new peaks and
 * releases slowly, approximating the song's p95 vocal-band level.
 */
export class LoudFollower {
  level = -Infinity;
  private lastMs: number | null = null;
  push(midDb: number, tMs: number): number {
    const dt = this.lastMs === null ? 0 : Math.max(0, tMs - this.lastMs) / 1000;
    this.lastMs = tMs;
    this.level = Math.max(midDb, this.level - VOCAL_TUNING.liveReleaseDbPerS * dt);
    return this.level;
  }
  reset() {
    this.level = -Infinity;
    this.lastMs = null;
  }
}

/** Whole-song vocal mask for the chart: song p95, median smoothing, min run. */
export function vocalMask(feats: Array<VocalFeatures | null>): boolean[] {
  const mids = feats.filter((f): f is VocalFeatures => f !== null).map((f) => f.midDb).sort((a, b) => a - b);
  if (!mids.length) return feats.map(() => false);
  const loud = mids[Math.floor(0.95 * (mids.length - 1))] ?? 0;
  const w = VOCAL_TUNING.medianFrames;
  const h = Math.floor(w / 2);
  const med = (arr: number[], i: number) => {
    const s = arr.slice(Math.max(0, i - h), Math.min(arr.length, i + h + 1)).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const side = feats.map((f) => (f ? f.sideDb : 0));
  const mid = feats.map((f) => (f ? f.midDb : -120));
  const pk = feats.map((f) => (f ? f.peaks : 0));
  const raw = feats.map((f, i) =>
    f === null
      ? false
      : vocalCuesPass({ sideDb: med(side, i), midDb: med(mid, i), peaks: med(pk, i) }, loud),
  );
  const out = raw.slice();
  for (let i = 0; i < raw.length; ) {
    if (!raw[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j]) j++;
    if (j - i < VOCAL_TUNING.minRunFrames) for (let k = i; k < j; k++) out[k] = false;
    i = j;
  }
  return out;
}
