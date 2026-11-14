import { encodeWavStereo } from "./wav";

export const DEMO_DURATION_S = 36;
export const DEMO_TITLE = "Listening etude";

type Grain = {
  t0: number;
  dur: number;
  freq: number;
  amp: number;
  pan0: number;
  pan1: number;
  attack: number;
  release: number;
  tremoloHz?: number;
};

/**
 * A closed stereo field designed to exercise binding: hops, gaps,
 * sudden spatial flips, amplitude contour, and dual-band weaving.
 */
export function renderDemoWav(): Blob {
  const sr = 44100;
  const n = Math.floor(sr * DEMO_DURATION_S);
  const L = new Float32Array(n);
  const R = new Float32Array(n);

  const grains: Grain[] = [
    // H — mid field slides inward, then a high continuation leans out
    { t0: 0.18, dur: 4.05, freq: 980, amp: 0.22, pan0: -0.72, pan1: 0.0, attack: 0.05, release: 0.35 },
    { t0: 4.12, dur: 4.05, freq: 3920, amp: 0.17, pan0: 0.04, pan1: 0.68, attack: 0.08, release: 0.45 },

    // N — same band, silence, return on the other side
    { t0: 10.05, dur: 3.85, freq: 1960, amp: 0.2, pan0: -0.62, pan1: 0.02, attack: 0.06, release: 0.18 },
    { t0: 15.55, dur: 3.15, freq: 1960, amp: 0.2, pan0: 0.18, pan1: 0.7, attack: 0.07, release: 0.28 },

    // C — same band, abrupt spatial flip, no gap
    { t0: 19.05, dur: 2.42, freq: 1040, amp: 0.24, pan0: -0.78, pan1: -0.74, attack: 0.05, release: 0.06 },
    { t0: 21.42, dur: 2.55, freq: 1040, amp: 0.24, pan0: 0.74, pan1: 0.78, attack: 0.04, release: 0.22 },

    // T — high band with a pulsing contour
    { t0: 24.2, dur: 4.4, freq: 4120, amp: 0.16, pan0: -0.55, pan1: 0.58, attack: 0.04, release: 0.3, tremoloHz: 6.2 },

    // Q — two bands weave with opposing lean
    { t0: 29.0, dur: 6.6, freq: 990, amp: 0.15, pan0: -0.6, pan1: 0.55, attack: 0.08, release: 0.5 },
    { t0: 29.0, dur: 6.6, freq: 3960, amp: 0.13, pan0: 0.58, pan1: -0.52, attack: 0.08, release: 0.5 },
  ];

  for (const g of grains) paintGrain(L, R, sr, g);

  // Quiet bed so the field never feels digitally empty while grains run
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bed = (Math.random() * 2 - 1) * 0.008 * (t > 0.05 && t < DEMO_DURATION_S - 0.4 ? 1 : 0);
    L[i] = (L[i] ?? 0) + bed * 0.92;
    R[i] = (R[i] ?? 0) + bed * 1.08;
  }

  softClip(L);
  softClip(R);
  return encodeWavStereo(L, R, sr);
}

function paintGrain(L: Float32Array, R: Float32Array, sr: number, g: Grain) {
  const i0 = Math.floor(g.t0 * sr);
  const i1 = Math.min(L.length, i0 + Math.floor(g.dur * sr));
  const attackN = Math.max(1, Math.floor(g.attack * sr));
  const releaseN = Math.max(1, Math.floor(g.release * sr));
  const twoPi = Math.PI * 2;
  const phase = Math.random() * twoPi;

  for (let i = i0; i < i1; i++) {
    const k = i - i0;
    const tLocal = k / sr;
    const remaining = i1 - i;
    let env = 1;
    if (k < attackN) env *= k / attackN;
    if (remaining < releaseN) env *= remaining / releaseN;
    env *= env; // slightly concave

    let trem = 1;
    if (g.tremoloHz) {
      trem = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(twoPi * g.tremoloHz * tLocal));
    }

    const s =
      Math.sin(twoPi * g.freq * tLocal + phase) +
      0.28 * Math.sin(twoPi * g.freq * 2 * tLocal + phase) +
      0.1 * Math.sin(twoPi * g.freq * 3 * tLocal + phase * 0.5);

    const u = k / Math.max(1, i1 - i0);
    const pan = g.pan0 + (g.pan1 - g.pan0) * u;
    const gL = Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((pan + 1) * Math.PI) / 4);
    const v = s * g.amp * env * trem * 0.72;
    L[i] = (L[i] ?? 0) + v * gL;
    R[i] = (R[i] ?? 0) + v * gR;
  }
}

function softClip(buf: Float32Array) {
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i] ?? 0;
    buf[i] = Math.tanh(x * 1.15);
  }
}

let cachedUrl: string | null = null;

export function getDemoUrl(): string {
  if (cachedUrl) return cachedUrl;
  const blob = renderDemoWav();
  cachedUrl = URL.createObjectURL(blob);
  return cachedUrl;
}
