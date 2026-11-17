/**
 * Fixed 10 ms audio-clock grid for spectra used by key and sections.
 * Tempo already resamples flux ticks onto this grid (P0). P1 applies the
 * same clock to chroma / energy / vocal so those paths are not hostage to
 * the analyser read rate or per-read smoothing.
 */
export const SPECTRAL_GRID_MS = 10;

/** Time constant that makes a 10 ms hop match the old 0.62 per-read pole. */
export const SPECTRAL_SMOOTH_TAU_MS = -SPECTRAL_GRID_MS / Math.log(0.62);

export function smoothPole(dtMs: number, tauMs = SPECTRAL_SMOOTH_TAU_MS): number {
  if (dtMs <= 0) return 1;
  return Math.exp(-dtMs / Math.max(1e-6, tauMs));
}

export function smoothSpectrum(
  prev: Uint8Array | Float64Array | null,
  next: Uint8Array | Float64Array,
  dtMs: number,
): Float64Array {
  const n = next.length;
  const out = new Float64Array(n);
  const a = smoothPole(dtMs);
  const b = 1 - a;
  for (let i = 0; i < n; i++) {
    const x = Number(next[i] ?? 0);
    const p = prev ? Number(prev[i] ?? 0) : x;
    out[i] = a * p + b * x;
  }
  return out;
}

export type GridFrame<T extends { t_ms: number }> = T;

/**
 * Resample an irregular frame stream onto a fixed 10 ms grid by holding the
 * last sample (no invented data across a gap longer than `maxGapMs`).
 */
export function resampleOntoSpectralGrid<T extends { t_ms: number }>(
  frames: T[],
  maxGapMs = 250,
  gridMs = SPECTRAL_GRID_MS,
): T[] {
  if (frames.length < 2) return frames.slice();
  const start = Math.round(frames[0]!.t_ms / gridMs) * gridMs;
  const end = frames[frames.length - 1]!.t_ms;
  const out: T[] = [];
  let i = 0;
  for (let t = start; t <= end + 1e-6; t += gridMs) {
    while (i + 1 < frames.length && frames[i + 1]!.t_ms <= t) i++;
    const cur = frames[i]!;
    const nxt = frames[i + 1];
    const dtPrev = t - cur.t_ms;
    const dtNext = nxt ? nxt.t_ms - t : Infinity;
    if (dtPrev > maxGapMs && dtNext > maxGapMs) continue;
    const src = dtNext < dtPrev && nxt ? nxt : cur;
    out.push({ ...src, t_ms: t });
  }
  return out;
}
