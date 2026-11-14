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

  return rows;
}
