import { mergeBands } from "@/lib/audio/analyse";
import { midiToPc } from "@/lib/audio/pitch";
import type {
  BandHz,
  BindingConflict,
  CueLedger,
  CueState,
  HearingFrame,
  HearingMap,
  LyricLine,
  SongGraph,
  SoundObject,
} from "./types";
import { BAND_HZ } from "./types";
import { buildChart } from "./score";
import { degreeOf, TonicTracker } from "./sonofield";
import type { PassOptions } from "./songModel";

const BAND_ON = 0.16;
const SPATIAL_JUMP = 0.42;

function spatialOf(frame: HearingFrame): number {
  const l = frame.left_ear.level;
  const r = frame.right_ear.level;
  const s = l + r;
  if (s < 1e-6) return 0;
  return (l - r) / s;
}

function bandSpatial(frame: HearingFrame, hz: BandHz): number {
  const l = frame.left_ear.bands[hz];
  const r = frame.right_ear.bands[hz];
  const s = l + r;
  if (s < 1e-6) return 0;
  return (l - r) / s;
}

function energyOf(frame: HearingFrame): number {
  return (frame.left_ear.level + frame.right_ear.level) * 0.5;
}

function cue(
  spectral: CueState,
  temporal: CueState,
  onset: CueState,
  spatial: CueState,
  evidence: string,
): CueLedger {
  return { spectral, temporal, onset, spatial, evidence };
}

function memoryKey(o: SoundObject): string {
  const lean =
    (o.spatial_start + o.spatial_end) / 2 > 0.12
      ? "left-lean"
      : (o.spatial_start + o.spatial_end) / 2 < -0.12
        ? "right-lean"
        : "center";
  const hop = o.hops.length ? `hopx${o.hops.length}` : "steady-band";
  return `${o.birth_band}hz/${lean}/${hop}/${Math.round((o.t_end_ms - o.t_start_ms) / 100) * 100}ms`;
}

export function buildGraph(frames: HearingFrame[]): SongGraph {
  const graph: SongGraph = {
    t_ms: [],
    energy: [],
    spatial: [],
    centroid_hz: [],
    onset: [],
    pitch_midi: [],
    vocal: [],
    tension: [],
    degree: [],
    band_500: [],
    band_1000: [],
    band_2000: [],
    band_4000: [],
  };
  const tracker = new TonicTracker();
  for (const f of frames) {
    const merged = mergeBands(f.left_ear.bands, f.right_ear.bands);
    const e = energyOf(f);
    tracker.push(f.chroma ?? [], e, f.t_ms);
    const st =
      f.midi !== null && tracker.ready ? degreeOf(midiToPc(f.midi), tracker.pc, tracker.mode) : null;
    graph.t_ms.push(f.t_ms);
    graph.energy.push(e);
    graph.spatial.push(spatialOf(f));
    graph.centroid_hz.push(f.centroid_hz);
    graph.onset.push(Math.max(f.left_ear.onset, f.right_ear.onset, f.flux));
    graph.pitch_midi.push(f.midi ?? 0);
    graph.vocal.push(f.vocal_likelihood ?? 0);
    graph.tension.push(st?.tension ?? 0);
    graph.degree.push(st ? st.delta : -1);
    graph.band_500.push(merged[500]);
    graph.band_1000.push(merged[1000]);
    graph.band_2000.push(merged[2000]);
    graph.band_4000.push(merged[4000]);
  }
  return graph;
}

export function bindObjects(frames: HearingFrame[]): {
  objects: SoundObject[];
  conflicts: BindingConflict[];
} {
  const objects: SoundObject[] = [];
  const conflicts: BindingConflict[] = [];
  if (frames.length === 0) return { objects, conflicts };

  type Track = {
    hz: BandHz;
    start: number;
    last: number;
    spatial0: number;
    spatial1: number;
    eSum: number;
    ePeak: number;
    n: number;
  };

  const open = new Map<BandHz, Track>();
  let seq = 0;

  const flush = (hz: BandHz, tEnd: number) => {
    const tr = open.get(hz);
    if (!tr) return;
    open.delete(hz);
    const o: SoundObject = {
      id: `o${++seq}`,
      t_start_ms: tr.start,
      t_end_ms: tEnd,
      birth_band: tr.hz,
      dominant_band: tr.hz,
      spatial_start: tr.spatial0,
      spatial_end: tr.spatial1,
      energy_mean: tr.eSum / Math.max(1, tr.n),
      energy_peak: tr.ePeak,
      hops: [],
      concurrent: false,
      cue: cue("SAME", "SAME", "SAME", "SAME", "Single-band track with no internal rupture."),
      memory_key: "",
    };
    o.memory_key = memoryKey(o);
    objects.push(o);
  };

  for (const f of frames) {
    const merged = mergeBands(f.left_ear.bands, f.right_ear.bands);
    for (const hz of BAND_HZ) {
      const on = merged[hz] >= BAND_ON;
      const tr = open.get(hz);
      if (on && !tr) {
        const spat = bandSpatial(f, hz);
        open.set(hz, {
          hz,
          start: f.t_ms,
          last: f.t_ms,
          spatial0: spat,
          spatial1: spat,
          eSum: merged[hz],
          ePeak: merged[hz],
          n: 1,
        });
      } else if (on && tr) {
        tr.last = f.t_ms;
        tr.spatial1 = bandSpatial(f, hz);
        tr.eSum += merged[hz];
        tr.ePeak = Math.max(tr.ePeak, merged[hz]);
        tr.n += 1;
      } else if (!on && tr) {
        if (f.t_ms - tr.last > 140) flush(hz, tr.last);
      }
    }
  }
  for (const hz of [...open.keys()]) {
    const tr = open.get(hz);
    if (tr) flush(hz, tr.last);
  }

  objects.sort((a, b) => a.t_start_ms - b.t_start_ms);

  const mergedObjects: SoundObject[] = [];
  for (const o of objects) {
    const prev = mergedObjects[mergedObjects.length - 1];
    if (
      prev &&
      o.t_start_ms - prev.t_end_ms < 90 &&
      Math.abs(o.spatial_start - prev.spatial_end) < SPATIAL_JUMP &&
      o.birth_band !== prev.dominant_band
    ) {
      conflicts.push({
        t_ms: o.t_start_ms,
        kind: "spectral",
        statement:
          "Band energy relocated without a silent gap; spatial trajectory stayed continuous.",
        dominant: "Temporal and spatial continuity keep one persistent thing.",
        alternative: `Treat ${prev.id} and ${o.id} as two things that traded occupancy.`,
      });
      prev.t_end_ms = o.t_end_ms;
      prev.hops.push({
        t_ms: o.t_start_ms,
        from: prev.dominant_band,
        to: o.birth_band,
      });
      prev.dominant_band = o.birth_band;
      prev.spatial_end = o.spatial_end;
      prev.energy_peak = Math.max(prev.energy_peak, o.energy_peak);
      prev.energy_mean = (prev.energy_mean + o.energy_mean) * 0.5;
      prev.cue = cue(
        "SPLIT",
        "SAME",
        "AMBIGUOUS",
        "SAME",
        "Spectral occupancy jumped; envelope and lean continued.",
      );
      prev.memory_key = memoryKey(prev);
      continue;
    }
    mergedObjects.push(o);
  }

  for (let i = 1; i < mergedObjects.length; i++) {
    const a = mergedObjects[i - 1];
    const b = mergedObjects[i];
    if (!a || !b) continue;
    const gap = b.t_start_ms - a.t_end_ms;
    if (gap >= 140 && a.dominant_band === b.birth_band) {
      conflicts.push({
        t_ms: b.t_start_ms,
        kind: "onset",
        statement: `Silent gap of ${Math.round(gap)}ms then a new onset in the same band.`,
        dominant: "Offset/onset continuity splits identity.",
        alternative: "A single thing that paused, if the gap is treated as occlusion.",
      });
      b.cue = cue(
        "SAME",
        "SPLIT",
        "SPLIT",
        Math.abs(b.spatial_start - a.spatial_end) > SPATIAL_JUMP ? "SPLIT" : "AMBIGUOUS",
        "Return after silence; same band, possibly other lean.",
      );
    }
  }

  for (const o of mergedObjects) {
    if (Math.abs(o.spatial_end - o.spatial_start) > 1.1 && o.hops.length === 0) {
      conflicts.push({
        t_ms: Math.round((o.t_start_ms + o.t_end_ms) / 2),
        kind: "spatial",
        statement: "Lean reversed inside a spectrally continuous occupancy.",
        dominant: "Spectrum and envelope keep one thing; space is the disagreeing cue.",
        alternative: "Two things exchanging a shared band.",
      });
      o.cue.spatial = "SPLIT";
      o.cue.evidence = "Spatial trajectory reversed while band occupancy held.";
    }
  }

  for (let i = 0; i < mergedObjects.length; i++) {
    for (let j = i + 1; j < mergedObjects.length; j++) {
      const a = mergedObjects[i];
      const b = mergedObjects[j];
      if (!a || !b) continue;
      const overlap =
        Math.min(a.t_end_ms, b.t_end_ms) - Math.max(a.t_start_ms, b.t_start_ms);
      if (overlap < 400) continue;
      if (a.birth_band === b.birth_band) continue;
      const spatA = (a.spatial_start + a.spatial_end) / 2;
      const spatB = (b.spatial_start + b.spatial_end) / 2;
      if (spatA * spatB < 0) {
        a.concurrent = true;
        b.concurrent = true;
        conflicts.push({
          t_ms: Math.max(a.t_start_ms, b.t_start_ms),
          kind: "dual-band",
          statement:
            "Two band occupancies ran together with opposing lean — two things, not a chord-as-one.",
          dominant: "Spectral split plus spatial split.",
          alternative: "One compound object if the listener binds by shared onset.",
        });
      }
    }
  }

  for (const o of mergedObjects) o.memory_key = memoryKey(o);
  return { objects: mergedObjects, conflicts };
}

export function assembleMap(input: {
  title: string;
  sourceKind: "file" | "mic" | "demo";
  sourceName: string;
  frames: HearingFrame[];
  intervalMs: number;
  lyrics?: { source: "none" | "pasted" | "speech" | "published"; text: string; lines: LyricLine[] };
  paintingPng?: string;
  pass?: PassOptions;
}): HearingMap {
  const { objects, conflicts } = bindObjects(input.frames);
  const last = input.frames[input.frames.length - 1];
  const lyrics = input.lyrics ?? { source: "none" as const, text: "", lines: [] };
  return {
    schema: "fox-ears-hearing-map-1.1",
    version: "fox-ears-0.3",
    title: input.title,
    source: { kind: input.sourceKind, name: input.sourceName },
    duration_ms: last?.t_ms ?? 0,
    sample_interval_ms: input.intervalMs,
    captured_at: new Date().toISOString(),
    frames: input.frames,
    objects,
    conflicts,
    graph: buildGraph(input.frames),
    chart: buildChart(input.frames, lyrics, input.pass),
    painting_png: input.paintingPng,
    grammar: {
      cue_hierarchy: [
        "Offset after silence plus a fresh onset splits identity.",
        "Two bands with opposing lean split even without a gap.",
        "A spectral hop with continuous envelope and lean stays one thing.",
        "A spatial reversal inside one band is a conflict, not an automatic split.",
      ],
      break_conditions: [
        "Silent gap ≳ 140ms then a new onset.",
        "Independent band occupancies with contrary spatial trajectories.",
        "Onset coinciding with a new dominant band after decay.",
      ],
      persistence_conditions: [
        "Amplitude contour can swell and thin.",
        "Lean can drift if the path is continuous.",
        "A band hop can be survived if time and space do not also rupture.",
        "A sung pitch can glide a semitone and remain the same note event.",
      ],
      conflict_rule:
        "When cues disagree, both histories are kept: the dominant binding follows temporal/onset continuity, the alternative is preserved in conflicts[].",
    },
  };
}
