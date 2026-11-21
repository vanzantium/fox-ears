/**
 * Multi-pulse tempo: a recording may contain a reference click, a performed
 * groove, and a subdivision or double, all as real features. Scoring is per
 * role so hearing the guitar is not a miss when the task asked for the click.
 */
// Local copies of tempo.ts helpers so this file stays importable from
// node:test (experimental-strip-types cannot resolve extensionless "./tempo").
const FELT_MAX_BPM = 180;
const PRIOR_BPM = 110;
function groovePrior(bpm: number): number {
  const z = Math.log2(bpm / PRIOR_BPM);
  return Math.exp(-0.5 * z * z);
}

export const TEMPO_ROLES = ["reference_click", "performed_groove", "subdivision_or_double"] as const;
export type TempoRole = (typeof TEMPO_ROLES)[number];

export type TempoHypothesis = {
  value_bpm: number;
  role: TempoRole;
  source: string;
  confidence: number | null;
  relation?: string;
  median_error_ms?: number;
  n_inliers?: number;
};

export type PreferredFor = {
  transcription_grid: number | null;
  felt_groove: number | null;
  unresolved: boolean;
};

export type TempoHypothesisSet = {
  tempo_hypotheses: TempoHypothesis[];
  preferred_for: PreferredFor;
};

export const TEMPO_ROLE_TOLERANCE = 0.04;

export function withinTol(got: number, expected: number, tol = TEMPO_ROLE_TOLERANCE): boolean {
  if (!(got > 0) || !(expected > 0)) return false;
  return Math.abs(got - expected) / expected <= tol;
}

export function scoreTempoRole(
  set: TempoHypothesisSet,
  role: TempoRole,
  expectedBpm: number,
  tol = TEMPO_ROLE_TOLERANCE,
): { role: TempoRole; expected: number; got: number | null; hit: boolean; note: string } {
  const hyp = set.tempo_hypotheses
    .filter((h) => h.role === role)
    .sort((a, b) => Math.abs(a.value_bpm - expectedBpm) - Math.abs(b.value_bpm - expectedBpm))[0];
  if (!hyp) {
    return {
      role,
      expected: expectedBpm,
      got: null,
      hit: false,
      note: `no ${role} hypothesis; other roles are not a miss of this task`,
    };
  }
  const hit = withinTol(hyp.value_bpm, expectedBpm, tol);
  return {
    role,
    expected: expectedBpm,
    got: hyp.value_bpm,
    hit,
    note: hit
      ? `${role} ${hyp.value_bpm} within ±${tol * 100}% of ${expectedBpm}`
      : `${role} ${hyp.value_bpm} is outside ±${tol * 100}% of ${expectedBpm}`,
  };
}

function roundBpm(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Least-squares period/phase fit of a sparse regular grid to onset times. */
export function fitRegularGrid(
  onsetMs: number[],
  periodMs: number,
  toleranceMs: number,
): { bpm: number; phase_ms: number; median_error_ms: number; n_inliers: number; coverage: number } | null {
  if (onsetMs.length < 4 || periodMs <= 0) return null;
  const times = onsetMs.slice().sort((a, b) => a - b);
  const span = (times[times.length - 1] ?? 0) - (times[0] ?? 0);
  if (span < periodMs * 3) return null;
  // Search phase in 1 ms steps over one period (coarse), then refine.
  let bestPhase = 0;
  let bestCount = 0;
  const step = Math.max(1, Math.round(periodMs / 80));
  for (let phase = 0; phase < periodMs; phase += step) {
    let n = 0;
    for (const t of times) {
      const r = Math.abs(((t - phase) % periodMs + periodMs) % periodMs);
      const err = Math.min(r, periodMs - r);
      if (err <= toleranceMs) n++;
    }
    if (n > bestCount) {
      bestCount = n;
      bestPhase = phase;
    }
  }
  const inliers: number[] = [];
  const errs: number[] = [];
  for (const t of times) {
    const r = Math.abs(((t - bestPhase) % periodMs + periodMs) % periodMs);
    const err = Math.min(r, periodMs - r);
    if (err <= toleranceMs) {
      inliers.push(t);
      errs.push(err);
    }
  }
  if (inliers.length < 4) return null;
  // Least-squares period from inlier index
  const t0 = inliers[0]!;
  const ks = inliers.map((t) => Math.round((t - t0) / periodMs));
  const kMean = ks.reduce((a, b) => a + b, 0) / ks.length;
  const tMean = inliers.reduce((a, b) => a + b, 0) / inliers.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < inliers.length; i++) {
    const dk = ks[i]! - kMean;
    num += dk * (inliers[i]! - tMean);
    den += dk * dk;
  }
  const lsPeriod = den > 0 ? num / den : periodMs;
  if (!(lsPeriod > 0)) return null;
  const lsPhase = tMean - lsPeriod * kMean;
  const lsErrs = inliers.map((t) => {
    const r = Math.abs(((t - lsPhase) % lsPeriod + lsPeriod) % lsPeriod);
    return Math.min(r, lsPeriod - r);
  });
  lsErrs.sort((a, b) => a - b);
  const median = lsErrs[Math.floor(lsErrs.length / 2)] ?? 0;
  const cover =
    ((inliers[inliers.length - 1] ?? 0) - (inliers[0] ?? 0)) / Math.max(1, span);
  return {
    bpm: roundBpm(60_000 / lsPeriod),
    phase_ms: lsPhase,
    median_error_ms: Math.round(median * 100) / 100,
    n_inliers: inliers.length,
    coverage: Math.round(cover * 1000) / 1000,
  };
}

/** IOI search window. 120 ms lets sixteenth-notes at ~96 BPM vote; the old 180 ms floor is not a groove. */
export const IOI = { minMs: 120, maxMs: 2000, artifactMs: 180 } as const;

export function isIoiFloorArtifact(periodMs: number): boolean {
  return Math.abs(periodMs - IOI.artifactMs) < 2.5;
}

/** Fit quality that does not reward a finer grid just for collecting more inliers. */
export function gridFitQuality(fit: { coverage: number; median_error_ms: number; bpm: number }): number {
  return (fit.coverage / (1 + fit.median_error_ms / 20)) * groovePrior(fit.bpm);
}

export function metricallyRelated(a: number, b: number, tol = TEMPO_ROLE_TOLERANCE): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  if (withinTol(a, b, tol)) return true;
  for (const k of [0.5, 2, 2 / 3, 1.5, 1 / 3, 3, 0.25, 4]) {
    if (withinTol(a, b * k, tol)) return true;
  }
  return false;
}

function ioiCandidates(onsetMs: number[]): number[] {
  if (onsetMs.length < 4) return [];
  const times = onsetMs.slice().sort((a, b) => a - b);
  const iois: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!;
    if (d >= IOI.minMs && d <= IOI.maxMs) iois.push(d);
  }
  if (!iois.length) return [];
  const bins = new Map<number, number>();
  for (const d of iois) {
    const b = Math.round(d / 5) * 5;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);
}

export type DetectPulsesOptions = {
  /** Onsets from a dense tracker (strum / groove). */
  denseOnsetMs?: number[];
  /** Optional previously estimated groove (Fox Ears sub-grid). */
  grooveBpm?: number | null;
  grooveConfidence?: number | null;
  grooveSource?: string;
  /** Related metrical candidates from the sub-grid estimator. */
  grooveCandidates?: Array<{ bpm: number; votes?: number; role?: string }>;
  /** Raw analyser-tick flux, used to comb for a quiet regular click under a louder groove. */
  tickMs?: number[];
  tickFlux?: number[];
};

/** Mean / median flux on a regular grid (quiet metronome under a louder strum). */
export function fluxCombScore(
  tickMs: number[],
  tickFlux: number[],
  periodMs: number,
  hopMs = 10,
): { phase_ms: number; mean: number; median: number; n: number } | null {
  if (tickMs.length < 16 || periodMs <= 0) return null;
  const t0 = tickMs[0] ?? 0;
  const t1 = tickMs[tickMs.length - 1] ?? 0;
  if (t1 - t0 < periodMs * 4) return null;
  const n = Math.ceil((t1 - t0) / hopMs) + 1;
  const grid = new Float64Array(n);
  const cnt = new Uint16Array(n);
  for (let i = 0; i < tickMs.length; i++) {
    const j = Math.round(((tickMs[i] ?? 0) - t0) / hopMs);
    if (j >= 0 && j < n) {
      grid[j] += tickFlux[i] ?? 0;
      cnt[j]++;
    }
  }
  for (let j = 0; j < n; j++) if (cnt[j]) grid[j] /= cnt[j];
  let best: { phase_ms: number; mean: number; median: number; n: number } | null = null;
  const pSteps = Math.max(1, Math.round(periodMs / hopMs));
  for (let phase = 0; phase < pSteps; phase++) {
    const vals: number[] = [];
    for (let j = phase; j < n; j += pSteps) vals.push(grid[j] ?? 0);
    if (vals.length < 8) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const s = vals.slice().sort((a, b) => a - b);
    const median = s[Math.floor(s.length / 2)] ?? 0;
    if (!best || mean > best.mean) best = { phase_ms: phase * hopMs, mean, median, n: vals.length };
  }
  return best;
}

/**
 * Find a sparse regular pulse (metronome / click) and relate it to a denser
 * performed groove when both are present.
 */
export function detectTempoHypotheses(
  sparseOnsetMs: number[],
  opts: DetectPulsesOptions = {},
): TempoHypothesisSet {
  const hyps: TempoHypothesis[] = [];
  const dense = (opts.denseOnsetMs ?? []).slice();
  const sparse = sparseOnsetMs.slice();

  const ioiPeriods = ioiCandidates(sparse);
  const clickPeriods = new Set<number>(ioiPeriods);
  // Only seed 750 ms (80 BPM) when the sparse IOIs already show a near-80
  // pulse. Unconditionally seeding it can invent a tight 8-inlier "click"
  // on an unrelated grid (e.g. 96 BPM).
  if (ioiPeriods.some((p) => Math.abs(p - 750) <= 40)) clickPeriods.add(750);
  if (opts.tickMs?.length && opts.tickFlux?.length) {
    const trial = new Set<number>([750, 720, 625, 600, 500, ...clickPeriods]);
    if (opts.grooveBpm && opts.grooveBpm > 0) {
      trial.add(Math.round(60_000 / opts.grooveBpm));
    }
    const ranked: Array<{ p: number; score: number }> = [];
    for (const p of trial) {
      const c = fluxCombScore(opts.tickMs, opts.tickFlux, p);
      if (c) ranked.push({ p, score: c.mean });
    }
    ranked.sort((a, b) => b.score - a.score);
    // A canned period may rank first by a few percent of flux even when every
    // trial is in the noise (neon-whiskers 750 vs 128). Require the winner to
    // stand out from the background, not just from its nearest rival.
    if (ranked[0]) {
      const scores = ranked.map((r) => r.score).sort((a, b) => a - b);
      const median = scores[Math.floor(scores.length / 2)] ?? 0;
      const second = ranked[1]?.score ?? 0;
      if (ranked[0].score >= median * 1.8 && (second === 0 || ranked[0].score >= second * 1.08)) {
        clickPeriods.add(ranked[0].p);
      }
    }
  }
  type Fit = NonNullable<ReturnType<typeof fitRegularGrid>>;
  const consider = (pool: number[], maxErr: number): Fit[] => {
    if (pool.length < 4) return [];
    const span = (pool[pool.length - 1] ?? 0) - (pool[0] ?? 0);
    const out: Fit[] = [];
    for (const p of clickPeriods) {
      const tight = fitRegularGrid(pool, p, 8);
      if (!tight) continue;
      const expected = span / Math.max(1, 60000 / tight.bpm);
      if (tight.median_error_ms > maxErr) continue;
      if (tight.coverage < 0.4) continue;
      // 15% of expected beats is easy for a thin coincidental subset (an 80
      // BPM "click" with ~35 tight inliers on a 128 grid). A reference click
      // has to land on a real fraction of its own grid.
      if (tight.n_inliers < Math.max(6, 0.3 * expected)) continue;
      const density = tight.n_inliers / Math.max(1, span);
      if (density > 1 / 200) continue;
      out.push(tight);
    }
    // Tight median error on a small inlier set is not better evidence than a
    // slightly looser fit with many more hits.
    const clickQuality = (f: Fit) => f.n_inliers / (1 + f.median_error_ms / 4);
    out.sort((a, b) => clickQuality(b) - clickQuality(a) || a.median_error_ms - b.median_error_ms);
    return out;
  };
  const pickClick = (fits: Fit[]): Fit | null => {
    let click = fits[0] ?? null;
    if (click) {
      const half = fits.find((f) => Math.abs(f.bpm * 2 - click!.bpm) / click!.bpm < 0.03);
      if (half && half.n_inliers >= click.n_inliers * 0.9 && half.median_error_ms <= click.median_error_ms + 1) {
        click = half;
      }
    }
    return click;
  };
  // Prefer a tight pulse on the sparse stream (metronome peaks). Only fall
  // back to the dense onset list when the mix buries the click in louder events.
  let click = pickClick(consider(sparse, 6));
  if (!click) click = pickClick(consider(dense, 2.5));

  if (click) {
    hyps.push({
      value_bpm: click.bpm,
      role: "reference_click",
      source: "sparse_regular_pulse",
      confidence: Math.max(0, Math.min(1, 1 - click.median_error_ms / 8)),
      median_error_ms: click.median_error_ms,
      n_inliers: click.n_inliers,
    });
  }

  let grooveBpm = opts.grooveBpm ?? null;
  // If the sub-grid locked onto a double (~168) with a strong half (~84), the
  // performed groove is the slower level. The click, if any, stays separate.
  if (grooveBpm != null && grooveBpm >= 140 && opts.grooveCandidates?.length) {
    const half = opts.grooveCandidates.find((c) => withinTol(c.bpm * 2, grooveBpm!, 0.04));
    if (half) grooveBpm = half.bpm;
  }
  if (grooveBpm == null) {
    const pool = dense.length ? dense : sparse;
    const periods = ioiCandidates(pool);
    const expanded = new Set<number>(periods);
    for (const p of periods) {
      for (const k of [2, 3, 4]) {
        if (p * k <= IOI.maxMs) expanded.add(p * k);
      }
    }
    let best: ReturnType<typeof fitRegularGrid> | null = null;
    let bestQ = -Infinity;
    for (const p of expanded) {
      // The 180 ms IOI floor is a search artifact, not a performed groove.
      if (isIoiFloorArtifact(p)) continue;
      const fit = fitRegularGrid(pool, p, 25);
      if (!fit) continue;
      if (click && withinTol(fit.bpm, click.bpm, 0.02)) continue;
      let used = fit;
      if (fit.bpm > FELT_MAX_BPM) {
        const period = 60_000 / fit.bpm;
        for (const k of [2, 3, 4]) {
          const slower = fitRegularGrid(pool, period * k, 25);
          if (!slower) continue;
          if (slower.bpm > FELT_MAX_BPM) continue;
          if (gridFitQuality(slower) >= 0.85 * gridFitQuality(fit) && gridFitQuality(slower) > gridFitQuality(used)) {
            used = slower;
          }
        }
        if (used.bpm > FELT_MAX_BPM) continue;
      }
      const q = gridFitQuality(used);
      if (q > bestQ) {
        bestQ = q;
        best = used;
      }
    }
    grooveBpm = best?.bpm ?? null;
    if (best && grooveBpm) {
      hyps.push({
        value_bpm: grooveBpm,
        role: "performed_groove",
        source: "dense_onset_grid",
        confidence: Math.max(0, Math.min(1, best.coverage / (1 + best.median_error_ms / 20))),
        median_error_ms: best.median_error_ms,
        n_inliers: best.n_inliers,
      });
    }
  } else {
    hyps.push({
      value_bpm: roundBpm(grooveBpm),
      role: "performed_groove",
      source: opts.grooveSource ?? "fox_ears_subgrid",
      confidence: opts.grooveConfidence ?? null,
    });
  }

  const groove = hyps.find((h) => h.role === "performed_groove");
  if (groove) {
    hyps.push({
      value_bpm: roundBpm(groove.value_bpm * 2),
      role: "subdivision_or_double",
      source: groove.source,
      confidence: groove.confidence,
      relation: "2x performed_groove",
    });
  } else if (click) {
    hyps.push({
      value_bpm: roundBpm(click.bpm * 2),
      role: "subdivision_or_double",
      source: "sparse_regular_pulse",
      confidence: click ? Math.max(0, Math.min(1, 1 - click.median_error_ms / 8)) : null,
      relation: "2x reference_click",
    });
  }

  // A pulse at a metric relative of a locked groove (double, half, 3:2) is
  // the same grid, not a separate metronome. Drop it so preferred_for is not
  // left unresolved while the felt groove is already clear.
  if (opts.grooveBpm && opts.grooveBpm > 0) {
    const ci = hyps.findIndex((h) => h.role === "reference_click");
    if (ci >= 0) {
      const cBpm = hyps[ci]!.value_bpm;
      if (metricallyRelated(cBpm, opts.grooveBpm) && !withinTol(cBpm, opts.grooveBpm, 0.04)) {
        hyps.splice(ci, 1);
        click = null;
      }
    }
  }

  const clickH = hyps.find((h) => h.role === "reference_click");
  const grooveH = hyps.find((h) => h.role === "performed_groove");
  const displayed = opts.grooveBpm ?? null;
  const felt = grooveH?.value_bpm ?? clickH?.value_bpm ?? null;
  const feltTooFast = felt != null && felt > 220;
  const displayDisagree = Boolean(
    displayed != null && felt != null && !metricallyRelated(displayed, felt, 0.04),
  );
  // Displayed tempo blank while preferred_for claims a confident groove (or a
  // 180 ms floor pulse) is a disagreement: leave it UNRESOLVED.
  const blankVsPreferred = displayed == null && grooveH?.source === "dense_onset_grid";
  // A reference click at a different tempo is a separate role, not an
  // unresolved felt groove, when displayed and felt already agree (or are
  // metrically related) and the felt tempo is in range.
  const unresolved = feltTooFast || displayDisagree || Boolean(blankVsPreferred);
  return {
    tempo_hypotheses: hyps,
    preferred_for: {
      transcription_grid: clickH?.value_bpm ?? grooveH?.value_bpm ?? null,
      felt_groove: felt,
      unresolved,
    },
  };
}

/** Merge a Fox Ears scalar tempo reading with a click/groove detection. */
export function attachHypothesesToEstimate(
  estimate: { bpm: number | null; confidence: number; note?: string; candidates?: Array<{ bpm: number; votes?: number; role?: string }> } | null,
  sparseOnsetMs: number[],
  denseOnsetMs?: number[],
  ticks?: { t_ms: number[]; flux: number[] },
): TempoHypothesisSet {
  return detectTempoHypotheses(sparseOnsetMs, {
    denseOnsetMs,
    grooveBpm: estimate?.bpm ?? null,
    grooveConfidence: estimate?.confidence ?? null,
    grooveSource: "fox_ears_subgrid",
    grooveCandidates: estimate?.candidates,
    tickMs: ticks?.t_ms,
    tickFlux: ticks?.flux,
  });
}
