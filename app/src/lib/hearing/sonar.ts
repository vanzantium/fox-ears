/**
 * SONAR FORM (P4, 2026-11-21) — passive echolocation of a song on itself.
 *
 * Active sonar needs a known ping; a finished recording has none, so Fox Ears
 * cannot "ping" a song. What transfers is sonar's maths: compare the signal
 * with delayed copies of itself. Every bar is held up against every other bar
 * (a self-similarity matrix), and the "echoes" — bars that come back — give the
 * form: repetition letters (A A B A'), the loop length, and a second opinion on
 * the section cuts.
 *
 * STATUS: EXPERIMENTAL, UNCALIBRATED on real songs (thresholds were set on
 * synthetic frames and one planted etude). On Keep Moving (2026-11-21) it
 * missed all four known section cuts, landing ~2 bars early. Never use sonar
 * letters as section boundaries or roles.
 *
 * Everything here is SOFT. It is an ADDITIVE layer: it reads the same 10 ms
 * grid frames, beat grid and sections the chart already has, and it never
 * changes key, tempo, chords or sections. Where it disagrees with form.ts it
 * says so (section_agreement); it does not overrule.
 *
 * Harmony only (chroma + bass chroma). Two sections over the same chord loop
 * are the SAME to this layer even when the energy or the singer changes —
 * that is the point of a second, independent method. form.ts already weighs
 * energy and vocal presence.
 */
import type { HearingFrame, SongSection } from "./types";
import { cos, l2 } from "./vec";
import { findMotif, type MotifReading } from "./motif";
import { spiralTension, type SpiralTension } from "./spiral";

export const SONAR_CAVEAT =
  "EXPERIMENTAL, uncalibrated on real songs. Harmony-only second opinion; never edits or sets section boundaries. Do not read letters as section roles.";

export const SONAR_TUNING = {
  /** Fewer beats than this: no beat grid, fall back to fixed blocks. */
  minBeats: 16,
  /** Block length without a beat grid, ms (4 blocks ≈ one 2 s "bar"). */
  blockMs: 500,
  /** Meter is ASSUMED 4/4 (SOFT). Downbeat phase is estimated, meter is not. */
  beatsPerBar: 4,
  /** Bass chroma weight in the harmonic vector. */
  wBass: 0.6,
  /** A unit is silent when fewer than this share of its frames carry chroma. */
  voicedShare: 0.3,
  /** Frame chroma sum below this is "no pitch content". */
  chromaFloor: 0.05,
  /** Phrase cosine for the same letter / for a primed variant (A'). Provisional, see docs/p4-sonar-log. */
  sameLetter: 0.88,
  variantLetter: 0.72,
  /** Longest loop length searched, bars. */
  loopMaxBars: 16,
  /** A loop's immediate repeats must cover at least this share of the bars. */
  loopMinCover: 0.15,
  /** Stored bar SSM is down-sampled above this many bars. */
  maxSsmBars: 128,
} as const;

export type SonarUnit = {
  t0: number;
  t1: number;
  /** L2-normalised 12-bin chroma (zeros when silent). */
  chroma: number[];
  /** L2-normalised 12-bin bass chroma (zeros when silent). */
  bass: number[];
  /** Mean ear level. */
  energy: number;
  /** Share of frames with the vocal gate on. */
  vocal: number;
  silent: boolean;
};

export type SonarBar = { index: number; t_start_ms: number; t_end_ms: number; u0: number; u1: number };

export type SonarPhrase = {
  index: number;
  /** First bar of the phrase. */
  bar: number;
  t_start_ms: number;
  t_end_ms: number;
  letter: string;
  /** 1 = first time this letter is heard, 2 = second, … */
  occurrence: number;
  /** Cosine to the letter's first instance (1 for the first instance). */
  match: number;
};

export type SectionAgreement = {
  /** Interior section boundaries from form.ts. */
  boundaries: number;
  /** Of those, how many have a sonar letter change within tolerance. */
  agreed: number;
  tolerance_ms: number;
  /** Sonar letter changes with no section boundary near them (possible missed cut). */
  sonar_only_ms: number[];
  /** Section boundaries with no letter change near them (possible over-split, or an energy/vocal-only change). */
  section_only_ms: number[];
};

export type SonarReading = {
  label: "SOFT";
  /** Experimental and uncalibrated on real songs; never feeds section boundaries. */
  status: "experimental-uncalibrated";
  /** Plain-language warning for anyone reading the chart JSON. */
  caveat: string;
  method: string;
  unit: "beat" | "block";
  meter: {
    beats_per_bar: number;
    assumed: true;
    downbeat_phase: number;
    downbeat_margin: number;
    downbeat_clear: boolean;
    note: string;
  };
  bars: SonarBar[];
  /** Riff/chord cycle (bars) and the longer form period; 0 = none. Strengths are bar coverage shares. */
  loop: { bars: number; strength: number; period_bars: number; period_strength: number; by_lag: number[] } | null;
  phrase_bars: number;
  phrases: SonarPhrase[];
  /** Phrase letters in order, space separated: "A A B A' C B". */
  letters: string;
  /** Bar-level self-similarity after path enhancement (repeated runs stand out), quantised 0–9, one string per row. */
  ssm_rows: string[];
  /** Bars per SSM row/column (1 unless the song is longer than maxSsmBars). */
  ssm_step_bars: number;
  /** Phrase-level self-similarity, quantised 0–9, one string per phrase (same order as phrases). */
  phrase_ssm_rows: string[];
  section_agreement: SectionAgreement | null;
  motif: MotifReading | null;
  tension: SpiralTension | null;
  note: string;
};

// ── vector helpers (shared, see vec.ts) ──────────────────────────────────────
export { l2, cos } from "./vec";

/** Harmonic vector of a unit: chroma ⊕ wBass·bass. */
export function harmonicVec(u: SonarUnit, wBass: number = SONAR_TUNING.wBass): number[] {
  return [...u.chroma, ...u.bass.map((x) => x * wBass)];
}

// ── units (beat-synchronous) ────────────────────────────────────────────────

/**
 * Beat-synchronous units from the 10 ms grid frames. Without a usable beat
 * grid, fixed blocks of SONAR_TUNING.blockMs.
 */
export function sonarUnits(frames: HearingFrame[], beats: number[]): { units: SonarUnit[]; unit: "beat" | "block" } {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  let bounds: number[];
  let unit: "beat" | "block";
  if (beats.length >= SONAR_TUNING.minBeats) {
    bounds = beats.filter((b) => b >= 0 && b <= lastT);
    if ((bounds[bounds.length - 1] ?? 0) < lastT) bounds.push(lastT + 1);
    unit = "beat";
  } else {
    bounds = [];
    for (let t = 0; t < lastT; t += SONAR_TUNING.blockMs) bounds.push(t);
    bounds.push(lastT + 1);
    unit = "block";
  }
  const units: SonarUnit[] = [];
  let j = 0;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const t0 = bounds[i]!;
    const t1 = bounds[i + 1]!;
    while (j < frames.length && frames[j]!.t_ms < t0) j++;
    const ch = new Array<number>(12).fill(0);
    const bs = new Array<number>(12).fill(0);
    let e = 0;
    let v = 0;
    let n = 0;
    let voiced = 0;
    let k = j;
    for (; k < frames.length && frames[k]!.t_ms < t1; k++) {
      const f = frames[k]!;
      n++;
      e += ((f.left_ear?.level ?? 0) + (f.right_ear?.level ?? 0)) * 0.5;
      v += f.vocal_gate ? 1 : 0;
      const c = f.chroma;
      const sum = c ? c.reduce((a, x) => a + x, 0) : 0;
      if (c && c.length === 12 && sum >= SONAR_TUNING.chromaFloor) {
        voiced++;
        for (let p = 0; p < 12; p++) ch[p] += (c[p] ?? 0) / sum;
        const b = f.bass_chroma;
        if (b && b.length === 12) for (let p = 0; p < 12; p++) bs[p] += b[p] ?? 0;
      }
    }
    j = k;
    const silent = n === 0 || voiced / Math.max(1, n) < SONAR_TUNING.voicedShare;
    units.push({
      t0,
      t1,
      chroma: silent ? ch.map(() => 0) : l2(ch),
      bass: silent ? bs.map(() => 0) : l2(bs),
      energy: n ? e / n : 0,
      vocal: n ? v / n : 0,
      silent,
    });
  }
  return { units, unit };
}

// ── downbeat phase (meter assumed 4/4) ──────────────────────────────────────

/**
 * Which beat of four starts the bar. Chords tend to change on the downbeat,
 * so the phase whose beats carry the most harmonic change (two beats before vs
 * two beats after) wins. SOFT: a one-chord vamp gives no evidence (margin ≈ 0).
 */
export function downbeatPhase(units: SonarUnit[], beatsPerBar = SONAR_TUNING.beatsPerBar): {
  phase: number;
  margin: number;
  scores: number[];
} {
  const h = units.map((u) => harmonicVec(u));
  const add = (a: number[], b: number[]) => a.map((x, i) => x + (b[i] ?? 0));
  const score = new Array<number>(beatsPerBar).fill(0);
  const count = new Array<number>(beatsPerBar).fill(0);
  for (let i = 2; i + 1 < units.length; i++) {
    if (units[i - 2]!.silent || units[i - 1]!.silent || units[i]!.silent || units[i + 1]!.silent) continue;
    const before = add(h[i - 2]!, h[i - 1]!);
    const after = add(h[i]!, h[i + 1]!);
    const change = 1 - cos(before, after);
    score[i % beatsPerBar]! += change;
    count[i % beatsPerBar]!++;
  }
  const mean = score.map((s, p) => (count[p] ? s / count[p]! : 0));
  const order = mean.map((s, p) => ({ s, p })).sort((a, b) => b.s - a.s);
  const best = order[0] ?? { s: 0, p: 0 };
  const second = order[1] ?? { s: 0, p: 0 };
  const margin = best.s > 1e-9 ? (best.s - second.s) / best.s : 0;
  return { phase: best.p, margin: Math.round(margin * 1000) / 1000, scores: mean.map((s) => Math.round(s * 1000) / 1000) };
}

export function barsFromUnits(units: SonarUnit[], phase: number, beatsPerBar = SONAR_TUNING.beatsPerBar): SonarBar[] {
  const bars: SonarBar[] = [];
  for (let u0 = phase, i = 0; u0 + beatsPerBar <= units.length; u0 += beatsPerBar, i++) {
    const u1 = u0 + beatsPerBar;
    bars.push({ index: i, t_start_ms: units[u0]!.t0, t_end_ms: units[u1 - 1]!.t1, u0, u1 });
  }
  return bars;
}

/**
 * Bar fingerprint: the bar's beat vectors laid end to end (a one-bar time-delay
 * embedding), so I–IV is not the same bar as IV–I.
 */
export function barFeatures(units: SonarUnit[], bars: SonarBar[]): number[][] {
  return bars.map((b) => {
    const v: number[] = [];
    for (let u = b.u0; u < b.u1; u++) v.push(...l2(harmonicVec(units[u]!)));
    return l2(v);
  });
}

export function isSilentBar(units: SonarUnit[], b: SonarBar): boolean {
  let s = 0;
  for (let u = b.u0; u < b.u1; u++) if (units[u]!.silent) s++;
  return s * 2 > b.u1 - b.u0;
}

/** Cosine self-similarity, clamped to [0, 1]. Row-major n×n. */
export function selfSimilarity(feats: number[][]): Float32Array {
  const n = feats.length;
  const s = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    s[i * n + i] = feats[i]!.some((x) => x !== 0) ? 1 : 0;
    for (let j = i + 1; j < n; j++) {
      const c = Math.max(0, cos(feats[i]!, feats[j]!));
      s[i * n + j] = c;
      s[j * n + i] = c;
    }
  }
  return s;
}

/**
 * Loop and form period from immediate repeats. A lag L "repeats straight away"
 * where at least max(L, 3) consecutive bars each match the bar L later — a
 * full cycle followed by itself (that is what a loop is). Two stray identical
 * bars are not a one-bar loop.
 *
 *   loop   — the SHORTEST such lag whose repeats cover at least loopMinCover of
 *            the bars (the riff / chord cycle, e.g. 4)
 *   period — the lag whose repeats cover the MOST bars (the verse+chorus block,
 *            e.g. 16)
 *
 * by_lag is the mean diagonal similarity per lag, for display. Returns
 * bars: 0 when nothing repeats straight away.
 */
export function loopLength(
  ssm: Float32Array,
  n: number,
  maxLag: number = SONAR_TUNING.loopMaxBars,
  same: number = SONAR_TUNING.sameLetter,
): SonarReading["loop"] {
  const top = Math.min(maxLag, Math.floor(n / 2));
  if (top < 1) return null;
  const byLag: number[] = [];
  const cover: number[] = [];
  for (let L = 1; L <= top; L++) {
    let s = 0;
    let c = 0;
    let run = 0;
    let start = 0;
    let full = false;
    const need = Math.max(L, 3);
    const covered = new Uint8Array(n);
    for (let i = 0; i + L < n; i++) {
      const v = ssm[i * n + i + L]!;
      s += v;
      c++;
      if (v >= same) {
        if (run === 0) start = i;
        run++;
        if (run >= need) {
          full = true;
          for (let k = start; k <= i + L && k < n; k++) covered[k] = 1;
        }
      } else run = 0;
    }
    byLag.push(c ? Math.round((s / c) * 1000) / 1000 : 0);
    cover.push(full ? covered.reduce((a, x) => a + x, 0) / n : 0);
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const loopIdx = cover.findIndex((c) => c >= SONAR_TUNING.loopMinCover);
  let periodIdx = -1;
  cover.forEach((c, i) => {
    if (c > 0 && (periodIdx < 0 || c > cover[periodIdx]! + 1e-9)) periodIdx = i;
  });
  return {
    bars: loopIdx >= 0 ? loopIdx + 1 : 0,
    strength: loopIdx >= 0 ? r3(cover[loopIdx]!) : 0,
    period_bars: periodIdx >= 0 ? periodIdx + 1 : 0,
    period_strength: periodIdx >= 0 ? r3(cover[periodIdx]!) : 0,
    by_lag: byLag,
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Repetition letters per phrase (phraseBars bars each). The first phrase that
 * does not match an earlier letter gets a new letter; a close-but-not-equal
 * match gets a prime (A'). Silent phrases are "–".
 */
export function phraseFeature(barFeats: number[][], bar: number, phraseBars: number): number[] {
  const width = barFeats[0]?.length ?? 0;
  const feat: number[] = [];
  for (let k = 0; k < phraseBars; k++) feat.push(...(barFeats[bar + k] ?? new Array<number>(width).fill(0)));
  return feat;
}

/** Phrase × phrase cosine, quantised to digit rows. */
export function phraseSsmRows(barFeats: number[][], phrases: SonarPhrase[], phraseBars: number): string[] {
  const feats = phrases.map((p) => phraseFeature(barFeats, p.bar, phraseBars));
  return feats.map((a, i) =>
    feats
      .map((b, j) => {
        const silentA = phrases[i]!.letter === "–";
        const silentB = phrases[j]!.letter === "–";
        if (silentA || silentB) return silentA && silentB ? "9" : "0";
        return String(Math.min(9, Math.floor(Math.max(0, cos(a, b)) * 9.999)));
      })
      .join(""),
  );
}

export function phraseLetters(
  units: SonarUnit[],
  bars: SonarBar[],
  barFeats: number[][],
  phraseBars: number,
): SonarPhrase[] {
  const phrases: SonarPhrase[] = [];
  const protos: Array<{ letter: string; feat: number[] }> = [];
  const occ = new Map<string, number>();
  for (let b = 0, idx = 0; b < bars.length; b += phraseBars, idx++) {
    const span = bars.slice(b, b + phraseBars);
    if (span.length * 2 < phraseBars) break; // drop a short tail (< half a phrase)
    const silent = span.filter((x) => isSilentBar(units, x)).length * 2 > span.length;
    let letter: string;
    let match = 1;
    if (silent) {
      letter = "–";
    } else {
      const feat = phraseFeature(barFeats, b, phraseBars);
      let bi = -1;
      let bs = -1;
      protos.forEach((p, i) => {
        const c = cos(p.feat, feat);
        if (c > bs) {
          bs = c;
          bi = i;
        }
      });
      if (bi >= 0 && bs >= SONAR_TUNING.sameLetter) {
        letter = protos[bi]!.letter;
        match = bs;
      } else if (bi >= 0 && bs >= SONAR_TUNING.variantLetter) {
        letter = `${protos[bi]!.letter}'`;
        match = bs;
      } else {
        letter = LETTERS[protos.length] ?? `Z${protos.length - 25}`;
        protos.push({ letter, feat });
      }
    }
    const base = letter.replace(/'+$/, "");
    const n = (occ.get(base) ?? 0) + 1;
    occ.set(base, n);
    phrases.push({
      index: idx,
      bar: b,
      t_start_ms: span[0]!.t_start_ms,
      t_end_ms: span[span.length - 1]!.t_end_ms,
      letter,
      occurrence: n,
      match: Math.round(match * 1000) / 1000,
    });
  }
  return phrases;
}

/** Times where the phrase letter (ignoring primes) changes. */
export function letterChanges(phrases: SonarPhrase[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < phrases.length; i++) {
    const a = phrases[i - 1]!.letter.replace(/'+$/, "");
    const b = phrases[i]!.letter.replace(/'+$/, "");
    if (a !== b) out.push(phrases[i]!.t_start_ms);
  }
  return out;
}

export function sectionAgreement(
  phrases: SonarPhrase[],
  sections: SongSection[],
  toleranceMs: number,
): SectionAgreement | null {
  if (!sections.length || !phrases.length) return null;
  const cuts = sections.slice(1).map((s) => s.t_start_ms);
  const changes = letterChanges(phrases);
  const near = (t: number, list: number[]) => list.some((x) => Math.abs(x - t) <= toleranceMs);
  const agreed = cuts.filter((c) => near(c, changes)).length;
  return {
    boundaries: cuts.length,
    agreed,
    tolerance_ms: Math.round(toleranceMs),
    sonar_only_ms: changes.filter((c) => !near(c, cuts)).map(Math.round),
    section_only_ms: cuts.filter((c) => !near(c, changes)).map(Math.round),
  };
}

/**
 * Path enhancement (Müller's diagonal smoothing): each cell becomes the mean
 * similarity along its diagonal over `len` bars, taking the better of the
 * forward and backward window so a stripe keeps its ends. A single bar that
 * happens to match (two G bars in different places) fades; a repeated run of
 * bars becomes a clean stripe. Used for the stored/visual map only — letters
 * and loop length read the raw matrix.
 */
export function pathEnhance(ssm: Float32Array, n: number, len = 4): Float32Array {
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let f = 0;
      let fc = 0;
      let b = 0;
      let bc = 0;
      for (let k = 0; k < len; k++) {
        if (i + k < n && j + k < n) {
          f += ssm[(i + k) * n + j + k]!;
          fc++;
        }
        if (i - k >= 0 && j - k >= 0) {
          b += ssm[(i - k) * n + j - k]!;
          bc++;
        }
      }
      out[i * n + j] = Math.max(fc ? f / fc : 0, bc ? b / bc : 0);
    }
  }
  return out;
}

/** Quantise a bar SSM to digit rows (0–9), down-sampling to at most maxN rows. */
export function ssmDigits(ssm: Float32Array, n: number, maxN: number = SONAR_TUNING.maxSsmBars): { rows: string[]; step: number } {
  const step = Math.max(1, Math.ceil(n / maxN));
  const m = Math.ceil(n / step);
  const rows: string[] = [];
  for (let i = 0; i < m; i++) {
    let row = "";
    for (let j = 0; j < m; j++) {
      let s = 0;
      let c = 0;
      for (let a = i * step; a < Math.min(n, (i + 1) * step); a++) {
        for (let b = j * step; b < Math.min(n, (j + 1) * step); b++) {
          s += ssm[a * n + b]!;
          c++;
        }
      }
      row += String(Math.min(9, Math.floor((c ? s / c : 0) * 9.999)));
    }
    rows.push(row);
  }
  return { rows, step };
}

/**
 * Phrase length for the letters. Four bars unless the loop does not fit a
 * four-bar grid (a 3- or 6-bar loop keeps its own length).
 */
export function phraseBarsFor(loop: SonarReading["loop"]): number {
  const L = loop?.bars ?? 0;
  if (L <= 0) return 4;
  if (L % 4 === 0 || 4 % L === 0) return 4;
  return L <= 8 ? L : 4;
}

export function analyseSonar(
  frames: HearingFrame[],
  beats: number[],
  bpm: number | null,
  sections: SongSection[],
  key: { tonic: string; mode: "major" | "minor" } | null,
): SonarReading | null {
  if (frames.length < 50) return null;
  const { units, unit } = sonarUnits(frames, beats);
  if (units.length < SONAR_TUNING.beatsPerBar * 4) return null;
  const db = downbeatPhase(units);
  const bars = barsFromUnits(units, unit === "beat" ? db.phase : 0);
  if (bars.length < 4) return null;
  const feats = barFeatures(units, bars);
  const ssm = selfSimilarity(feats);
  const n = bars.length;
  const loop = loopLength(ssm, n);
  const phraseBars = phraseBarsFor(loop);
  const phrases = phraseLetters(units, bars, feats, phraseBars);
  const barMs = unit === "beat" && bpm ? (SONAR_TUNING.beatsPerBar * 60000) / bpm : SONAR_TUNING.blockMs * SONAR_TUNING.beatsPerBar;
  const agreement = sectionAgreement(phrases, sections, barMs);
  const digits = ssmDigits(pathEnhance(ssm, n, Math.min(4, phraseBars)), n);
  const motif = findMotif(units, bars, phrases);
  const tension = key ? spiralTension(units, bars, key) : null;
  const clear = unit === "beat" && db.margin >= 0.15;
  const meterNote =
    unit === "beat"
      ? `4/4 assumed; downbeat on beat ${db.phase + 1} of the grid (harmonic-change margin ${db.margin}${clear ? "" : ", weak"})`
      : "no beat grid: 500 ms blocks, 4 per 'bar' (not real bars)";
  return {
    label: "SOFT",
    status: "experimental-uncalibrated",
    caveat: SONAR_CAVEAT,
    method:
      "passive echolocation: bar-level self-similarity of chroma + bass chroma (one-bar time-delay embedding); letters by greedy prototype match",
    unit,
    meter: {
      beats_per_bar: SONAR_TUNING.beatsPerBar,
      assumed: true,
      downbeat_phase: db.phase,
      downbeat_margin: db.margin,
      downbeat_clear: clear,
      note: meterNote,
    },
    bars,
    loop,
    phrase_bars: phraseBars,
    phrases,
    letters: phrases.map((p) => p.letter).join(" "),
    ssm_rows: digits.rows,
    ssm_step_bars: digits.step,
    phrase_ssm_rows: phraseSsmRows(feats, phrases, phraseBars),
    section_agreement: agreement,
    motif,
    tension,
    note: "harmony-only second opinion on form; never edits sections, key or chords",
  };
}
