/**
 * 2D affect: valence × arousal.
 * Tenderness = low arousal + positive valence.
 *
 * Measured component scores are kept separate; early summing destroys
 * bittersweet conflict (minor down, swell/close-register up). Region labels
 * and BindingConflict-style affect conflicts cite components.
 */

export type AffectComponents = {
  /** minor resting ≈ negative; major / strain against minor modulates */
  mode: number;
  vibrato: number;
  portamento: number;
  swell: number;
  register: number;
  resolution: number;
  high_tension: number;
  harsh_wall: number;
};

export type AffectSample = {
  t_ms: number;
  valence: number; // -1..+1 (signed sum of components, for coarse graphs only)
  arousal: number; // 0..1
  components: AffectComponents;
  features: {
    energy: number;
    onset: number;
    centroid_norm: number;
    high_band: number;
    portamento: number;
    vibrato_depth: number;
    vibrato_rate_hz: number;
    dynamic_slope: number;
    register_gap: number;
    tension: number;
    tension_delta: number;
    pitch_confidence: number;
    mode: "major" | "minor" | null;
    f0_reliable: boolean;
  };
};

export type AffectConflict = {
  t_ms: number;
  kind: "valence";
  statement: string;
  positive: string[];
  negative: string[];
};

export type AffectSummary = {
  mean_valence: number;
  mean_arousal: number;
  peak_arousal: number;
  samples: AffectSample[];
  regions: Array<{ t_ms: number; label: string; cites: string[] }>;
  conflicts: AffectConflict[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function portamentoSemisPerSec(prevHz: number | null, hz: number | null, dtMs: number): number {
  if (!prevHz || !hz || dtMs < 20) return 0;
  const dSemi = hzToMidi(hz) - hzToMidi(prevHz);
  if (Math.abs(dSemi) < 0.15) return 0;
  return (dSemi / dtMs) * 1000;
}

/**
 * Vibrato: need oscillatory sign changes on first difference, not just
 * max-deviation-from-mean (which scores a glide higher than real vibrato).
 */
export function vibratoDepthCents(windowHz: number[]): { depth: number; rate_hz: number } {
  if (windowHz.length < 8) return { depth: 0, rate_hz: 0 };
  const midis = windowHz.filter((h) => h > 0).map(hzToMidi);
  if (midis.length < 8) return { depth: 0, rate_hz: 0 };

  const mean = midis.reduce((a, b) => a + b, 0) / midis.length;
  let maxDev = 0;
  for (const m of midis) maxDev = Math.max(maxDev, Math.abs(m - mean));
  // Large span is a new note or long glide, not vibrato
  if (maxDev > 0.9) return { depth: 0, rate_hz: 0 };

  const diffs: number[] = [];
  for (let i = 1; i < midis.length; i++) diffs.push(midis[i]! - midis[i - 1]!);

  let signChanges = 0;
  let lastSign = 0;
  for (const d of diffs) {
    if (Math.abs(d) < 0.01) continue;
    const s = d > 0 ? 1 : -1;
    if (lastSign && s !== lastSign) signChanges++;
    lastSign = s;
  }

  // Need at least 2 turning points in the window (~one full cycle)
  if (signChanges < 2) return { depth: 0, rate_hz: 0 };

  // Rate: half the sign-change count per window duration (assume ~30ms/sample if unknown)
  const windowSec = Math.max(0.15, midis.length * 0.03);
  const rate = (signChanges / 2) / windowSec;
  // Human vibrato typically ~4–7 Hz; allow 3–9
  if (rate < 2.5 || rate > 10) return { depth: 0, rate_hz: 0 };

  return { depth: maxDev * 100, rate_hz: Math.round(rate * 10) / 10 };
}

export function dynamicSlope(levels: number[]): number {
  if (levels.length < 4) return 0;
  const n = levels.length;
  const a = levels.slice(0, Math.floor(n / 3));
  const b = levels.slice(Math.floor((2 * n) / 3));
  const mean = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / Math.max(1, xs.length);
  return mean(b) - mean(a);
}

function sumComponents(c: AffectComponents): number {
  return (
    c.mode +
    c.vibrato +
    c.portamento +
    c.swell +
    c.register +
    c.resolution +
    c.high_tension +
    c.harsh_wall
  );
}

export function affectRegionLabel(a: AffectSample): { label: string; cites: string[] } {
  const cites: string[] = [];
  const { valence: v, arousal: ar, features: f, components: c } = a;

  // Tenderness: low arousal + positive *evidence*, not crushed energy
  const tenderEvidence =
    c.vibrato > 0.05 || c.register > 0.05 || c.swell > 0.05 || c.portamento > 0.05;
  if (ar < 0.32 && tenderEvidence && (v > 0.08 || c.vibrato + c.register + c.swell > 0.25)) {
    if (c.vibrato > 0.05) cites.push(`vibrato_cents=${f.vibrato_depth}`, `rate_hz=${f.vibrato_rate_hz}`);
    if (c.register > 0.05) cites.push(`close_register=${f.register_gap}`);
    if (c.swell > 0.05) cites.push(`swell=${f.dynamic_slope}`);
    if (c.mode < -0.05) cites.push(`mode=${f.mode}`);
    cites.push(`arousal=${ar.toFixed(2)}`, `valence=${v.toFixed(2)}`);
    return { label: "tender / low-arousal positive", cites };
  }
  if (ar > 0.55 && v > 0.15) {
    cites.push(`valence=${v.toFixed(2)}`, `arousal=${ar.toFixed(2)}`);
    return { label: "lift / high-arousal positive", cites };
  }
  if (ar > 0.5 && v < -0.15) {
    cites.push(`valence=${v.toFixed(2)}`, `arousal=${ar.toFixed(2)}`, `tension=${f.tension}`);
    return { label: "harsh / high-arousal negative", cites };
  }
  // Still only when *no* tender cues — quiet alone is not "nothing"
  if (ar < 0.25 && !tenderEvidence && Math.abs(v) < 0.12) {
    cites.push(`valence=${v.toFixed(2)}`, `arousal=${ar.toFixed(2)}`);
    return { label: "still / low activity", cites };
  }
  // Bittersweet: opposing component signs
  const pos = (["vibrato", "portamento", "swell", "register", "resolution"] as const).filter(
    (k) => c[k] > 0.08,
  );
  const neg = (["mode", "high_tension", "harsh_wall"] as const).filter((k) => c[k] < -0.08);
  if (pos.length && neg.length) {
    cites.push(...pos.map((k) => `${k}=${c[k].toFixed(2)}`), ...neg.map((k) => `${k}=${c[k].toFixed(2)}`));
    return { label: "bittersweet / conflicting valence", cites };
  }
  cites.push(`valence=${v.toFixed(2)}`, `arousal=${ar.toFixed(2)}`);
  return { label: "mixed / transitional", cites };
}

export type FrameLite = {
  t_ms: number;
  energy: number;
  onset: number;
  centroid_hz: number;
  high_band: number;
  pitch_hz: number | null;
  pitch_confidence: number;
  level: number;
  tension: number;
  tension_delta: number;
  melody_midi: number | null;
  bass_midi: number | null;
  mode: "major" | "minor" | null;
};

/**
 * Build affect series. Components are computed independently; valence is their
 * sum only for coarse display. Conflicts preserve disagreement.
 */
export function buildAffect(frames: FrameLite[]): AffectSummary {
  const samples: AffectSample[] = [];
  const pitchWindow: number[] = [];
  const levelWindow: number[] = [];
  let prevPitch: number | null = null;
  let prevT = frames[0]?.t_ms ?? 0;

  for (const f of frames) {
    const dt = Math.max(20, f.t_ms - prevT);
    const f0_reliable = f.pitch_confidence >= 0.45 && f.pitch_hz != null && f.pitch_hz > 0;

    if (f0_reliable && f.pitch_hz) {
      pitchWindow.push(f.pitch_hz);
      if (pitchWindow.length > 14) pitchWindow.shift();
    } else if (pitchWindow.length) {
      // decay unreliable frames so windows don't mix singers/bass
      pitchWindow.shift();
    }

    levelWindow.push(f.level);
    if (levelWindow.length > 16) levelWindow.shift();

    const porta = f0_reliable ? portamentoSemisPerSec(prevPitch, f.pitch_hz, dt) : 0;
    const vib = f0_reliable ? vibratoDepthCents(pitchWindow) : { depth: 0, rate_hz: 0 };
    const slope = dynamicSlope(levelWindow);
    const regGap =
      f.melody_midi != null && f.bass_midi != null ? f.melody_midi - f.bass_midi : 0;
    const centroid_norm = clamp(f.centroid_hz / 4000, 0, 1.5);

    // Arousal: intensity of activity
    const arousal = clamp(
      0.35 * f.energy + 0.25 * f.onset + 0.2 * clamp(centroid_norm, 0, 1) + 0.2 * f.high_band,
      0,
      1,
    );

    // --- Component scores (independent; do not gate the sum) ---
    const components: AffectComponents = {
      mode: 0,
      vibrato: 0,
      portamento: 0,
      swell: 0,
      register: 0,
      resolution: 0,
      high_tension: 0,
      harsh_wall: 0,
    };

    // Mode is recorded as a cue (for citation / REVIEW receipts) but is not
    // added into valence. A gospel remix and a screamed one can share a key
    // and not share a feeling. P1, 2026-11-16, after Veyra's review.
    if (f.mode === "minor") {
      const rest = f.tension <= 3.5 ? 1 : f.tension >= 6.5 ? 0.35 : 0.65;
      components.mode = -0.22 * rest;
    } else if (f.mode === "major") {
      components.mode = f.tension <= 3.5 ? 0.12 : 0.04;
    }
    // Intentionally unused in the sum below.
    const modeCue = components.mode;
    void modeCue;

    // f0 cues only when reliable — quiet tender singing keeps confidence; noise doesn't
    if (f0_reliable) {
      if (vib.depth > 8 && vib.depth < 80 && vib.rate_hz >= 2.5) {
        components.vibrato = 0.22;
      }
      if (Math.abs(porta) > 0.4 && Math.abs(porta) < 8) {
        components.portamento = 0.16;
      }
    }

    // Swell / register do not require f0 — work on quiet material
    if (slope > 0.015 && slope < 0.3) components.swell = 0.14;
    if (regGap > 0 && regGap < 10 && f.energy < 0.4) components.register = 0.18;
    else if (regGap >= 12 && regGap <= 28) components.register = 0.08;

    if (f.tension_delta < -1.2) components.resolution = 0.2;
    if (f.tension >= 7 && f.tension_delta >= -0.3) components.high_tension = -0.28;
    if (f.high_band > 0.55 && f.energy > 0.45 && !f0_reliable) components.harsh_wall = -0.22;
    else if (f.high_band > 0.55 && f.energy > 0.45 && vib.depth < 5) components.harsh_wall = -0.18;

    // Mode stays on the component ledger but is excluded from valence.
    const valence = clamp(sumComponents(components) - components.mode, -1, 1);

    samples.push({
      t_ms: f.t_ms,
      valence: Math.round(valence * 100) / 100,
      arousal: Math.round(arousal * 100) / 100,
      components,
      features: {
        energy: Math.round(f.energy * 1000) / 1000,
        onset: Math.round(f.onset * 1000) / 1000,
        centroid_norm: Math.round(centroid_norm * 100) / 100,
        high_band: Math.round(f.high_band * 1000) / 1000,
        portamento: Math.round(porta * 100) / 100,
        vibrato_depth: Math.round(vib.depth * 10) / 10,
        vibrato_rate_hz: vib.rate_hz,
        dynamic_slope: Math.round(slope * 1000) / 1000,
        register_gap: Math.round(regGap * 10) / 10,
        tension: f.tension,
        tension_delta: f.tension_delta,
        pitch_confidence: Math.round(f.pitch_confidence * 100) / 100,
        mode: f.mode,
        f0_reliable,
      },
    });

    if (f0_reliable) prevPitch = f.pitch_hz;
    else prevPitch = null;
    prevT = f.t_ms;
  }

  // Regions on ~2s boundaries, not 1/24 of song length
  const regions: AffectSummary["regions"] = [];
  let lastRegionT = -99999;
  let lastLabel = "";
  for (const s of samples) {
    if (s.t_ms - lastRegionT < 2000 && lastLabel) continue;
    const r = affectRegionLabel(s);
    if (r.label === lastLabel && s.t_ms - lastRegionT < 8000) continue;
    regions.push({ t_ms: s.t_ms, label: r.label, cites: r.cites });
    lastRegionT = s.t_ms;
    lastLabel = r.label;
  }

  // Affect conflicts: opposing valence components at the same moment
  const conflicts: AffectConflict[] = [];
  let lastConflictT = -99999;
  for (const s of samples) {
    if (s.t_ms - lastConflictT < 1500) continue;
    const pos: string[] = [];
    const neg: string[] = [];
    const c = s.components;
    if (c.vibrato > 0.08) pos.push(`vibrato=${c.vibrato.toFixed(2)}`);
    if (c.portamento > 0.08) pos.push(`portamento=${c.portamento.toFixed(2)}`);
    if (c.swell > 0.08) pos.push(`swell=${c.swell.toFixed(2)}`);
    if (c.register > 0.08) pos.push(`register=${c.register.toFixed(2)}`);
    if (c.resolution > 0.08) pos.push(`resolution=${c.resolution.toFixed(2)}`);
    if (c.mode < -0.08) neg.push(`mode=${c.mode.toFixed(2)}`);
    if (c.high_tension < -0.08) neg.push(`high_tension=${c.high_tension.toFixed(2)}`);
    if (c.harsh_wall < -0.08) neg.push(`harsh_wall=${c.harsh_wall.toFixed(2)}`);
    if (pos.length && neg.length) {
      conflicts.push({
        t_ms: s.t_ms,
        kind: "valence",
        statement: "valence components disagree — bittersweet / unresolved affect",
        positive: pos,
        negative: neg,
      });
      lastConflictT = s.t_ms;
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  // Downsample samples for chart payload
  const step = Math.max(1, Math.floor(samples.length / 80));
  return {
    mean_valence: Math.round(mean(samples.map((s) => s.valence)) * 100) / 100,
    mean_arousal: Math.round(mean(samples.map((s) => s.arousal)) * 100) / 100,
    peak_arousal: samples.length ? Math.max(...samples.map((s) => s.arousal)) : 0,
    samples: samples.filter((_, i) => i % step === 0),
    regions: regions.slice(0, 20),
    conflicts: conflicts.slice(0, 16),
  };
}
