const NOTE_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}
function midiToPc(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export const PC_NAMES = NOTE_PC;

export function chromaVector(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
): number[] {
  return chromaHpcp(freq, sampleRate, fftSize).chroma;
}

export function chromaHpcp(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
): { chroma: number[]; bass: number[] } {
  return {
    chroma: chromaFromSpectrum(freq, sampleRate, fftSize, 90, 1800, true),
    bass: chromaFromSpectrum(freq, sampleRate, fftSize, 55, 180, false),
  };
}

export function chromaFromSpectrum(
  freq: Uint8Array | Float32Array,
  sampleRate: number,
  fftSize: number,
  loHz: number,
  hiHz: number,
  foldHarmonics: boolean,
): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / fftSize;
  const n = freq.length;
  const floor = percentile(freq, 0.45);
  const thresh = Math.max(0.045, (floor / 255) * 2.1);

  for (let i = 2; i < n - 1; i++) {
    const hz = i * binHz;
    if (hz < loHz || hz > hiHz) continue;
    const mag = (freq[i] ?? 0) / 255;
    if (mag < thresh) continue;
    const prev = (freq[i - 1] ?? 0) / 255;
    const next = (freq[i + 1] ?? 0) / 255;
    if (mag < prev || mag < next) continue;
    const denom = prev - 2 * mag + next;
    const delta = denom === 0 ? 0 : (0.5 * (prev - next)) / denom;
    const hzTrue = (i + delta) * binHz;
    const w = mag * mag;
    addPc(chroma, hzTrue, w);
    if (foldHarmonics) {
      const f0 = hzTrue / 2;
      if (f0 >= loHz) addPc(chroma, f0, w * 0.4);
    }
  }
  normalizeL1(chroma, 0.08);
  return chroma;
}

function addPc(chroma: number[], hz: number, w: number) {
  if (hz < 40 || hz > 5000) return;
  const pc = midiToPc(hzToMidi(hz));
  chroma[pc] = (chroma[pc] ?? 0) + w;
}

function percentile(freq: Uint8Array | Float32Array, p: number): number {
  const vals: number[] = [];
  for (let i = 1; i < freq.length; i++) vals.push(freq[i] ?? 0);
  vals.sort((a, b) => a - b);
  return vals[Math.floor(p * (vals.length - 1))] ?? 0;
}

function normalizeL1(v: number[], minSum: number) {
  let s = 0;
  for (const x of v) s += x;
  if (s < minSum) {
    v.fill(0);
    return;
  }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / s;
}

export function chromaReliability(frames: Array<{ chroma?: number[]; energy?: number }>): {
  ok: boolean;
  dominant_bin: number;
  frac: number;
  note: string;
} {
  const votes = new Array<number>(12).fill(0);
  let n = 0;
  for (const f of frames) {
    const ch = f.chroma;
    if (!ch || ch.length !== 12) continue;
    const sum = ch.reduce((a, b) => a + b, 0);
    if (sum < 0.05) continue;
    const peak = ch.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0);
    votes[peak] = (votes[peak] ?? 0) + 1;
    n++;
  }
  if (n < 8) {
    return { ok: false, dominant_bin: -1, frac: 0, note: "too few voiced chroma frames" };
  }
  let dominant = 0;
  for (let i = 1; i < 12; i++) if ((votes[i] ?? 0) > (votes[dominant] ?? 0)) dominant = i;
  const frac = (votes[dominant] ?? 0) / n;
  const ok = frac < 0.62;
  return {
    ok,
    dominant_bin: dominant,
    frac: Math.round(frac * 1000) / 1000,
    note: ok
      ? "chroma moves across pitch classes"
      : `CHROMA_UNRELIABLE: bin ${dominant} (${PC_NAMES[dominant]}) is max in ${(frac * 100).toFixed(0)}% of frames — key/chord/function suppressed`,
  };
}

/** Time/frequency median HPSS on a small spectrogram stack. */
export function hpssFrame(
  history: Uint8Array[],
  current: Uint8Array,
  tWin = 9,
  fWin = 7,
): { harmonic: Uint8Array; percussive: Uint8Array; percEnergy: number; harmEnergy: number } {
  const n = current.length;
  const harmonic = new Uint8Array(n);
  const percussive = new Uint8Array(n);
  const stack = history.length ? history : [current];
  const t0 = Math.max(0, stack.length - tWin);
  let percSum = 0;
  let harmSum = 0;
  const tcol: number[] = [];
  const fcol: number[] = [];
  for (let k = 0; k < n; k++) {
    tcol.length = 0;
    for (let t = t0; t < stack.length; t++) tcol.push(stack[t]![k] ?? 0);
    const h = median(tcol);
    fcol.length = 0;
    const lo = Math.max(0, k - fWin);
    const hi = Math.min(n - 1, k + fWin);
    for (let j = lo; j <= hi; j++) fcol.push(current[j] ?? 0);
    const p = median(fcol);
    const hs = h * h;
    const ps = p * p;
    const den = hs + ps + 1;
    const c = current[k] ?? 0;
    const hv = Math.round((c * hs) / den);
    const pv = Math.round((c * ps) / den);
    harmonic[k] = hv;
    percussive[k] = pv;
    harmSum += hv;
    percSum += pv;
  }
  const tot = harmSum + percSum + 1;
  return {
    harmonic,
    percussive,
    percEnergy: percSum / tot,
    harmEnergy: harmSum / tot,
  };
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const a = v.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)] ?? 0;
}

export function synthPeakSpectrum(
  peaksHz: number[],
  sampleRate: number,
  fftSize: number,
  noise = 4,
): Uint8Array {
  const n = fftSize / 2;
  const spec = new Uint8Array(n);
  const binHz = sampleRate / fftSize;
  for (let i = 0; i < n; i++) spec[i] = noise;
  for (const hz of peaksHz) {
    const bin = Math.round(hz / binHz);
    for (let d = -2; d <= 2; d++) {
      const i = bin + d;
      if (i <= 0 || i >= n) continue;
      spec[i] = Math.min(255, spec[i] + Math.round(220 * Math.exp((-d * d) / 1.2)));
    }
  }
  return spec;
}

export function runChromaLab(): Array<{ name: string; expected: string; got: string; pass: boolean }> {
  const sr = 44100;
  const fft = 2048;
  const rows: Array<{ name: string; expected: string; got: string; pass: boolean }> = [];
  const pcAt = (hz: number) => PC_NAMES[midiToPc(hzToMidi(hz))] ?? "?";

  for (let pc = 0; pc < 12; pc++) {
    const hz = 440 * 2 ** ((pc - 9) / 12); // A4=440, C=pc0 → 261.6
    const spec = synthPeakSpectrum([hz, hz * 2, hz * 3], sr, fft, 3);
    const { chroma } = chromaHpcp(spec, sr, fft);
    const got = PC_NAMES[chroma.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0)] ?? "?";
    const expected = PC_NAMES[pc] ?? "?";
    rows.push({ name: `pure ${expected} (${hz.toFixed(1)}Hz)`, expected, got, pass: got === expected });
    void pcAt;
  }

  const triads: Array<[string, number[]]> = [
    ["C major", [261.63, 329.63, 392.0]],
    ["G major", [392.0, 493.88, 587.33]],
    ["D major", [293.66, 369.99, 440.0]],
    ["E minor", [329.63, 392.0, 493.88]],
  ];
  for (const [name, hz] of triads) {
    const spec = synthPeakSpectrum(hz, sr, fft, 3);
    const { chroma } = chromaHpcp(spec, sr, fft);
    const top = chroma
      .map((v, i) => ({ v, n: PC_NAMES[i]! }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map((x) => x.n)
      .sort()
      .join("");
    const expectMap: Record<string, string> = {
      "C major": "CEG",
      "G major": "BDG",
      "D major": "ADF#",
      "E minor": "BEG",
    };
    const expected = expectMap[name] ?? "";
    rows.push({ name, expected, got: top, pass: top === expected });
  }

  const progressions: Array<[string, number[][]]> = [
    [
      "Em-G-C-D",
      [
        [329.63, 392.0, 493.88],
        [392.0, 493.88, 587.33],
        [261.63, 329.63, 392.0],
        [293.66, 369.99, 440.0],
      ],
    ],
    [
      "G-D-Em-C",
      [
        [392.0, 493.88, 587.33],
        [293.66, 369.99, 440.0],
        [329.63, 392.0, 493.88],
        [261.63, 329.63, 392.0],
      ],
    ],
  ];
  for (const [name, chords] of progressions) {
    const got = chords
      .map((hz) => {
        const spec = synthPeakSpectrum(hz, sr, fft, 3);
        const { chroma } = chromaHpcp(spec, sr, fft);
        return bestTriad(chroma);
      })
      .join("-");
    const distinct = new Set(got.split("-")).size >= 3;
    rows.push({ name, expected: "moving roots", got, pass: distinct });
  }

  // Noise-only should NOT collapse to a fake 1.0 bin.
  const noise = synthPeakSpectrum([], sr, fft, 12);
  const { chroma } = chromaHpcp(noise, sr, fft);
  const sum = chroma.reduce((a, b) => a + b, 0);
  rows.push({
    name: "noise floor stays empty",
    expected: "sum≈0",
    got: sum.toFixed(3),
    pass: sum < 0.05,
  });

  return rows;
}

function bestTriad(chroma: number[]): string {
  const maj = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
  const min = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];
  let best = { name: "?", s: -1 };
  for (let r = 0; r < 12; r++) {
    for (const [suf, vec] of [
      ["", maj],
      ["m", min],
    ] as const) {
      let n = 0;
      let da = 0;
      let db = 0;
      for (let i = 0; i < 12; i++) {
        const x = chroma[i] ?? 0;
        const y = vec[(i - r + 12) % 12] ?? 0;
        n += x * y;
        da += x * x;
        db += y * y;
      }
      const d = Math.sqrt(da * db) || 1;
      const s = n / d;
      if (s > best.s) best = { name: `${NOTE_PC[r]}${suf}`, s };
    }
  }
  return best.name;
}
