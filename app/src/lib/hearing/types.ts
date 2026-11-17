export const BAND_HZ = [500, 1000, 2000, 4000] as const;
export type BandHz = (typeof BAND_HZ)[number];

export type CueState = "SAME" | "SPLIT" | "AMBIGUOUS" | "UNAVAILABLE";

export type Bands = Record<BandHz, number>;

export type EarSample = {
  level: number;
  bands: Bands;
  onset: number;
};

export type HearingFrame = {
  t_ms: number;
  left_ear: EarSample;
  right_ear: EarSample;
  binaural_measurement: {
    level_delta_L_minus_R: number;
    itd_ms_R_minus_L: number | null;
  };
  centroid_hz: number;
  flux: number;
  pitch_hz: number | null;
  midi: number | null;
  note: string | null;
  pitch_confidence: number;
  harmonicity: number;
  chroma: number[];
  bass_chroma: number[];
  vocal_likelihood: number;
  vocal_gate?: boolean;
  perc?: number;
  /**
   * Analyser ticks (one per display frame: 60/90/120 Hz) since the previous
   * frame: audio-clock ms on the file timeline (AudioContext time since P0,
   * 2026-11-15) and spectral flux. The chart resamples them onto a fixed 10 ms
   * grid before onset picking (tempo.ts resampleTicks). Tuning pass 1,
   * 2026-11-14; absent on maps sealed before that.
   */
  ticks?: { t_ms: number[]; flux: number[] };
  /**
   * Vocal-band cues (see lib/audio/vocal.ts): side/mid ratio and mid energy in
   * 300-3000 Hz (dB) and the count of spectral peaks there. Tuning pass 1.
   */
  vox?: { side_db: number; mid_db: number; peaks: number };
};

export type CueLedger = {
  spectral: CueState;
  temporal: CueState;
  onset: CueState;
  spatial: CueState;
  evidence: string;
};

export type SoundObject = {
  id: string;
  t_start_ms: number;
  t_end_ms: number;
  birth_band: BandHz;
  dominant_band: BandHz;
  spatial_start: number;
  spatial_end: number;
  energy_mean: number;
  energy_peak: number;
  hops: Array<{ t_ms: number; from: BandHz; to: BandHz }>;
  cue: CueLedger;
  memory_key: string;
  concurrent: boolean;
};

export type BindingConflict = {
  t_ms: number;
  kind: "spectral" | "temporal" | "onset" | "spatial" | "dual-band";
  statement: string;
  dominant: string;
  alternative: string;
};

export type SongGraph = {
  t_ms: number[];
  energy: number[];
  spatial: number[];
  centroid_hz: number[];
  onset: number[];
  pitch_midi: number[];
  vocal: number[];
  tension: number[];
  degree: number[];
  band_500: number[];
  band_1000: number[];
  band_2000: number[];
  band_4000: number[];
};

export type NoteEvent = {
  t_ms: number;
  dur_ms: number;
  midi: number;
  name: string;
  hz: number;
  confidence: number;
  degree?: string;
  feeling?: string;
  tension?: number;
};

export type SongSection = {
  t_start_ms: number;
  t_end_ms: number;
  label: string;
  energy_mean: number;
  hypothesis: string;
  role: "intro" | "verse" | "chorus" | "bridge" | "outro" | "section" | "phrase";
};

export type LyricLine = {
  t_ms: number;
  text: string;
  source: "pasted" | "speech" | "published";
};

export type ChordEvent = {
  t_ms: number;
  dur_ms: number;
  symbol: string;
  root: string;
  quality: string;
  confidence: number;
  roman?: string;
  root_degree?: string;
  bass_degree?: string;
  inverted?: boolean;
  feeling?: string;
  tension?: number;
  alternate?: string;
};

export type DegreeEvent = {
  t_ms: number;
  layer: "melody" | "bass";
  degree: string;
  feeling: string;
  tension: number;
  euler: number;
  midi: number;
  stable?: boolean;
};

export type ResolutionEvent = {
  t_ms: number;
  from_degree: string;
  to_degree: string;
  from_tension: number;
  to_tension: number;
  drop: number;
  delay_ms: number;
  layer: "melody" | "bass";
};

export type AffectRegion = {
  t_ms: number;
  label: string;
  cites: string[];
};

export type AffectConflict = {
  t_ms: number;
  kind: "valence";
  statement: string;
  positive: string[];
  negative: string[];
};

export type SongChart = {
  tempo_bpm: number | null;
  tempo_confidence: number;
  tempo_candidates?: Array<{ bpm: number; votes: number; role: "pulse" | "beat" | "subdivision" }>;
  tempo_note?: string;
  /** P1: multiple real pulses, scored per role. */
  tempo_hypotheses?: import("./tempoHypotheses").TempoHypothesis[];
  preferred_for?: import("./tempoHypotheses").PreferredFor;
  key: { tonic: string; mode: "major" | "minor"; confidence: number } | null;
  key_hypotheses?: Array<{
    tonic: string;
    mode: "major" | "minor";
    corr: number;
    role?: import("./keyResolve").KeyRole;
    t_start_ms?: number;
    t_end_ms?: number;
  }>;
  /** RESOLVED, or UNRESOLVED when tonic-vs-dominant (or relative) evidence is close and split. */
  key_status?: "RESOLVED" | "UNRESOLVED";
  local_centers?: Array<{
    t_start_ms: number;
    t_end_ms: number;
    tonic: string;
    mode: "major" | "minor";
    corr: number;
  }>;
  chroma_reliable?: boolean;
  chroma_note?: string;
  /** How the whole-song key was decided (tuning pass 1). */
  key_note?: string;
  range: { low: string; high: string; median: string } | null;
  vocal_range?: { low: string; high: string; median: string } | null;
  notes: NoteEvent[];
  vocal_melody?: NoteEvent[];
  chords: ChordEvent[];
  beats: number[];
  sections: SongSection[];
  section_cues?: import("./sectionCues").SectionCue[];
  section_disagreement?: import("./sectionCues").SectionDisagreement[];
  input_change_receipts?: import("./modeReceipt").InputChangeReceipt[];
  melody: Array<{ t_ms: number; midi: number; name: string }>;
  vocal_regions: Array<{ t_start_ms: number; t_end_ms: number; likelihood: number }>;
  lyrics: {
    source: "none" | "pasted" | "speech" | "published";
    text: string;
    lines: LyricLine[];
  };
  function?: {
    tonic: string | null;
    mode: "major" | "minor" | null;
    degrees: DegreeEvent[];
    mean_tension: number;
    peak_tension: number;
    macro_peak_ms?: number;
    macro_peak?: number;
    /** Peak signed micro-tension delta across degree stream. */
    tension_delta_peak?: number;
    resolutions?: ResolutionEvent[];
    affect?: {
      mean_valence: number;
      mean_arousal: number;
      peak_arousal: number;
      regions: AffectRegion[];
      conflicts?: AffectConflict[];
    };
  };
};

export type HearingMap = {
  schema: "fox-ears-hearing-map-1.1";
  version: "fox-ears-0.3";
  title: string;
  source: {
    kind: "file" | "mic" | "demo";
    name: string;
  };
  duration_ms: number;
  sample_interval_ms: number;
  captured_at: string;
  frames: HearingFrame[];
  objects: SoundObject[];
  conflicts: BindingConflict[];
  graph: SongGraph;
  chart: SongChart;
  painting_png?: string;
  listen?: {
    n: number;
    pass: string;
    song_id: string;
    next?: string;
    why?: string;
  };
  grammar: {
    cue_hierarchy: string[];
    break_conditions: string[];
    persistence_conditions: string[];
    conflict_rule: string;
  };
  transduction?: string;
};

export type VizMode = "paint" | "bars" | "ring" | "field";
export type ThemeId = "bone" | "tide" | "ember" | "split";
export type SourceKind = "none" | "file" | "mic" | "demo";

export const EMPTY_BANDS = (): Bands => ({
  500: 0,
  1000: 0,
  2000: 0,
  4000: 0,
});

export const EMPTY_CHROMA = (): number[] => new Array<number>(12).fill(0);
