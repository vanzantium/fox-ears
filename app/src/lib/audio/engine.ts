import {
  bandEnergy,
  estimateItdMs,
  FFT_SIZE,
  rms,
  spectralCentroidHz,
  spectralFlux,
} from "./analyse";
import {
  chromaFromSpectrum,
  hpssFrame,
} from "./chroma";
import {
  detectPitch,
  harmonicity,
  vocalLikelihood,
} from "./pitch";
import { getDemoUrl, DEMO_DURATION_S, DEMO_TITLE } from "./demo";
import type { Bands, SourceKind } from "@/lib/hearing/types";
import { EMPTY_BANDS } from "@/lib/hearing/types";

export type EngineSnapshot = {
  freqL: Uint8Array;
  freqR: Uint8Array;
  freqM: Uint8Array;
  timeL: Float32Array;
  timeR: Float32Array;
  rmsL: number;
  rmsR: number;
  bandsL: Bands;
  bandsR: Bands;
  ild: number;
  itdMs: number | null;
  onset: number;
  flux: number;
  centroid: number;
  pitchHz: number | null;
  midi: number | null;
  note: string | null;
  pitchConfidence: number;
  harmonicity: number;
  chroma: number[];
  bassChroma: number[];
  vocal: number;
  perc: number;
  harm: number;
  vocalGate: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  sampleRate: number;
};

type Listener = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private analyserM: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private demoUrl: string | null = null;
  private listeners = new Set<Listener>();
  private prevFreq: Uint8Array | null = null;
  private itdClock = 0;
  private lastItd: number | null = null;
  private onsetHold = 0;
  private mixBuf = new Float32Array(FFT_SIZE);
  private specHist: Uint8Array[] = [];
  private lastPitch: {
    hz: number;
    midi: number;
    name: string;
    confidence: number;
  } | null = null;

  sourceKind: SourceKind = "none";
  fileName: string | null = null;
  sensitivity = 0.58;
  error: string | null = null;

  private freqL = new Uint8Array(FFT_SIZE / 2);
  private freqR = new Uint8Array(FFT_SIZE / 2);
  private freqM = new Uint8Array(FFT_SIZE / 2);
  private timeL = new Float32Array(FFT_SIZE);
  private timeR = new Float32Array(FFT_SIZE);

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.gainFromSensitivity();
    const splitter = ctx.createChannelSplitter(2);
    const aL = ctx.createAnalyser();
    const aR = ctx.createAnalyser();
    const aM = ctx.createAnalyser();
    for (const a of [aL, aR, aM]) {
      a.fftSize = FFT_SIZE;
      a.smoothingTimeConstant = 0.62;
      a.minDecibels = this.minDb();
      a.maxDecibels = -18;
    }
    master.connect(splitter);
    master.connect(aM);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);
    this.ctx = ctx;
    this.master = master;
    this.splitter = splitter;
    this.analyserL = aL;
    this.analyserR = aR;
    this.analyserM = aM;
    return ctx;
  }

  setSensitivity(v: number) {
    this.sensitivity = Math.max(0.05, Math.min(1, v));
    if (this.master) this.master.gain.value = this.gainFromSensitivity();
    for (const a of [this.analyserL, this.analyserR, this.analyserM]) {
      if (a) a.minDecibels = this.minDb();
    }
    this.emit();
  }

  private gainFromSensitivity() {
    return 0.35 + this.sensitivity * 1.45;
  }

  private minDb() {
    return -92 + (1 - this.sensitivity) * 38;
  }

  isPlaying() {
    if (this.sourceKind === "mic") return Boolean(this.micSource);
    return Boolean(this.element && !this.element.paused && !this.element.ended);
  }

  currentTime() {
    return this.element?.currentTime ?? 0;
  }

  duration() {
    if (this.sourceKind === "demo") return DEMO_DURATION_S;
    const d = this.element?.duration;
    return d && Number.isFinite(d) ? d : 0;
  }

  private disconnectSources() {
    try {
      this.mediaSource?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      this.micSource?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) t.stop();
    }
    this.micSource = null;
    this.micStream = null;
    if (this.master && this.ctx) {
      try {
        this.master.disconnect(this.ctx.destination);
      } catch {
        /* not connected */
      }
    }
  }

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;
    const el = document.createElement("audio");
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.addEventListener("ended", () => this.emit());
    el.addEventListener("play", () => this.emit());
    el.addEventListener("pause", () => this.emit());
    el.addEventListener("timeupdate", () => this.emit());
    el.addEventListener("loadedmetadata", () => this.emit());
    this.element = el;
    return el;
  }

  private async hookElement(el: HTMLAudioElement, monitor: boolean) {
    const ctx = await this.ensureContext();
    if (!this.mediaSource) {
      this.mediaSource = ctx.createMediaElementSource(el);
    }
    this.mediaSource.disconnect();
    if (this.master) {
      this.mediaSource.connect(this.master);
      if (monitor) this.master.connect(ctx.destination);
    }
  }

  async loadFile(file: File) {
    this.specHist = [];
    this.error = null;
    await this.ensureContext();
    this.stopMicOnly();
    const el = this.ensureElement();
    el.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    el.src = this.objectUrl;
    await el.play().catch((err: unknown) => {
      this.error = err instanceof Error ? err.message : "Could not play file";
    });
    await this.hookElement(el, true);
    this.sourceKind = "file";
    this.fileName = file.name;
    this.emit();
  }

  async playDemo() {
    this.specHist = [];
    this.error = null;
    await this.ensureContext();
    this.stopMicOnly();
    const el = this.ensureElement();
    if (!this.demoUrl) this.demoUrl = getDemoUrl();
    if (el.src !== this.demoUrl) {
      el.src = this.demoUrl;
    }
    el.currentTime = 0;
    await this.hookElement(el, true);
    await el.play();
    this.sourceKind = "demo";
    this.fileName = DEMO_TITLE;
    this.emit();
  }

  async playMic() {
    this.specHist = [];
    this.error = null;
    const ctx = await this.ensureContext();
    if (this.element) this.element.pause();
    this.disconnectSources();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      if (this.master) this.micSource.connect(this.master);
      this.sourceKind = "mic";
      this.fileName = "Microphone";
      this.emit();
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Microphone permission was denied";
      this.emit();
      throw err;
    }
  }

  async togglePlay() {
    if (this.sourceKind === "mic") {
      if (this.micSource) this.stop();
      else await this.playMic();
      return;
    }
    const el = this.element;
    if (!el || this.sourceKind === "none") {
      await this.playDemo();
      return;
    }
    if (el.paused) {
      await this.ensureContext();
      await el.play();
    } else {
      el.pause();
    }
    this.emit();
  }

  stop() {
    if (this.element) {
      this.element.pause();
      this.element.currentTime = 0;
    }
    this.stopMicOnly();
    if (this.sourceKind === "mic") this.sourceKind = "none";
    this.emit();
  }

  private stopMicOnly() {
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) t.stop();
    }
    try {
      this.micSource?.disconnect();
    } catch {
      /* */
    }
    this.micSource = null;
    this.micStream = null;
  }

  seek(seconds: number) {
    if (this.element && this.sourceKind !== "mic") {
      this.element.currentTime = Math.max(0, seconds);
      this.emit();
    }
  }

  hasEnded() {
    return Boolean(this.element && this.element.ended);
  }

  snapshot(): EngineSnapshot {
    const aL = this.analyserL;
    const aR = this.analyserR;
    const aM = this.analyserM;
    const sr = this.ctx?.sampleRate ?? 44100;

    if (aL && aR && aM) {
      aL.getByteFrequencyData(this.freqL);
      aR.getByteFrequencyData(this.freqR);
      aM.getByteFrequencyData(this.freqM);
      aL.getFloatTimeDomainData(this.timeL);
      aR.getFloatTimeDomainData(this.timeR);
    }

    const rmsL = rms(this.timeL);
    const rmsR = rms(this.timeR);
    const bandsL = aL ? bandEnergy(this.freqL, sr, FFT_SIZE) : EMPTY_BANDS();
    const bandsR = aR ? bandEnergy(this.freqR, sr, FFT_SIZE) : EMPTY_BANDS();
    const flux = this.prevFreq
      ? spectralFlux(this.prevFreq, this.freqM)
      : 0;
    if (!this.prevFreq) this.prevFreq = new Uint8Array(this.freqM.length);
    this.prevFreq.set(this.freqM);

    this.onsetHold = Math.max(this.onsetHold * 0.82, flux);
    this.itdClock++;
    if (this.itdClock % 3 === 0) {
      this.lastItd = estimateItdMs(this.timeL, this.timeR, sr);
    }

    for (let i = 0; i < this.mixBuf.length; i++) {
      this.mixBuf[i] = ((this.timeL[i] ?? 0) + (this.timeR[i] ?? 0)) * 0.5;
    }
    if (this.itdClock % 2 === 0) {
      this.lastPitch = detectPitch(this.mixBuf, sr);
    }
    this.specHist.push(Uint8Array.from(this.freqM));
    if (this.specHist.length > 15) this.specHist.shift();
    const hp = hpssFrame(this.specHist, this.freqM);
    const chroma = chromaFromSpectrum(hp.harmonic, sr, FFT_SIZE, 90, 1800, true);
    const bass = chromaFromSpectrum(hp.harmonic, sr, FFT_SIZE, 55, 180, false);
    const harm = harmonicity(hp.harmonic, sr, FFT_SIZE, this.lastPitch?.hz ?? null);
    const energy = (rmsL + rmsR) * 0.5;
    const vocal = vocalLikelihood({
      pitchHz: this.lastPitch?.hz ?? null,
      harmonicity: harm,
      centroid: spectralCentroidHz(this.freqM, sr, FFT_SIZE),
      energy,
      perc: hp.percEnergy,
      body: ((bandsL[500] ?? 0) + (bandsR[500] ?? 0)) * 0.5,
      mid: ((bandsL[2000] ?? 0) + (bandsR[2000] ?? 0)) * 0.5,
    });
    const hz = this.lastPitch?.hz ?? 0;
    const mid = ((bandsL[2000] ?? 0) + (bandsR[2000] ?? 0)) * 0.5;
    const body = ((bandsL[500] ?? 0) + (bandsR[500] ?? 0)) * 0.5;
    const vocalGate = vocal > 0.72 && hz >= 185 && hz <= 560 && mid > body * 0.28 && hp.percEnergy < 0.42;

    return {
      freqL: this.freqL,
      freqR: this.freqR,
      freqM: this.freqM,
      timeL: this.timeL,
      timeR: this.timeR,
      rmsL,
      rmsR,
      bandsL,
      bandsR,
      ild: rmsL - rmsR,
      itdMs: this.lastItd,
      onset: this.onsetHold,
      flux,
      centroid: spectralCentroidHz(this.freqM, sr, FFT_SIZE),
      pitchHz: this.lastPitch?.hz ?? null,
      midi: this.lastPitch?.midi ?? null,
      note: this.lastPitch?.name ?? null,
      pitchConfidence: this.lastPitch?.confidence ?? 0,
      harmonicity: harm,
      chroma,
      bassChroma: bass,
      vocal,
      perc: hp.percEnergy,
      harm: hp.harmEnergy,
      vocalGate,
      playing: this.isPlaying(),
      currentTime: this.currentTime(),
      duration: this.duration(),
      sampleRate: sr,
    };
  }
}

let singleton: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
