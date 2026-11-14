import { BAND_HZ, EMPTY_BANDS, type Bands, type BandHz } from "@/lib/hearing/types";

export const FFT_SIZE = 2048;

export function bandEnergy(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
): Bands {
  const out = EMPTY_BANDS();
  const binHz = sampleRate / fftSize;
  for (const hz of BAND_HZ) {
    const center = hz / binHz;
    const lo = Math.max(0, Math.floor(center * 0.78));
    const hi = Math.min(freq.length - 1, Math.ceil(center * 1.28));
    let sum = 0;
    let w = 0;
    for (let i = lo; i <= hi; i++) {
      const d = 1 - Math.abs(i - center) / Math.max(1, hi - lo);
      const ww = Math.max(0.15, d);
      sum += ((freq[i] ?? 0) / 255) * ww;
      w += ww;
    }
    out[hz] = w > 0 ? Math.min(1, (sum / w) * 1.35) : 0;
  }
  return out;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ?? 0;
    s += v * v;
  }
  return Math.sqrt(s / Math.max(1, buf.length));
}

export function spectralCentroidHz(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  let num = 0;
  let den = 0;
  for (let i = 1; i < freq.length; i++) {
    const mag = freq[i] ?? 0;
    num += mag * i * binHz;
    den += mag;
  }
  return den > 1 ? num / den : 0;
}

export function spectralFlux(prev: Uint8Array, next: Uint8Array): number {
  let s = 0;
  const n = Math.min(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const d = (next[i] ?? 0) - (prev[i] ?? 0);
    if (d > 0) s += d;
  }
  return Math.min(1, s / (n * 18));
}

export function estimateItdMs(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): number | null {
  const n = Math.min(left.length, right.length, 512);
  if (n < 64) return null;
  const maxLag = Math.min(48, Math.floor(sampleRate * 0.0012));
  let best = 0;
  let bestLag = 0;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    energy += a * a + b * b;
  }
  if (energy < 1e-5) return null;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      c += (left[i] ?? 0) * (right[j] ?? 0);
    }
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  const norm = best / (energy * 0.5 + 1e-9);
  if (norm < 0.12) return null;
  return (bestLag / sampleRate) * 1000;
}

export function dominantBand(bands: Bands): BandHz {
  let best: BandHz = 1000;
  let v = -1;
  for (const hz of BAND_HZ) {
    if (bands[hz] > v) {
      v = bands[hz];
      best = hz;
    }
  }
  return best;
}

export function mergeBands(a: Bands, b: Bands): Bands {
  return {
    500: (a[500] + b[500]) * 0.5,
    1000: (a[1000] + b[1000]) * 0.5,
    2000: (a[2000] + b[2000]) * 0.5,
    4000: (a[4000] + b[4000]) * 0.5,
  };
}
