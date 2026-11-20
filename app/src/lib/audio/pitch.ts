const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function hzToMidi(hz: number, a4Hz = 440): number {
  return 69 + 12 * Math.log2(hz / a4Hz);
}

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[pc] ?? "C"}${oct}`;
}

export function midiToPc(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * McLeod-style NSM + parabolic peak. Cheap enough for analyser buffers.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
): { hz: number; midi: number; name: string; confidence: number } | null {
  const n = Math.min(buf.length, 1024);
  if (n < 128) return null;
  let rms = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] ?? 0;
    rms += v * v;
  }
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / 1400));
  const tauMax = Math.min(n - 2, Math.floor(sampleRate / 80));
  const THRESH = 0.72;
  let chosenTau = 0;
  let chosenCorr = 0;
  let bestTau = 0;
  let bestCorr = 0;

  for (let tau = tauMin; tau <= tauMax; tau++) {
    const corr = corrAt(buf, n, tau);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestTau = tau;
    }
    if (!chosenTau && corr >= THRESH) {
      const prev = corrAt(buf, n, tau - 1);
      const next = corrAt(buf, n, tau + 1);
      if (corr >= prev && corr >= next) {
        chosenTau = tau;
        chosenCorr = corr;
      }
    }
  }

  const useTau = chosenTau || bestTau;
  const useCorr = chosenTau ? chosenCorr : bestCorr;
  if (useTau < 2 || useCorr < 0.52) return null;

  const y0 = corrAt(buf, n, useTau - 1);
  const y1 = corrAt(buf, n, useTau);
  const y2 = corrAt(buf, n, useTau + 1);
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom === 0 ? 0 : (y0 - y2) / denom;
  const tau = useTau + shift;
  const hz = sampleRate / tau;
  if (!Number.isFinite(hz) || hz < 80 || hz > 1400) return null;
  const midi = hzToMidi(hz);
  return {
    hz,
    midi,
    name: midiToName(midi),
    confidence: Math.max(0, Math.min(1, (useCorr - 0.52) / 0.4)),
  };
}

function corrAt(buf: Float32Array, n: number, tau: number): number {
  if (tau < 1 || tau >= n - 1) return 0;
  let ac = 0;
  let e1 = 0;
  let e2 = 0;
  const lim = n - tau;
  for (let i = 0; i < lim; i++) {
    const a = buf[i] ?? 0;
    const b = buf[i + tau] ?? 0;
    ac += a * b;
    e1 += a * a;
    e2 += b * b;
  }
  return ac / (Math.sqrt(e1 * e2) + 1e-12);
}

export { chromaHpcp, chromaVector, chromaReliability, runChromaLab } from "./chroma";

export function dominantChroma(chroma: number[]): number {
  let best = 0;
  let v = -1;
  for (let i = 0; i < chroma.length; i++) {
    if ((chroma[i] ?? 0) > v) {
      v = chroma[i] ?? 0;
      best = i;
    }
  }
  return best;
}

export function harmonicity(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
  f0: number | null,
): number {
  if (!f0 || f0 < 70) return 0;
  const binHz = sampleRate / fftSize;
  let harm = 0;
  let total = 0;
  for (let i = 1; i < freq.length; i++) {
    const mag = (freq[i] ?? 0) / 255;
    total += mag;
    const hz = i * binHz;
    const k = hz / f0;
    const nearest = Math.round(k);
    if (nearest >= 1 && nearest <= 8 && Math.abs(k - nearest) < 0.08) harm += mag;
  }
  if (total < 1e-6) return 0;
  return Math.max(0, Math.min(1, (harm / total) * 1.4));
}

export function vocalLikelihood(input: {
  pitchHz: number | null;
  harmonicity: number;
  centroid: number;
  energy: number;
  perc?: number;
  body?: number;
  mid?: number;
}): number {
  if (input.energy < 0.015) return 0;
  if ((input.perc ?? 0) > 0.48) return 0.03;
  const hz = input.pitchHz;
  const inVoice = hz !== null && hz >= 185 && hz <= 560 ? 1 : hz !== null && hz >= 170 && hz <= 620 ? 0.25 : 0.02;
  const body = input.centroid > 700 && input.centroid < 2800 ? 0.7 : 0.12;
  const midVsBody =
    input.mid !== undefined && input.body !== undefined
      ? input.mid > input.body * 0.32
        ? 0.2
        : -0.25
      : 0;
  return Math.max(
    0,
    Math.min(1, 0.55 * inVoice + 0.3 * input.harmonicity + 0.18 * body + midVsBody),
  );
}
