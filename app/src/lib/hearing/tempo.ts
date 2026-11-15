/**
 * Tempo estimation for Fox Ears — the "pulse" ear.
 *
 * Self-contained (zero imports) so it runs under Node type-stripping for
 * deterministic lab tests without the bundler: `runTempoLab()`.
 *
 * Two independent methods:
 *  1. IOI histogram — inter-onset intervals binned to 2-BPM resolution.
 *  2. Onset-envelope autocorrelation — finds the lag with max self-similarity.
 *
 * Agreement raises confidence; disagreement (or a single method) stays
 * honest: LOW confidence, and the note says so. This module never claims
 * more than the onsets support — "unresolved metrical level" is a result,
 * not a failure.
 */

export type TempoRole = "pulse" | "beat" | "subdivision";

export type TempoCandidate = {
  bpm: number;
  votes: number;
  role: TempoRole;
};

export type TempoEstimate = {
  bpm: number | null;
  confidence: number;
  candidates: TempoCandidate[];
  note: string;
} | null;

const MIN_BPM = 60;
const MAX_BPM = 200;
const BIN_BPM = 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toBpm(ms: number): number {
  return Math.round(60000 / ms / BIN_BPM) * BIN_BPM;
}

export function estimateTempo(onsetMs: number[]): TempoEstimate {
  if (onsetMs.length < 6) return null;

  const ioi: number[] = [];
  for (let i = 1; i < onsetMs.length; i++) {
    const d = (onsetMs[i] ?? 0) - (onsetMs[i - 1] ?? 0);
    if (d > 160 && d < 1400) ioi.push(d);
  }
  if (ioi.length < 4) return null;

  const bins = new Map<number, number>();
  for (const d of ioi) {
    const bpm = toBpm(d);
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
    bins.set(bpm, (bins.get(bpm) ?? 0) + 1);
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1] - a[1]);

  // Method 2 is independent of IOI binning: autocorrelation of the onset
  // envelope. It can rescue cases the histogram filters out (e.g. straight
  // 8th-note subdivisions whose 240 BPM IOIs are excluded).
  const acBpm = autocorrBpm(onsetMs);

  if (!ranked.length) {
    if (acBpm === null) return null;
    return {
      bpm: acBpm,
      confidence: 0.3,
      candidates: [{ bpm: acBpm, votes: 0, role: "pulse" }],
      note: "IOI histogram empty (subdivisions filtered); autocorrelation only — low confidence",
    };
  }

  const top = ranked[0] ?? [0, 0];
  const topBpm: number = top[0];
  const topN: number = top[1];

  const half = ranked.find(([b]) => Math.abs(b - topBpm / 2) <= 4);
  const dbl = ranked.find(([b]) => Math.abs(b - topBpm * 2) <= 6);
  const candidates: TempoCandidate[] = [{ bpm: topBpm, votes: topN, role: "pulse" }];
  if (half) candidates.push({ bpm: half[0], votes: half[1], role: "beat" });
  if (dbl) candidates.push({ bpm: dbl[0], votes: dbl[1], role: "subdivision" });

  const levels: number[] = [topBpm];
  if (half) levels.push(half[0]);
  if (dbl) levels.push(dbl[0]);
  const agreedBpm = acBpm === null ? undefined : levels.find((b) => Math.abs(acBpm - b) <= 4);

  const frac = topN / ioi.length;
  if (agreedBpm !== undefined) {
    return {
      bpm: agreedBpm,
      confidence: round2(Math.min(0.75, 0.35 + frac * 0.5)),
      candidates,
      note: `two-method agreement (IOI histogram + onset autocorrelation) at ${agreedBpm} BPM`,
    };
  }
  if (half || dbl) {
    const beat = half ? Math.min(topBpm, half[0]) : topBpm;
    return {
      bpm: beat,
      confidence: round2(Math.min(0.4, frac)),
      candidates,
      note:
        `unresolved metrical level — pulse candidates ${candidates.map((c) => c.bpm).join("/")} BPM` +
        (acBpm === null
          ? "; autocorrelation found no stable lag"
          : `; autocorrelation suggests ${acBpm} BPM (no agreement)`),
    };
  }
  return {
    bpm: topBpm,
    confidence: round2(Math.min(0.55, frac)),
    candidates,
    note: "single pulse peak; still low confidence on acoustic onsets",
  };
}

/**
 * Autocorrelation of a quantized onset envelope. Returns the BPM of the
 * strongest stable lag in the 60–200 BPM band, or null when nothing is
 * stable. Pure function of onset times — no thresholds, no binning bias.
 */
function autocorrBpm(onsetMs: number[]): number | null {
  const first = onsetMs[0] ?? 0;
  const last = onsetMs[onsetMs.length - 1] ?? 0;
  const span = last - first;
  if (span < 4000 || onsetMs.length < 8) return null;
  const q = 25; // ms per bin
  const n = Math.ceil(span / q) + 1;
  const env = new Float64Array(n);
  for (const t of onsetMs) {
    const i = Math.round((t - first) / q);
    if (i >= 0 && i < n) env[i] = (env[i] ?? 0) + 1;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i] ?? 0;
  mean /= n;
  // 60–200 BPM → 300–1000 ms lags.
  const lagMin = Math.ceil(300 / q);
  const lagMax = Math.floor(1000 / q);
  const cs: number[] = [];
  let bestLag = 0;
  let bestC = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) {
      c += ((env[i] ?? 0) - mean) * ((env[i + lag] ?? 0) - mean);
    }
    cs.push(c);
    if (c > bestC) {
      bestC = c;
      bestLag = lag;
    }
  }
  if (bestC <= 0 || bestLag === 0) return null;
  // Parabolic refinement around the peak for sub-bin resolution.
  const idx = bestLag - lagMin;
  const y0 = cs[idx - 1] ?? bestC;
  const y1 = bestC;
  const y2 = cs[idx + 1] ?? bestC;
  const denom = y0 - 2 * y1 + y2;
  const shift = denom === 0 ? 0 : (0.5 * (y0 - y2)) / denom;
  const lagMs = (bestLag + Math.max(-1, Math.min(1, shift))) * q;
  const bpm = toBpm(lagMs);
  return bpm < MIN_BPM || bpm > MAX_BPM ? null : bpm;
}

/**
 * Find the phase offset (ms into the beat) that best aligns a beat grid to
 * the observed onsets. Scans 32 candidate phases; scores each by Gaussian
 * proximity of onsets to grid lines (sigma 60 ms).
 */
export function alignBeatPhase(onsetMs: number[], bpm: number): number {
  if (!onsetMs.length || bpm < MIN_BPM || bpm > MAX_BPM) return 0;
  const beat = 60000 / bpm;
  const sigma = 60;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < 32; s++) {
    const phase = (s / 32) * beat;
    let score = 0;
    for (const t of onsetMs) {
      const rel = (((t - phase) % beat) + beat) % beat;
      const d = Math.min(rel, beat - rel);
      score += Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return Math.round(bestPhase);
}

/** Beat grid phase-aligned to the onsets (not nailed to t=0). */
export function beatGridAligned(lastMs: number, bpm: number, onsetMs: number[]): number[] {
  if (bpm < MIN_BPM || bpm > MAX_BPM || lastMs <= 0) return [];
  const step = 60000 / bpm;
  const phase = alignBeatPhase(onsetMs, bpm);
  const beats: number[] = [];
  for (let t = phase; t <= lastMs; t += step) beats.push(Math.round(t));
  return beats;
}

// ---------------------------------------------------------------------------
// Sub-grid tempo (tuning pass 1, 2026-11-14).
//
// The 80 ms hearing frames quantise onsets so coarsely that a steady 96 BPM
// song reads as 90 or 120. The engine now keeps every analyser tick's spectral
// flux (display rate, see HearingSampler.tick); since P0 (2026-11-15) the ticks
// carry AudioContext time and are resampled onto a fixed 10 ms grid
// (resampleTicks) before the chart peak-picks them here.
// ---------------------------------------------------------------------------

export type WeightedOnset = { t_ms: number; w: number };

/** Tuning constants for the sub-grid path. Exported so the tuning log and lab can cite them. */
export const SUBGRID = {
  /** Adaptive peak-pick: flux must exceed local mean + k·sd. */
  pickK: 1.0,
  /** Half-width of the local mean/sd window, ms. */
  pickWinMs: 1000,
  /** Refractory gap between picked onsets, ms. */
  minGapMs: 90,
  /** Onset-envelope resolution, ms. */
  envMs: 10,
  /** Search band for the beat level, BPM. */
  minBpm: 50,
  maxBpm: 220,
  /** Log-normal tempo prior: centre BPM and spread in octaves (librosa-style). */
  priorBpm: 110,
  priorOctaves: 1.0,
  /**
   * Minimum comb periodicity (normalised autocorrelation) to report a tempo.
   * Songs score 0.36-1.08; the beatless demo etude scores 0.03-0.04.
   */
  minComb: 0.15,
} as const;

/**
 * Adaptive peak-picking on a flux stream. The app feeds it the fixed 10 ms grid
 * from resampleTicks; windows are measured in ms so irregular input still works.
 */
export function pickTickOnsets(
  tickMs: number[],
  flux: number[],
  k: number = SUBGRID.pickK,
  winMs: number = SUBGRID.pickWinMs,
  minGapMs: number = SUBGRID.minGapMs,
): WeightedOnset[] {
  const n = Math.min(tickMs.length, flux.length);
  const out: WeightedOnset[] = [];
  if (n < 3) return out;
  const ps = new Float64Array(n + 1);
  const ps2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = flux[i] ?? 0;
    ps[i + 1] = (ps[i] ?? 0) + v;
    ps2[i + 1] = (ps2[i] ?? 0) + v * v;
  }
  let lo = 0;
  let hi = 0;
  let lastMs = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    const t = tickMs[i] ?? 0;
    while (lo < i && (tickMs[lo] ?? 0) < t - winMs) lo++;
    while (hi < n && (tickMs[hi] ?? 0) <= t + winMs) hi++;
    const v = flux[i] ?? 0;
    if (!(v > (flux[i - 1] ?? 0) && v >= (flux[i + 1] ?? 0))) continue;
    const cnt = Math.max(1, hi - lo);
    const m = ((ps[hi] ?? 0) - (ps[lo] ?? 0)) / cnt;
    const sd = Math.sqrt(Math.max(0, ((ps2[hi] ?? 0) - (ps2[lo] ?? 0)) / cnt - m * m));
    if (v > m + k * sd && t - lastMs > minGapMs) {
      out.push({ t_ms: t, w: v - m });
      lastMs = t;
    }
  }
  return out;
}

function lagScore(ac: Float64Array, lag: number): number {
  const i = Math.floor(lag);
  const f = lag - i;
  if (i + 1 >= ac.length) return 0;
  return (ac[i] ?? 0) * (1 - f) + (ac[i + 1] ?? 0) * f;
}

/** Comb score of a beat period: rewards energy at 1, 2, 3 and 4 periods. */
function combScore(ac: Float64Array, lagBins: number): number {
  let s = 0;
  const wts = [1, 0.5, 0.33, 0.25];
  for (let h = 1; h <= 4; h++) s += (wts[h - 1] ?? 0) * lagScore(ac, lagBins * h);
  return s;
}

function tempoPrior(bpm: number): number {
  const z = Math.log2(bpm / SUBGRID.priorBpm) / SUBGRID.priorOctaves;
  return Math.exp(-0.5 * z * z);
}

/** Phase-searched alignment of weighted onsets to a beat grid (sigma ms). */
function gridFit(onsets: WeightedOnset[], bpm: number, sigma: number): { score: number; phase: number } {
  const beat = 60000 / bpm;
  let best = { score: -Infinity, phase: 0 };
  const steps = 48;
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * beat;
    let score = 0;
    for (const o of onsets) {
      const rel = (((o.t_ms - phase) % beat) + beat) % beat;
      const d = Math.min(rel, beat - rel);
      score += o.w * Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    if (score > best.score) best = { score, phase };
  }
  return best;
}

/**
 * Tempo from sub-grid weighted onsets.
 * 1. Weighted onset envelope at 10 ms, autocorrelated.
 * 2. Comb score (1-4 periods) x log-normal prior picks the beat level; this is
 *    the octave / half-time disambiguation (96 beats 48 and 192 because the
 *    comb rewards a period whose multiples also line up, and the prior breaks
 *    near-ties toward the usual 70-160 BPM beat range).
 * 3. Parabolic refinement, then a fine grid-fit (+/-2.5%, 0.02 BPM steps).
 * Confidence = comb salience of the winner over the runner-up metrical level.
 */
export function estimateTempoSubgrid(onsets: WeightedOnset[]): TempoEstimate {
  if (onsets.length < 8) return null;
  const first = onsets[0]?.t_ms ?? 0;
  const last = onsets[onsets.length - 1]?.t_ms ?? 0;
  const span = last - first;
  if (span < 6000) return null;
  const q = SUBGRID.envMs;
  const n = Math.ceil(span / q) + 2;
  const env = new Float64Array(n);
  for (const o of onsets) {
    const x = (o.t_ms - first) / q;
    const i = Math.floor(x);
    const f = x - i;
    env[i] = (env[i] ?? 0) + o.w * (1 - f);
    if (i + 1 < n) env[i + 1] = (env[i + 1] ?? 0) + o.w * f;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i] ?? 0;
  mean /= n;
  for (let i = 0; i < n; i++) env[i] = (env[i] ?? 0) - mean;
  const maxLag = Math.min(n - 1, Math.ceil((4 * 60000) / SUBGRID.minBpm / q) + 2);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) c += (env[i] ?? 0) * (env[i + lag] ?? 0);
    ac[lag] = c / (n - lag);
  }
  const ac0 = ac[0] ?? 0;
  if (ac0 <= 0) return null;
  for (let lag = 0; lag <= maxLag; lag++) ac[lag] = Math.max(0, (ac[lag] ?? 0) / ac0);

  // Score every candidate beat level at 0.25 BPM.
  type Cand = { bpm: number; comb: number; score: number };
  const cands: Cand[] = [];
  for (let bpm = SUBGRID.minBpm; bpm <= SUBGRID.maxBpm; bpm += 0.25) {
    const comb = combScore(ac, 60000 / bpm / q);
    cands.push({ bpm, comb, score: comb * tempoPrior(bpm) });
  }
  let bi = 0;
  for (let i = 1; i < cands.length; i++) if ((cands[i]?.score ?? 0) > (cands[bi]?.score ?? 0)) bi = i;
  const top = cands[bi];
  if (!top || top.comb < SUBGRID.minComb) return null;

  // Parabolic refinement on the score curve.
  const y0 = cands[bi - 1]?.score ?? top.score;
  const y2 = cands[bi + 1]?.score ?? top.score;
  const den = y0 - 2 * top.score + y2;
  const shift = den === 0 ? 0 : Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / den));
  const coarse = top.bpm + shift * 0.25;

  // Fine grid fit around the winner.
  let bpm = coarse;
  let bestFit = gridFit(onsets, coarse, 30);
  for (let b = coarse * 0.975; b <= coarse * 1.025; b += 0.02) {
    const fit = gridFit(onsets, b, 30);
    if (fit.score > bestFit.score) {
      bestFit = fit;
      bpm = b;
    }
  }

  // Related metrical levels, for honesty in the note and the confidence.
  const levelOf = (b: number): Cand | undefined => {
    if (b < SUBGRID.minBpm || b > SUBGRID.maxBpm) return undefined;
    return cands[Math.round((b - SUBGRID.minBpm) / 0.25)];
  };
  const related = [0.5, 2, 2 / 3, 1.5]
    .map((k) => ({ k, c: levelOf(top.bpm * k) }))
    .filter((x): x is { k: number; c: Cand } => Boolean(x.c));
  const rival = related.reduce((m, x) => Math.max(m, x.c.score), 0);
  const salience = top.score > 0 ? 1 - rival / top.score : 0;
  const confidence = round2(Math.max(0.05, Math.min(0.9, 0.3 + 0.9 * salience * Math.min(1, top.comb))));
  const bpmOut = Math.round(bpm * 10) / 10;
  const candidates: TempoCandidate[] = [
    { bpm: bpmOut, votes: Math.round(top.comb * 100), role: "beat" },
    ...related.map((x) => ({
      bpm: Math.round(x.c.bpm * 10) / 10,
      votes: Math.round(x.c.comb * 100),
      role: (x.k > 1 ? "subdivision" : "pulse") as TempoRole,
    })),
  ];
  return {
    bpm: bpmOut,
    confidence,
    candidates,
    note:
      `sub-grid onsets (${onsets.length}); comb x prior picked ${bpmOut} BPM` +
      (rival > 0
        ? `; nearest rival level ${related.find((x) => x.c.score === rival)?.c.bpm ?? "?"} BPM at ${Math.round((rival / top.score) * 100)}%`
        : ""),
  };
}

// ---------------------------------------------------------------------------
// Display-independent timing (P0, 2026-11-15).
//
// Analyser ticks arrive whenever requestAnimationFrame fires: 60, 90 or 120 Hz
// depending on the display, irregular under load, and not at all while the tab
// is in the background. The engine now timestamps each tick with
// AudioContext.currentTime (mapped onto the file timeline), and the tempo path
// resamples those ticks onto a fixed 10 ms analysis grid before onset picking.
// The offline harness goes through the same function (score.ts chartTempo).
// ---------------------------------------------------------------------------

export const TIMING = {
  /** Fixed analysis grid, ms. */
  gridMs: 10,
  /** A gap between ticks longer than this is missing data (backgrounded tab, stall), not a slow tick. */
  maxGapMs: 120,
} as const;

export type GridSeries = {
  t_ms: number[];
  /** Flux per grid step (tick flux divided by its tick interval, times gridMs). */
  flux: number[];
  /** Missing-data spans [from, to] ms where ticks stopped. */
  gaps: Array<[number, number]>;
  ticks: number;
  medianTickMs: number;
};

/**
 * Resample irregular analyser ticks onto a fixed grid.
 * - Each tick's flux is the spectral change since the previous tick, so it is
 *   divided by that tick's interval (flux per ms) before interpolation; a 120 Hz
 *   display then gives the same scale as a 60 Hz one.
 * - Linear interpolation inside runs of ticks; nothing is invented across a gap
 *   longer than maxGapMs, and the first tick after a gap is dropped, because its
 *   flux spans the whole gap and would read as a fake onset.
 */
export function resampleTicks(
  tickMs: number[],
  flux: number[],
  gridMs: number = TIMING.gridMs,
  maxGapMs: number = TIMING.maxGapMs,
): GridSeries {
  const n = Math.min(tickMs.length, flux.length);
  const out: GridSeries = { t_ms: [], flux: [], gaps: [], ticks: n, medianTickMs: 0 };
  if (n < 2) return out;
  const dts: number[] = [];
  // Rate-normalised samples, split into runs at gaps.
  const runs: Array<Array<{ t: number; v: number }>> = [];
  let run: Array<{ t: number; v: number }> = [];
  for (let i = 1; i < n; i++) {
    const t = tickMs[i] ?? 0;
    const dt = t - (tickMs[i - 1] ?? 0);
    if (!(dt > 0)) continue;
    if (dt > maxGapMs) {
      out.gaps.push([tickMs[i - 1] ?? 0, t]);
      if (run.length) runs.push(run);
      run = [];
      continue; // this tick's flux spans the gap
    }
    dts.push(dt);
    run.push({ t, v: ((flux[i] ?? 0) / dt) * gridMs });
  }
  if (run.length) runs.push(run);
  dts.sort((a, b) => a - b);
  out.medianTickMs = dts.length ? (dts[dts.length >> 1] ?? 0) : 0;
  for (const r of runs) {
    if (r.length < 2) continue;
    const t0 = r[0]?.t ?? 0;
    const t1 = r[r.length - 1]?.t ?? 0;
    let k = 0;
    for (let g = Math.ceil(t0 / gridMs) * gridMs; g <= t1; g += gridMs) {
      while (k + 1 < r.length && (r[k + 1]?.t ?? 0) < g) k++;
      const a = r[k];
      const b = r[k + 1] ?? a;
      if (!a || !b) continue;
      const span = b.t - a.t;
      const f = span > 0 ? Math.max(0, Math.min(1, (g - a.t) / span)) : 0;
      out.t_ms.push(g);
      out.flux.push(a.v + (b.v - a.v) * f);
    }
  }
  return out;
}

/** The app's tempo path from raw ticks: fixed grid -> adaptive onsets -> sub-grid tempo. */
export function tempoFromTicks(
  tickMs: number[],
  flux: number[],
): { tempo: TempoEstimate; onsets: WeightedOnset[]; grid: GridSeries } {
  const grid = resampleTicks(tickMs, flux);
  const onsets = pickTickOnsets(grid.t_ms, grid.flux);
  return { tempo: estimateTempoSubgrid(onsets), onsets, grid };
}

/** Tempo scoring against a reference: STRICT (displayed BPM) vs FORGIVEN (metrical equivalents). */
export const TEMPO_SCORING = {
  /** Relative tolerance for both scores. */
  tol: 0.04,
  /** Metrical equivalents FORGIVEN accepts (half, double, 2:3, 3:2). */
  ratios: [1, 0.5, 2, 2 / 3, 1.5],
} as const;

export function tempoStrict(bpm: number | null | undefined, ref: number): boolean {
  return bpm != null && Math.abs(bpm - ref) / ref <= TEMPO_SCORING.tol;
}

export function tempoForgiven(bpm: number | null | undefined, ref: number): boolean {
  return bpm != null && TEMPO_SCORING.ratios.some((k) => Math.abs(bpm - ref * k) / (ref * k) <= TEMPO_SCORING.tol);
}

// ---------------------------------------------------------------------------
// Deterministic lab — synthetic onset grids, no audio needed.
// Mirrors runChromaLab(): { name, expected, got, pass } rows.
// ---------------------------------------------------------------------------

export type LabRow = { name: string; expected: string; got: string; pass: boolean };

function grid(bpm: number, n: number, phaseMs = 0, jitterMs = 0): number[] {
  const step = 60000 / bpm;
  const out: number[] = [];
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) {
    const j = jitterMs ? (rand() * 2 - 1) * jitterMs : 0;
    out.push(Math.round(phaseMs + i * step + j));
  }
  return out;
}

export function runTempoLab(): LabRow[] {
  const rows: LabRow[] = [];
  const check = (name: string, expected: string, got: string, pass: boolean): void => {
    rows.push({ name, expected, got, pass });
  };

  // 1. Perfect 120 BPM grid — both methods must agree.
  {
    const est = estimateTempo(grid(120, 32));
    const agreed = est !== null && est.note.includes("agreement");
    check(
      "perfect 120 BPM grid",
      "120, two-method agreement",
      est ? `${est.bpm} conf ${est.confidence}` : "null",
      est?.bpm === 120 && (est?.confidence ?? 0) >= 0.6 && agreed,
    );
  }

  // 2. Perfect 90 BPM grid.
  {
    const est = estimateTempo(grid(90, 24));
    check(
      "perfect 90 BPM grid",
      "90, two-method agreement",
      est ? `${est.bpm} conf ${est.confidence}` : "null",
      est?.bpm === 90 && (est?.confidence ?? 0) >= 0.6,
    );
  }

  // 3. Human-timing jitter (±15 ms) at 100 BPM — must hold within ±4.
  {
    const est = estimateTempo(grid(100, 40, 0, 15));
    const ok = est?.bpm !== null && Math.abs((est?.bpm ?? 0) - 100) <= 4;
    check("jittered 100 BPM grid", "100±4", est ? `${est.bpm}` : "null", ok === true);
  }

  // 4. Sparse onsets — honest null, not a guess.
  {
    const est = estimateTempo([0, 500, 1000, 1500]);
    check("sparse onsets (<6)", "null", est === null ? "null" : `${est.bpm}`, est === null);
  }

  // 5. Swing 8ths at 100 BPM (2:1) — known hard case for IOI histograms.
  // Must NOT claim two-method agreement it doesn't have.
  {
    const q = 600;
    const onsets: number[] = [];
    for (let i = 0; i < 40; i++) onsets.push(Math.round((i >> 1) * q + (i % 2 ? 400 : 0)));
    const est = estimateTempo(onsets);
    const honest = est !== null && !est.note.includes("agreement");
    check(
      "swing 8ths (known hard case)",
      "no false agreement",
      est ? `${est.bpm} conf ${est.confidence}` : "null",
      honest,
    );
  }

  // 6. Occasional 8th-note pickups don't hijack the pulse.
  {
    const onsets = grid(120, 24);
    for (const i of [4, 5, 10, 11, 18]) onsets.push(Math.round(onsets[i] ?? 0) + 250);
    onsets.sort((a, b) => a - b);
    const est = estimateTempo(onsets);
    check("quarters + pickup 8ths at 120", "120", est ? `${est.bpm}` : "null", est?.bpm === 120);
  }

  // 7. Straight 8ths (240 BPM IOIs filtered) — autocorrelation fallback.
  {
    const onsets = grid(240, 64); // onsets every 250 ms
    const est = estimateTempo(onsets);
    check(
      "straight 8ths (IOI band filtered)",
      "120 via autocorr fallback, low conf",
      est ? `${est.bpm} conf ${est.confidence}` : "null",
      est?.bpm === 120 && (est?.confidence ?? 1) <= 0.35,
    );
  }

  // 8. Phase alignment on an off-zero grid.
  {
    const onsets = grid(120, 12, 250);
    const phase = alignBeatPhase(onsets, 120);
    check("beat phase alignment", "250±40", `${phase}`, Math.abs(phase - 250) <= 40);
  }

  // 9. Beat grid starts on the phase, not on zero.
  {
    const onsets = grid(120, 12, 250);
    const beats = beatGridAligned(6000, 120, onsets);
    const first = beats[0] ?? -1;
    check(
      "phase-aligned beat grid",
      "first beat ≈250",
      `${first}`,
      beats.length > 0 && Math.abs(first - 250) <= 40,
    );
  }

  // 10. Sub-grid: 96.006 BPM quarters + weaker off-beat 8ths (the test song's
  // feel) must land on 96, not 192 or 48, within 0.5 BPM.
  {
    const step = 60000 / 96.006;
    const on: WeightedOnset[] = [];
    for (let i = 0; i < 160; i++) {
      on.push({ t_ms: i * step, w: i % 2 === 0 ? 1 : 0.8 });
      on.push({ t_ms: i * step + step / 2, w: 0.35 });
    }
    const est = estimateTempoSubgrid(on);
    check("sub-grid 96 with 8ths", "96±0.5", est ? `${est.bpm}` : "null", Math.abs((est?.bpm ?? 0) - 96) <= 0.5);
  }

  // 11. Sub-grid: kick on 1 and 3 only (half-time trap) at 120 BPM with hats on
  // every beat must stay at the beat level (120), not 60.
  {
    const step = 500;
    const on: WeightedOnset[] = [];
    for (let i = 0; i < 120; i++) on.push({ t_ms: i * step, w: i % 2 === 0 ? 1 : 0.45 });
    const est = estimateTempoSubgrid(on);
    check("sub-grid half-time trap", "120±1", est ? `${est.bpm}` : "null", Math.abs((est?.bpm ?? 0) - 120) <= 1);
  }

  // 12. Sub-grid: aperiodic onsets must not report a tempo.
  {
    let seed = 777;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const on: WeightedOnset[] = [];
    let t = 0;
    for (let i = 0; i < 80; i++) {
      t += 150 + rand() * 1400;
      on.push({ t_ms: Math.round(t), w: 0.2 + rand() });
    }
    const est = estimateTempoSubgrid(on);
    check("sub-grid aperiodic", "null", est ? `${est.bpm} conf ${est.confidence}` : "null", est === null);
  }

  return rows;
}
