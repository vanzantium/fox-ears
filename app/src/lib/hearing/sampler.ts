import type { EngineSnapshot } from "@/lib/audio/engine";
import type { HearingFrame } from "./types";

export const SAMPLE_INTERVAL_MS = 80;

export class HearingSampler {
  frames: HearingFrame[] = [];
  private lastT = -Infinity;
  private origin = 0;
  private running = false;

  start() {
    this.frames = [];
    this.lastT = -Infinity;
    this.origin = performance.now();
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.frames = [];
    this.lastT = -Infinity;
    this.origin = performance.now();
  }

  get isRunning() {
    return this.running;
  }

  push(snap: EngineSnapshot, fileClockMs?: number) {
    if (!this.running) return;
    const t =
      fileClockMs !== undefined && fileClockMs >= 0
        ? fileClockMs
        : performance.now() - this.origin;
    if (t - this.lastT < SAMPLE_INTERVAL_MS) return;
    this.lastT = t;
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
    });
  }
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
