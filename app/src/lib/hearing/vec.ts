/** Small vector helpers shared by the P4 sonar, motif and spiral layers. */

export function l2(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return n > 1e-12 ? v.map((x) => x / n) : v.map(() => 0);
}

export function cos(a: number[], b: number[]): number {
  let n = 0;
  let da = 0;
  let db = 0;
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    n += x * y;
    da += x * x;
    db += y * y;
  }
  const d = Math.sqrt(da * db);
  return d > 1e-12 ? n / d : 0;
}

/** Rotate a 12-bin chroma up by s semitones (bin p moves to p+s). */
export function rotate12(v: number[], s: number): number[] {
  const out = new Array<number>(12).fill(0);
  for (let p = 0; p < 12; p++) out[(p + s + 1200) % 12] = v[p] ?? 0;
  return out;
}
