import type { EngineSnapshot } from "@/lib/audio/engine";
import type { HearingFrame } from "./types";

export const SAMPLE_INTERVAL_MS = 80;

export class HearingSampler {
  frames: HearingFrame[] = [];
  private lastT = -Infinity;
  private origin = 0;
  private running = false;
  private tickMs: number[] = [];
  private tickFlux: number[] = [];

  start() {
    this.frames = [];
    this.tickMs = [];
    this.tickFlux = [];
    this.lastT = -Infinity;
    this.origin = performance.now();
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.frames = [];
    this.tickMs = [];
    this.tickFlux = [];
    this.lastT = -Infinity;
    this.origin = performance.now();
  }

  get isRunning() {
    return this.running;
  }

  private clock(fileClockMs?: number) {
    return fileClockMs !== undefined && fileClockMs >= 0
      ? fileClockMs
      : performance.now() - this.origin;
  }

  /**
   * Record one analyser tick's spectral flux, stamped with the caller's clock
   * (the app passes AudioContext time on the file timeline; see
   * AudioEngine.clockMs). Ticks arrive at the display rate and are resampled
   * onto a fixed 10 ms grid later (tempo.ts resampleTicks). push() calls this for every
   * snapshot, so the app needs nothing extra; offline callers that skip the
   * full snapshot on non-sample ticks call it directly.
   */
  tick(flux: number, fileClockMs?: number) {
    if (!this.running) return;
    const t = this.clock(fileClockMs);
    const prev = this.tickMs[this.tickMs.length - 1];
    if (prev !== undefined && t <= prev) return;
    this.tickMs.push(Math.round(t * 10) / 10);
    this.tickFlux.push(round4(flux));
  }

  push(snap: EngineSnapshot, fileClockMs?: number) {
    if (!this.running) return;
    this.tick(snap.flux, fileClockMs);
    const t = this.clock(fileClockMs);
    if (t - this.lastT < SAMPLE_INTERVAL_MS) return;
    this.lastT = t;
    const ticks = { t_ms: this.tickMs, flux: this.tickFlux };
    this.tickMs = [];
    this.tickFlux = [];
    const onset = Math.max(0, Math.min(1, snap.onset * 1.8));
    this.frames.push({
      t_ms: Math.round(t),
      left_ear: {
        level: round4(snap.rmsL),
        bands: roundBands(snap.bandsL),
        onset,
      },
      right_ear: {
        level: round4(snap.rmsR),
        bands: roundBands(snap.bandsR),
        onset,
      },
      binaural_measurement: {
        level_delta_L_minus_R: round4(snap.ild),
        itd_ms_R_minus_L: snap.itdMs === null ? null : round4(snap.itdMs),
      },
      centroid_hz: Math.round(snap.centroid),
      flux: round4(snap.flux),
      pitch_hz: snap.pitchHz === null ? null : round4(snap.pitchHz),
      midi: snap.midi === null ? null : round4(snap.midi),
      note: snap.note,
      pitch_confidence: round4(snap.pitchConfidence),
      harmonicity: round4(snap.harmonicity),
      chroma: snap.chroma.map(round4),
      bass_chroma: snap.bassChroma.map(round4),
      vocal_likelihood: round4(snap.vocal),
      vocal_gate: snap.vocalGate,
      perc: round4(snap.perc),
      vox: snap.vocalFeat
        ? {
            side_db: round2(snap.vocalFeat.sideDb),
            mid_db: round2(snap.vocalFeat.midDb),
            peaks: snap.vocalFeat.peaks,
          }
        : undefined,
      ticks,
    });
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function roundBands(b: EngineSnapshot["bandsL"]) {
  return {
    500: round4(b[500]),
    1000: round4(b[1000]),
    2000: round4(b[2000]),
    4000: round4(b[4000]),
  };
}
