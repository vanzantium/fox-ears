/**
 * Offline replica of AudioEngine.snapshot() for calibration.
 * Mirrors the Web Audio AnalyserNode (Blackman window, smoothingTimeConstant,
 * byte dB mapping between minDecibels/maxDecibels) and the engine's per-tick
 * state (onsetHold decay, specHist for HPSS), then hands snapshots to the real
 * HearingSampler + assembleMap so the numbers match the app's pipeline.
 * Pure Node; no browser. Not part of the app bundle.
 */
import {
  bandEnergy, estimateItdMs, FFT_SIZE, rms, spectralCentroidHz, spectralFlux,
} from "@/lib/audio/analyse";
import { chromaFromSpectrum, hpssFrame } from "@/lib/audio/chroma";
import { detectPitch, harmonicity } from "@/lib/audio/pitch";
import { LoudFollower, vocalCuesPass, vocalFeatures, vocalScore } from "@/lib/audio/vocal";
import type { EngineSnapshot } from "@/lib/audio/engine";
import { HearingSampler, SAMPLE_INTERVAL_MS } from "@/lib/hearing/sampler";
import type { HearingFrame } from "@/lib/hearing/types";

const SMOOTHING = 0.62;
const MAX_DB = -18;

class Fft {
  n: number; rev: Uint32Array; cos: Float64Array; sin: Float64Array; win: Float64Array;
  constructor(n: number) {
    this.n = n;
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(-2 * Math.PI * i / n); this.sin[i] = Math.sin(-2 * Math.PI * i / n); }
    // Web Audio Blackman (alpha 0.16)
    const a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;
    this.win = new Float64Array(n);
    for (let i = 0; i < n; i++) this.win[i] = a0 - a1 * Math.cos(2 * Math.PI * i / n) + a2 * Math.cos(4 * Math.PI * i / n);
  }
  /** returns |X[k]|/N for k < N/2 */
  mag(x: Float32Array): Float64Array {
    const n = this.n, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[this.rev[i]!] = (x[i] ?? 0) * this.win[i]!;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) for (let j = 0; j < half; j++) {
        const k = j * step, wr = this.cos[k]!, wi = this.sin[k]!;
        const a = s + j, b = a + half;
        const tr = re[b]! * wr - im[b]! * wi, ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti; re[a] = re[a]! + tr; im[a] = im[a]! + ti;
      }
    }
    const out = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k]!, im[k]!) / n;
    return out;
  }
}

class OfflineAnalyser {
  smooth = new Float64Array(FFT_SIZE / 2);
  constructor(private fft: Fft, public minDb: number) {}
  tick(time: Float32Array, out: Uint8Array) {
    const m = this.fft.mag(time);
    const range = MAX_DB - this.minDb;
    for (let k = 0; k < m.length; k++) {
      const s = SMOOTHING * this.smooth[k]! + (1 - SMOOTHING) * m[k]!;
      this.smooth[k] = s;
      const db = s > 0 ? 20 * Math.log10(s) : -1000;
      out[k] = Math.max(0, Math.min(255, Math.floor((255 / range) * (db - this.minDb))));
    }
  }
}

export type RunOptions = {
  sensitivity?: number;
  /** Analyser read rate (the app's requestAnimationFrame rate). Default 60. */
  tickHz?: number;
  /** Uniform +/- jitter on each tick interval, ms (seeded, deterministic). */
  jitterMs?: number;
  /** [fromMs, toMs]: no analyser reads in this span, like a backgrounded tab. */
  gapMs?: [number, number];
  tickFlux?: number[];
};

export function hearPcm(
  L: Float32Array, R: Float32Array, sr: number, opts: RunOptions = {},
): HearingFrame[] {
  const sens = Math.max(0.05, Math.min(1, opts.sensitivity ?? 0.58));
  const gain = 0.35 + sens * 1.45;
  const minDb = -92 + (1 - sens) * 38;
  const tickHz = opts.tickHz ?? 60;
  const hop = Math.round(sr / tickHz);
  const jit = Math.round(((opts.jitterMs ?? 0) / 1000) * sr);
  let seed = 4242;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  const nextHop = () => Math.max(1, hop + (jit ? Math.round((rand() * 2 - 1) * jit) : 0));
  const fft = new Fft(FFT_SIZE);
  const aL = new OfflineAnalyser(fft, minDb), aR = new OfflineAnalyser(fft, minDb), aM = new OfflineAnalyser(fft, minDb);
  const freqL = new Uint8Array(FFT_SIZE / 2), freqR = new Uint8Array(FFT_SIZE / 2), freqM = new Uint8Array(FFT_SIZE / 2);
  const timeL = new Float32Array(FFT_SIZE), timeR = new Float32Array(FFT_SIZE), timeM = new Float32Array(FFT_SIZE);
  const mixBuf = new Float32Array(FFT_SIZE);
  let prevFreq: Uint8Array | null = null;
  let onsetHold = 0;
  const specHist: Uint8Array[] = [];
  const sampler = new HearingSampler();
  sampler.start();
  let lastSampleMs = -Infinity;
  const loudF = new LoudFollower();

  for (let end = FFT_SIZE; end <= L.length; end += nextHop()) {
    const gapClock = (end / sr) * 1000;
    if (opts.gapMs && gapClock > opts.gapMs[0] && gapClock < opts.gapMs[1]) continue; // no rAF while hidden
    const st = end - FFT_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      const l = (L[st + i] ?? 0) * gain, r = (R[st + i] ?? 0) * gain;
      timeL[i] = l; timeR[i] = r; timeM[i] = (l + r) * 0.5; // master analyser sees the down-mix
    }
    aL.tick(timeL, freqL); aR.tick(timeR, freqR); aM.tick(timeM, freqM);
    const flux = prevFreq ? spectralFlux(prevFreq, freqM) : 0;
    if (!prevFreq) prevFreq = new Uint8Array(freqM.length);
    prevFreq.set(freqM);
    onsetHold = Math.max(onsetHold * 0.82, flux);
    opts.tickFlux?.push(flux);
    specHist.push(Uint8Array.from(freqM));
    if (specHist.length > 15) specHist.shift();

    // The app stamps ticks with AudioContext time on the file timeline (P0); offline
    // that is exactly the sample clock.
    const clockMs = (end / sr) * 1000;
    if (clockMs - lastSampleMs < SAMPLE_INTERVAL_MS) {
      sampler.tick(flux, clockMs); // the app's push() records every tick too
      continue; // the sampler would drop the full snapshot anyway
    }
    lastSampleMs = clockMs;

    const rmsL = rms(timeL), rmsR = rms(timeR);
    const bandsL = bandEnergy(freqL, sr, FFT_SIZE), bandsR = bandEnergy(freqR, sr, FFT_SIZE);
    const itd = estimateItdMs(timeL, timeR, sr);
    for (let i = 0; i < FFT_SIZE; i++) mixBuf[i] = ((timeL[i] ?? 0) + (timeR[i] ?? 0)) * 0.5;
    const pitch = detectPitch(mixBuf, sr);
    const hp = hpssFrame(specHist, freqM);
    const chroma = chromaFromSpectrum(hp.harmonic, sr, FFT_SIZE, 90, 1800, true);
    const bass = chromaFromSpectrum(hp.harmonic, sr, FFT_SIZE, 55, 180, false);
    const harm = harmonicity(hp.harmonic, sr, FFT_SIZE, pitch?.hz ?? null);
    const centroid = spectralCentroidHz(freqM, sr, FFT_SIZE);
    // Same vocal cues as AudioEngine.snapshot() (lib/audio/vocal.ts); the app
    // refreshes them every 2nd tick, here every sampled frame.
    const vocalFeat = vocalFeatures(timeL, timeR, sr);
    const loud = loudF.push(vocalFeat.midDb, clockMs);
    const vocal = vocalScore(vocalFeat, loud);
    const vocalGate = vocalCuesPass(vocalFeat, loud);
    const snap: EngineSnapshot = {
      freqL, freqR, freqM, timeL, timeR, rmsL, rmsR, bandsL, bandsR,
      ild: rmsL - rmsR, itdMs: itd, onset: onsetHold, flux, centroid,
      pitchHz: pitch?.hz ?? null, midi: pitch?.midi ?? null, note: pitch?.name ?? null,
      pitchConfidence: pitch?.confidence ?? 0, harmonicity: harm, chroma, bassChroma: bass,
      vocal, perc: hp.percEnergy, harm: hp.harmEnergy, vocalGate, vocalFeat, playing: true,
      currentTime: end / sr, duration: L.length / sr, sampleRate: sr,
    };
    sampler.push(snap, clockMs);
  }
  sampler.stop();
  return sampler.frames;
}

/** The 2026-11-14 harness proposal (fixed k, 60 Hz). The app now does this in hearing/tempo.ts pickTickOnsets; kept here only for before/after comparison. */
export function tickOnsetsMs(flux: number[], tickHz = 60, k = 1.0, winS = 1.0): number[] {
  const w = Math.max(3, Math.round(winS * tickHz)), out: number[] = [];
  let lastMs = -1e9;
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i]!;
    if (!(v > flux[i - 1]! && v >= flux[i + 1]!)) continue;
    const lo = Math.max(0, i - w), hi = Math.min(flux.length, i + w);
    let m = 0; for (let j = lo; j < hi; j++) m += flux[j]!; m /= hi - lo;
    let sd = 0; for (let j = lo; j < hi; j++) sd += (flux[j]! - m) ** 2; sd = Math.sqrt(sd / (hi - lo));
    const ms = (i * 1000) / tickHz;
    if (v > m + k * sd && ms - lastMs > 90) { out.push(ms); lastMs = ms; }
  }
  return out;
}
