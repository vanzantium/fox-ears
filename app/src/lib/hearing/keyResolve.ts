/**
 * Multi-hypothesis key: a recording can have an intro key, a global key, and
 * a cadence key that disagree. Tonic-vs-dominant (a fifth apart) and relative
 * major/minor are first-class ambiguities, not silent profile-winner locks.
 *
 * Cadence / final-chord and unique scale-degree evidence can overturn a
 * dominant-heavy chroma profile. Whole-song bass alone is not enough to keep
 * a dominant as tonic — a D pedal under a G song is common.
 */
import type { HearingFrame, SongChart, SongSection } from "./types";
import { MAJOR_PROFILE, MINOR_PROFILE, PC_NAMES, pearson } from "./sonofield";

export const KEY_TUNING = {
  /** Weight of frames in the intro / first section (a dominant vamp there fooled the old reader). */
  introWeight: 0.3,
  /** If no first section is found, treat this fraction of the song as the intro. */
  introFallbackFrac: 0.1,
  /** A first section longer than this fraction is not treated as an intro. */
  introMaxFrac: 0.25,
  /** Bass chroma (55-180 Hz, mostly fundamentals) mixed into the profile. */
  bassWeight: 0.5,
  /** Fifth-related rivals closer than this (Pearson r) go to tonic-vs-dominant resolution. */
  closeCall: 0.1,
  /** Final window used as a cadence / "home" clue (not a sole decider). */
  cadenceMs: 4000,
} as const;

export const KEY_ROLES = [
  "global_key",
  "intro_key",
  "section_key",
  "cadence_key",
  "dominant_rival",
  "relative",
  "parallel",
] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

export type KeyHypothesis = {
  tonic: string;
  mode: "major" | "minor";
  corr: number;
  role?: KeyRole;
  t_start_ms?: number;
  t_end_ms?: number;
};

export type KeyStatus = "RESOLVED" | "UNRESOLVED";

export type KeyEstimate = {
  key: SongChart["key"];
  status: KeyStatus;
  note: string;
  hypotheses: KeyHypothesis[];
  introEnd: number;
  /** P2: third test, relative check, borrowing vs modulation, SOFT mode tag. */
  detail: KeyDetail;
};

export type RankedKey = { pc: number; mode: "major" | "minor"; corr: number };

export function introEndMs(sections: SongSection[], lastT: number): number {
  const first = sections[0];
  if (first && sections.length > 1 && first.t_end_ms <= lastT * KEY_TUNING.introMaxFrac) {
    return first.t_end_ms;
  }
  return lastT * KEY_TUNING.introFallbackFrac;
}

export function accumulateProfile(
  frames: HearingFrame[],
  opts: { from?: number; until?: number; introEnd?: number } = {},
): { a: number[]; b: number[]; mixed: number[]; n: number } {
  const acc = new Array<number>(12).fill(0);
  const bass = new Array<number>(12).fill(0);
  let n = 0;
  for (const f of frames) {
    if (opts.until != null && f.t_ms >= opts.until) continue;
    if (opts.from != null && f.t_ms < opts.from) continue;
    const ch = f.chroma;
    if (!ch || ch.length !== 12) continue;
    const sum = ch.reduce((s, v) => s + v, 0);
    if (sum < 0.05) continue;
    const w = opts.introEnd != null && f.t_ms < opts.introEnd ? KEY_TUNING.introWeight : 1;
    for (let i = 0; i < 12; i++) acc[i] = (acc[i] ?? 0) + (ch[i] ?? 0) * w;
    const bc = f.bass_chroma;
    if (bc && bc.length === 12) {
      for (let i = 0; i < 12; i++) bass[i] = (bass[i] ?? 0) + (bc[i] ?? 0) * w;
    }
    n++;
  }
  const aSum = acc.reduce((s, v) => s + v, 0);
  const bSum = bass.reduce((s, v) => s + v, 0);
  const a = aSum > 0 ? acc.map((v) => v / aSum) : acc;
  const b = bSum > 0 ? bass.map((v) => v / bSum) : bass;
  const mixed = a.map((v, i) => v + KEY_TUNING.bassWeight * (b[i] ?? 0));
  return { a, b, mixed, n };
}

export function rankKeys(profile: number[]): RankedKey[] {
  const rows: RankedKey[] = [];
  for (let t = 0; t < 12; t++) {
    const shifted = profile.map((_, i) => profile[(i + t) % 12] ?? 0);
    rows.push({ pc: t, mode: "major", corr: pearson(shifted, MAJOR_PROFILE) });
    rows.push({ pc: t, mode: "minor", corr: pearson(shifted, MINOR_PROFILE) });
  }
  return rows.sort((x, y) => y.corr - x.corr);
}

function hyp(r: RankedKey | null, role: KeyRole, span?: { t_start_ms: number; t_end_ms: number }): KeyHypothesis | null {
  if (!r || r.corr < 0.12) return null;
  return {
    tonic: PC_NAMES[r.pc] ?? "C",
    mode: r.mode,
    corr: Math.round(Math.max(0, r.corr) * 100) / 100,
    role,
    ...span,
  };
}

/**
 * Pitch class only the lower key of a fifth pair owns, minus the one only the
 * upper key owns (major: 4 vs #4; minor: b6 vs 6).
 */
export function uniqueDegreeVote(
  a: number[],
  lowerPc: number,
  upperPc: number,
  mode: "major" | "minor",
): { vote: number; own: number } {
  const own =
    mode === "major"
      ? (a[(lowerPc + 5) % 12] ?? 0) - (a[(lowerPc + 6) % 12] ?? 0)
      : (a[(lowerPc + 8) % 12] ?? 0) - (a[(lowerPc + 9) % 12] ?? 0);
  return { vote: own > 0 ? lowerPc : upperPc, own };
}

export function topPc(arr: number[]): number {
  let i = 0;
  for (let k = 1; k < arr.length; k++) if ((arr[k] ?? 0) > (arr[i] ?? 0)) i = k;
  return i;
}

/** Count bass motions from a pitch class onto another (e.g. V → I). */
export function bassMotionCount(frames: HearingFrame[], fromPc: number, toPc: number): number {
  let prev: number | null = null;
  let n = 0;
  for (const f of frames) {
    const bc = f.bass_chroma;
    if (!bc || bc.length !== 12) continue;
    const peak = topPc(bc);
    if ((bc[peak] ?? 0) < 0.2) continue;
    if (prev === fromPc && peak === toPc) n++;
    prev = peak;
  }
  return n;
}

/** Leading-tone (degree 7) resolving to tonic (degree 1) in bass or voiced pitch. */
export function leadingToneResolutions(frames: HearingFrame[], tonicPc: number): number {
  const lead = (tonicPc + 11) % 12;
  let prevBass: number | null = null;
  let prevPitch: number | null = null;
  let n = 0;
  for (const f of frames) {
    const bc = f.bass_chroma;
    if (bc && bc.length === 12) {
      const peak = topPc(bc);
      if ((bc[peak] ?? 0) >= 0.2) {
        if (prevBass === lead && peak === tonicPc) n++;
        prevBass = peak;
      }
    }
    if (f.midi != null && (f.pitch_confidence ?? 0) >= 0.4) {
      const pc = ((f.midi % 12) + 12) % 12;
      if (prevPitch === lead && pc === tonicPc) n++;
      prevPitch = pc;
    }
  }
  return n;
}

/* ------------------------------------------------------------------------ *
 * P2 (2026-11-17): "test the third", relative-key ambiguity, borrowing vs
 * modulation, SOFT mode tag. After Rowan's breakdown of Max Konyi's videos
 * (Drive: Rowan-Note-Max-Konyi-Sonofield-Breakdown-For-Riven-2026-11-17.md).
 * ------------------------------------------------------------------------ */

export const THIRD_TUNING = {
  /** Extra weight on frames whose bass peak is the candidate tonic (home chord). */
  homeBassWeight: 2,
  /** Extra weight on frames in the cadence window. */
  cadenceWeight: 1,
  /** Compensation for overtone leakage into chroma: 3rd harmonic (+7 st) and 5th harmonic (+4 st). */
  leak3: 0.12,
  leak5: 0.12,
  /** Degree weights: 3 vs b3 is strongest, then 6 vs b6, then 7 vs b7 (7 is shared with harmonic minor). */
  w3: 1,
  w6: 0.5,
  w7: 0.25,
  /** |score| needed before the third can overturn the profile's mode. */
  flipMin: 0.12,
  /** The parallel key must be within this Pearson gap of the pick to be overturned. */
  parallelGap: 0.1,
  /** Relative major/minor closer than this (Pearson r) go to relative resolution. */
  relativeClose: 0.1,
  /** A unique-degree (4 vs #4) difference smaller than this abstains instead of voting. */
  degreeMargin: 0.006,
  /** Bars a new tonic must win bass + local key before we call it a modulation. */
  modulationBars: 4,
  /** Share of a bar a non-diatonic degree needs before it counts as borrowed colour. */
  borrowShare: 0.09,
  /** Mode-tag margin (share) for Mixolydian b7 > 7 or Dorian 6 > b6. */
  modeTagMargin: 0.02,
  /**
   * P4: stricter margin for the rarer colours, Lydian #4 > 4 and Phrygian
   * b2 > 2 — a #4 also turns up as a passing V/V, so it must clearly
   * outweigh the natural 4 across the home-weighted song before it is named.
   */
  rareModeTagMargin: 0.035,
} as const;

export type ThirdTest = {
  tonic: string;
  /** Normalised contrasts in [-1, 1]; positive = major degree wins. */
  s3: number;
  s6: number;
  s7: number;
  score: number;
  lean: "major" | "minor" | null;
  frames: number;
};

export type RelativeCheck = {
  major: string;
  minor: string;
  corr_gap: number;
  votes: { major: number; minor: number };
  evidence: string[];
  outcome: "major" | "minor" | "UNRESOLVED";
};

export type KeyChange = { t_start_ms: number; t_end_ms: number; tonic: string; mode: "major" | "minor"; corr: number; bars: number };
export type Borrowing = { degree: string; t_start_ms: number; t_end_ms: number; bars: number; tonic_held: boolean };
export type ModeTag = { name: "Mixolydian" | "Dorian" | "Lydian" | "Phrygian"; why: string; label: "SOFT" };

export type KeyDetail = {
  third_test: ThirdTest | null;
  relative: RelativeCheck | null;
  modulations: KeyChange[];
  borrowing: Borrowing[];
  mode_tag: ModeTag | null;
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Subtract expected overtone leakage so a strong tonic does not fake a major third. */
export function leakCompensate(a: number[]): number[] {
  const out = a.map((v, i) => v - THIRD_TUNING.leak3 * (a[(i + 5) % 12] ?? 0) - THIRD_TUNING.leak5 * (a[(i + 8) % 12] ?? 0));
  return out.map((v) => Math.max(0, v));
}

/** Chroma weighted toward home-chord (bass on tonic) and cadence frames. */
export function homeWeightedChroma(
  frames: HearingFrame[],
  tonicPc: number,
  opts: { cadenceFrom?: number; introEnd?: number } = {},
): { a: number[]; n: number } {
  const acc = new Array<number>(12).fill(0);
  let n = 0;
  for (const f of frames) {
    const ch = f.chroma;
    if (!ch || ch.length !== 12) continue;
    const sum = ch.reduce((s, v) => s + v, 0);
    if (sum < 0.05) continue;
    let w = opts.introEnd != null && f.t_ms < opts.introEnd ? KEY_TUNING.introWeight : 1;
    const bc = f.bass_chroma;
    if (bc && bc.length === 12) {
      const p = topPc(bc);
      if (p === tonicPc && (bc[p] ?? 0) >= 0.2) w += THIRD_TUNING.homeBassWeight;
    }
    if (opts.cadenceFrom != null && f.t_ms >= opts.cadenceFrom) w += THIRD_TUNING.cadenceWeight;
    for (let i = 0; i < 12; i++) acc[i] = (acc[i] ?? 0) + ((ch[i] ?? 0) / sum) * w;
    n++;
  }
  const s = acc.reduce((x, v) => x + v, 0);
  return { a: s > 0 ? acc.map((v) => v / s) : acc, n };
}

function contrast(maj: number, min: number): number {
  const d = maj + min;
  return d > 1e-9 ? (maj - min) / d : 0;
}

/**
 * Max Konyi's "test the third": with the tonic fixed, which third (and sixth,
 * seventh) fits the music more cleanly most of the time, weighted toward the
 * home chord and the cadence.
 */
export function testTheThird(
  frames: HearingFrame[],
  tonicPc: number,
  opts: { cadenceFrom?: number; introEnd?: number } = {},
): ThirdTest {
  const { a: raw, n } = homeWeightedChroma(frames, tonicPc, opts);
  const a = leakCompensate(raw);
  const at = (d: number) => a[(tonicPc + d) % 12] ?? 0;
  const s3 = contrast(at(4), at(3));
  const s6 = contrast(at(9), at(8));
  const s7 = contrast(at(11), at(10));
  const T = THIRD_TUNING;
  const score = (T.w3 * s3 + T.w6 * s6 + T.w7 * s7) / (T.w3 + T.w6 + T.w7);
  const lean = Math.abs(score) < T.flipMin ? null : score > 0 ? "major" : "minor";
  return { tonic: PC_NAMES[tonicPc] ?? "C", s3: r3(s3), s6: r3(s6), s7: r3(s7), score: r3(score), lean, frames: n };
}

/**
 * Relative major/minor share all seven pitch classes, so the profile cannot
 * split them. Use "home" evidence instead: cadence bass and chroma, bass
 * share, V→I in the bass, and harmonic-minor leading tone (#5→6 of the major,
 * 7→1 of the minor).
 */
export function relativeCheck(
  frames: HearingFrame[],
  whole: { a: number[]; b: number[] },
  cadence: { a: number[]; b: number[]; n: number },
  majorPc: number,
  corrGap: number,
): RelativeCheck {
  const minorPc = (majorPc + 9) % 12;
  let maj = 0;
  let min = 0;
  const ev: string[] = [];
  const cb = cadence.n ? topPc(cadence.b) : -1;
  const cc = cadence.n ? topPc(cadence.a) : -1;
  if (cb === majorPc) { maj++; ev.push(`cadence bass ${PC_NAMES[majorPc]}`); }
  if (cb === minorPc) { min++; ev.push(`cadence bass ${PC_NAMES[minorPc]}`); }
  if (cc === majorPc) { maj++; ev.push(`cadence chroma ${PC_NAMES[majorPc]}`); }
  if (cc === minorPc) { min++; ev.push(`cadence chroma ${PC_NAMES[minorPc]}`); }
  const bM = whole.b[majorPc] ?? 0;
  const bm = whole.b[minorPc] ?? 0;
  if (bM > bm * 1.2) { maj++; ev.push(`bass home ${PC_NAMES[majorPc]}`); }
  else if (bm > bM * 1.2) { min++; ev.push(`bass home ${PC_NAMES[minorPc]}`); }
  const vM = bassMotionCount(frames, (majorPc + 7) % 12, majorPc);
  const vm = bassMotionCount(frames, (minorPc + 7) % 12, minorPc);
  if (vM > vm * 1.25 && vM - vm >= 2) { maj++; ev.push(`V→I bass ${PC_NAMES[majorPc]} ${vM}–${vm}`); }
  else if (vm > vM * 1.25 && vm - vM >= 2) { min++; ev.push(`V→I bass ${PC_NAMES[minorPc]} ${vm}–${vM}`); }
  // Harmonic-minor leading tone: raised 7 of the minor (= #5 of the major) is
  // outside the shared set, so its presence (and 7→1 motion) is minor evidence.
  const lead = (minorPc + 11) % 12;
  const leadShare = whole.a[lead] ?? 0;
  const leadRes = leadingToneResolutions(frames, minorPc);
  if (leadShare >= 0.06 && leadShare > (whole.a[(minorPc + 10) % 12] ?? 0) * 0.6 && leadRes >= 2) {
    min++;
    ev.push(`harmonic-minor 7→1 (${PC_NAMES[lead]}→${PC_NAMES[minorPc]} ×${leadRes})`);
  }
  const strongCadence = (cb === majorPc && cc === majorPc) || (cb === minorPc && cc === minorPc);
  let outcome: RelativeCheck["outcome"] = "UNRESOLVED";
  if (strongCadence || Math.abs(maj - min) >= 2) outcome = maj > min ? "major" : min > maj ? "minor" : "UNRESOLVED";
  return {
    major: PC_NAMES[majorPc] ?? "C",
    minor: PC_NAMES[minorPc] ?? "A",
    corr_gap: r3(corrGap),
    votes: { major: maj, minor: min },
    evidence: ev,
    outcome,
  };
}

function scaleOf(pc: number, mode: "major" | "minor"): Set<number> {
  const steps = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return new Set(steps.map((s) => (pc + s) % 12));
}

/** [borrowed step, label, the diatonic step it replaces] */
const BORROW_DEGREES: Record<"major" | "minor", Array<[number, string, number]>> = {
  major: [[3, "b3", 4], [8, "b6", 9], [10, "b7", 11], [6, "#4", 5]],
  minor: [[4, "3", 3], [9, "6", 8], [6, "#4", 5]],
};

/**
 * Borrowed colour vs a real key change. If the tonic stays in the bass while
 * b3 / b6 / b7 / #4 appear briefly, it is modal borrowing ("magic mode").
 * A modulation needs a new tonic to win the bass AND the local key over
 * several consecutive bars, with a pitch class the old key does not own.
 */
export function borrowingVsModulation(
  frames: HearingFrame[],
  tonicPc: number,
  mode: "major" | "minor",
  barMs: number,
): { modulations: KeyChange[]; borrowing: Borrowing[] } {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  if (!(barMs > 0) || lastT < barMs * 2) return { modulations: [], borrowing: [] };
  type Bar = { from: number; until: number; bass: number; local: RankedKey | null; a: number[]; n: number };
  const bars: Bar[] = [];
  for (let t = 0; t < lastT; t += barMs) {
    const p = accumulateProfile(frames, { from: t, until: t + barMs });
    const bassSum = p.b.reduce((s, v) => s + v, 0);
    bars.push({
      from: t,
      until: Math.min(lastT, t + barMs),
      bass: p.n && bassSum > 0 ? topPc(p.b) : -1,
      local: p.n ? (rankKeys(p.mixed)[0] ?? null) : null,
      a: leakCompensate(p.a),
      n: p.n,
    });
  }
  const home = scaleOf(tonicPc, mode);
  const modulations: KeyChange[] = [];
  let i = 0;
  while (i < bars.length) {
    const b = bars[i]!;
    const x = b.local && b.bass === b.local.pc && b.local.pc !== tonicPc ? b.local : null;
    if (!x) { i++; continue; }
    let j = i;
    while (j + 1 < bars.length) {
      const nb = bars[j + 1]!;
      if (nb.bass === x.pc && nb.local?.pc === x.pc) j++;
      else break;
    }
    const len = j - i + 1;
    if (len >= THIRD_TUNING.modulationBars) {
      const run = accumulateProfile(frames, { from: bars[i]!.from, until: bars[j]!.until });
      const rk = rankKeys(run.mixed);
      const top = rk[0];
      const runMode = top && top.pc === x.pc ? top.mode : x.mode;
      const alien = [...scaleOf(x.pc, runMode)].filter((pc) => !home.has(pc));
      const alienShare = alien.reduce((s, pc) => s + (run.a[pc] ?? 0), 0);
      if (top && top.pc === x.pc && alien.length && alienShare >= 0.06) {
        modulations.push({ t_start_ms: bars[i]!.from, t_end_ms: bars[j]!.until, tonic: PC_NAMES[x.pc] ?? "C", mode: runMode, corr: r3(top.corr), bars: len });
      }
    }
    i = j + 1;
  }
  const inMod = (t: number) => modulations.some((m) => t >= m.t_start_ms && t < m.t_end_ms);
  const borrowing: Borrowing[] = [];
  for (const [step, label, home] of BORROW_DEGREES[mode]) {
    const pc = (tonicPc + step) % 12;
    const homePc = (tonicPc + home) % 12;
    let cur: Borrowing | null = null;
    for (const b of bars) {
      const hit =
        b.n > 0 && !inMod(b.from) && (b.a[pc] ?? 0) >= THIRD_TUNING.borrowShare && (b.a[pc] ?? 0) > (b.a[homePc] ?? 0);
      if (hit) {
        if (cur && cur.t_end_ms === b.from) {
          cur.t_end_ms = b.until;
          cur.bars++;
          cur.tonic_held = cur.tonic_held || b.bass === tonicPc;
        } else {
          cur = { degree: label, t_start_ms: b.from, t_end_ms: b.until, bars: 1, tonic_held: b.bass === tonicPc };
          borrowing.push(cur);
        }
      } else {
        cur = null;
      }
    }
  }
  borrowing.sort((x, y) => x.t_start_ms - y.t_start_ms);
  return { modulations, borrowing: borrowing.slice(0, 24) };
}

/** SOFT mode colour only. Never changes the major/minor call. */
export function modeTag(a: number[], tonicPc: number, mode: "major" | "minor"): ModeTag | null {
  const at = (d: number) => a[(tonicPc + d) % 12] ?? 0;
  const m = THIRD_TUNING.modeTagMargin;
  if (mode === "major" && at(10) > at(11) + m) {
    return { name: "Mixolydian", why: `3 with b7 (${(at(10) * 100).toFixed(1)}%) over 7 (${(at(11) * 100).toFixed(1)}%)`, label: "SOFT" };
  }
  if (mode === "minor" && at(9) > at(8) + m) {
    return { name: "Dorian", why: `b3 with 6 (${(at(9) * 100).toFixed(1)}%) over b6 (${(at(8) * 100).toFixed(1)}%)`, label: "SOFT" };
  }
  // P4 (2026-11-21): the two remaining common colours, checked only when the
  // first two did not fire, with a stricter margin. Still SOFT and still never
  // changes the major/minor call.
  const r = THIRD_TUNING.rareModeTagMargin;
  if (mode === "major" && at(6) > at(5) + r) {
    return { name: "Lydian", why: `3 with #4 (${(at(6) * 100).toFixed(1)}%) over 4 (${(at(5) * 100).toFixed(1)}%)`, label: "SOFT" };
  }
  if (mode === "minor" && at(1) > at(2) + r) {
    return { name: "Phrygian", why: `b3 with b2 (${(at(1) * 100).toFixed(1)}%) over 2 (${(at(2) * 100).toFixed(1)}%)`, label: "SOFT" };
  }
  return null;
}

export function estimateKeyDetailed(
  frames: HearingFrame[],
  sections: SongChart["sections"] = [],
  opts: { barMs?: number } = {},
): KeyEstimate {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const introEnd = introEndMs(sections, lastT);
  const whole = accumulateProfile(frames, { introEnd });
  const ranked = rankKeys(whole.mixed);
  const top = ranked[0];
  const emptyDetail: KeyDetail = { third_test: null, relative: null, modulations: [], borrowing: [], mode_tag: null };
  const empty: KeyEstimate = { key: null, status: "UNRESOLVED", note: "no voiced chroma", hypotheses: [], introEnd, detail: emptyDetail };
  if (!top || top.corr < 0.12 || whole.n === 0) return empty;

  const intro = accumulateProfile(frames, { until: introEnd });
  const cadenceFrom = Math.max(0, lastT - KEY_TUNING.cadenceMs);
  const cadence = accumulateProfile(frames, { from: cadenceFrom });
  const introH = hyp(rankKeys(intro.mixed)[0] ?? null, "intro_key", { t_start_ms: 0, t_end_ms: introEnd });
  const cadenceH = hyp(rankKeys(cadence.mixed)[0] ?? null, "cadence_key", { t_start_ms: cadenceFrom, t_end_ms: lastT });

  const sectionHyps: KeyHypothesis[] = [];
  for (const s of sections) {
    const p = accumulateProfile(frames, { from: s.t_start_ms, until: s.t_end_ms });
    const h = hyp(rankKeys(p.mixed)[0] ?? null, "section_key", { t_start_ms: s.t_start_ms, t_end_ms: s.t_end_ms });
    if (h) sectionHyps.push(h);
  }

  let pick = top;
  let status: KeyStatus = "RESOLVED";
  let note = "duration-weighted chroma + bass, intro discounted";
  let fifthCounterpart: RankedKey | null = null;

  for (const d of [-7, 7]) {
    const altPc = (top.pc + d + 12) % 12;
    const alt = ranked.find((r) => r.pc === altPc && r.mode === top.mode);
    if (!alt || top.corr - alt.corr >= KEY_TUNING.closeCall) continue;
    fifthCounterpart = alt;
    const lower = d === -7 ? altPc : top.pc;
    const upper = (lower + 7) % 12;
    const degreeRaw = uniqueDegreeVote(whole.a, lower, upper, top.mode);
    // 4 vs #4 (major) / b6 vs 6 (minor) is a tie-breaker: a near-zero
    // difference abstains rather than casting a coin-flip vote.
    const degree = {
      vote: Math.abs(degreeRaw.own) >= THIRD_TUNING.degreeMargin ? degreeRaw.vote : -1,
      own: degreeRaw.own,
    };
    const cadenceBass = cadence.n ? topPc(cadence.b) : -1;
    const cadenceChroma = cadence.n ? topPc(cadence.a) : -1;
    const cadenceAgrees = (pc: number) =>
      (cadenceBass === pc && cadenceChroma === pc) ||
      (cadenceBass === pc && cadenceChroma !== upper && cadenceChroma !== lower) ||
      (cadenceChroma === pc && cadenceBass !== upper && cadenceBass !== lower);

    const vToI = {
      [lower]: bassMotionCount(frames, upper, lower) + leadingToneResolutions(frames, lower),
      [upper]: bassMotionCount(frames, (upper + 7) % 12, upper) + leadingToneResolutions(frames, upper),
    };

    const votes = (pc: number) => {
      let v = 0;
      if (degree.vote === pc) v += 1;
      if (cadenceBass === pc) v += 1;
      if (cadenceChroma === pc) v += 1;
      if ((vToI[pc] ?? 0) > (vToI[pc === lower ? upper : lower] ?? 0)) v += 1;
      return v;
    };
    const lowerVotes = votes(lower);
    const upperVotes = votes(upper);

    // Whole-song bass often follows a dominant pedal; it is a clue, not a veto.
    // Overturn or confirm using scale-degree + cadence/"home" evidence.
    // "Home" must be the unique-degree vote AND a real cadence landing
    // (bass and chroma of the last window), not a single late chord.
    const agreedHome =
      degree.vote === lower && cadenceBass === lower && cadenceChroma === lower
        ? lower
        : degree.vote === upper && cadenceBass === upper && cadenceChroma === upper
          ? upper
          : null;

    if (agreedHome != null) {
      pick = agreedHome === altPc ? alt : top;
      status = "RESOLVED";
      note = `tonic-vs-dominant: ${PC_NAMES[agreedHome]} over ${PC_NAMES[agreedHome === lower ? upper : lower]} (scale-degree and cadence/home tests agree)`;
    } else if (lowerVotes >= upperVotes + 2) {
      pick = lower === altPc ? alt : top;
      status = "RESOLVED";
      note = `tonic-vs-dominant: ${PC_NAMES[lower]} over ${PC_NAMES[upper]} on cadence/degree votes ${lowerVotes}–${upperVotes}`;
    } else if (upperVotes >= lowerVotes + 2) {
      pick = upper === altPc ? alt : top;
      status = "RESOLVED";
      note = `tonic-vs-dominant: ${PC_NAMES[upper]} over ${PC_NAMES[lower]} on cadence/degree votes ${upperVotes}–${lowerVotes}`;
    } else {
      status = "UNRESOLVED";
      // Prefer the candidate the cadence and unique degrees lean toward; otherwise keep the profile winner as a preferred reading.
      const lean = lowerVotes > upperVotes ? lower : upperVotes > lowerVotes ? upper : pick.pc;
      pick = lean === altPc ? alt : lean === top.pc ? top : pick;
      note = `tonic-vs-dominant: ${PC_NAMES[lower]} vs ${PC_NAMES[upper]} UNRESOLVED (degree ${degree.vote >= 0 ? PC_NAMES[degree.vote] : "abstain"}, cadence bass ${cadenceBass >= 0 ? PC_NAMES[cadenceBass] : "—"}, chroma ${cadenceChroma >= 0 ? PC_NAMES[cadenceChroma] : "—"}); preferred ${PC_NAMES[pick.pc]}`;
    }
    break;
  }

  const fifthDecided = fifthCounterpart != null;
  const cadenceFromMs = Math.max(0, lastT - KEY_TUNING.cadenceMs);
  let relative: RelativeCheck | null = null;
  let relativeAlt: RankedKey | null = null;

  // Relative major/minor: same seven pitch classes, so decide on "home".
  {
    const relPc0 = pick.mode === "major" ? (pick.pc + 9) % 12 : (pick.pc + 3) % 12;
    const relR = ranked.find((r) => r.pc === relPc0 && r.mode !== pick.mode);
    if (relR && Math.abs(pick.corr - relR.corr) < THIRD_TUNING.relativeClose) {
      const majorPc = pick.mode === "major" ? pick.pc : relR.pc;
      relative = relativeCheck(frames, whole, cadence, majorPc, pick.corr - relR.corr);
      const majorR = pick.mode === "major" ? pick : relR;
      const minorR = pick.mode === "minor" ? pick : relR;
      const tag = `relative major/minor: ${relative.major} vs ${relative.minor}m`;
      const ev = relative.evidence.length ? relative.evidence.join(", ") : "no cadence/bass/leading-tone evidence";
      if (relative.outcome === "major" || relative.outcome === "minor") {
        const chosen = relative.outcome === "major" ? majorR : minorR;
        relativeAlt = chosen === pick ? relR : pick;
        if (chosen !== pick && !fifthDecided) {
          pick = chosen;
          note = `${tag} → ${PC_NAMES[chosen.pc]} ${chosen.mode} (${ev}); was profile ${PC_NAMES[relativeAlt.pc]} ${relativeAlt.mode}`;
        } else if (!fifthDecided) {
          note = `${tag} → ${PC_NAMES[chosen.pc]} ${chosen.mode} (${ev})`;
        }
      } else {
        status = "UNRESOLVED";
        const lean = relative.votes.major > relative.votes.minor ? majorR : relative.votes.minor > relative.votes.major ? minorR : pick;
        relativeAlt = lean === pick ? relR : pick;
        if (!fifthDecided) pick = lean;
        note = `${fifthDecided ? note + "; " : ""}${tag} UNRESOLVED (votes ${relative.votes.major}–${relative.votes.minor}; ${ev}); preferred ${PC_NAMES[pick.pc]} ${pick.mode}`;
      }
    }
  }

  // Test the third: tonic fixed, which third / sixth / seventh fits the home chord.
  const third = testTheThird(frames, pick.pc, { cadenceFrom: cadenceFromMs, introEnd });
  if (third.lean && third.lean !== pick.mode) {
    const parallel = ranked.find((r) => r.pc === pick.pc && r.mode === third.lean);
    if (parallel && pick.corr - parallel.corr < THIRD_TUNING.parallelGap) {
      const was = `${PC_NAMES[pick.pc]} ${pick.mode}`;
      pick = parallel;
      note = `${note}; test the third: ${PC_NAMES[pick.pc]} ${pick.mode} over ${was} (3/b3 ${third.s3}, 6/b6 ${third.s6}, 7/b7 ${third.s7})`;
    } else {
      note = `${note}; third test leans ${third.lean} (score ${third.score}) but profile gap too wide, kept ${pick.mode}`;
    }
  }

  let parallelAlt: RankedKey | null = null;
  if (!third.lean) {
    const par = ranked.find((r) => r.pc === pick.pc && r.mode !== pick.mode);
    if (par && pick.corr - par.corr < THIRD_TUNING.parallelGap / 2) {
      parallelAlt = par;
      status = "UNRESOLVED";
      note = `${note}; parallel major/minor: ${PC_NAMES[pick.pc]} ${pick.mode} vs ${par.mode} UNRESOLVED (third test can't split it: 3/b3 ${third.s3}, 6/b6 ${third.s6}, 7/b7 ${third.s7}); preferred ${pick.mode}`;
    }
  }

  const barMs = opts.barMs && opts.barMs > 500 && opts.barMs < 8000 ? opts.barMs : 2000;
  const bvm = borrowingVsModulation(frames, pick.pc, pick.mode, barMs);
  const tag = modeTag(leakCompensate(homeWeightedChroma(frames, pick.pc, { cadenceFrom: cadenceFromMs, introEnd }).a), pick.pc, pick.mode);
  if (bvm.modulations.length) {
    note = `${note}; modulation: ${bvm.modulations.map((m) => `${m.tonic} ${m.mode} ${(m.t_start_ms / 1000).toFixed(0)}–${(m.t_end_ms / 1000).toFixed(0)} s`).join(", ")}`;
  }
  const heldBorrow = bvm.borrowing.filter((b) => b.tonic_held && b.bars < THIRD_TUNING.modulationBars);
  if (heldBorrow.length) {
    const deg = [...new Set(heldBorrow.map((b) => b.degree))].join("/");
    note = `${note}; modal borrowing ${deg} over a held tonic (not a key change)`;
  }
  if (tag) note = `${note}; mode colour ${tag.name} (SOFT)`;
  const detail: KeyDetail = { third_test: third, relative, modulations: bvm.modulations, borrowing: bvm.borrowing, mode_tag: tag };

  const hypotheses: KeyHypothesis[] = [];
  const global = hyp(pick, "global_key");
  if (global) hypotheses.push(global);
  if (introH) hypotheses.push(introH);
  if (cadenceH) hypotheses.push(cadenceH);
  // Fifth-related rival: the close-call counterpart if we had one, else V of the pick.
  const vOfPick = ranked.find((r) => r.pc === (pick.pc + 7) % 12 && r.mode === pick.mode);
  const rivalSrc = fifthCounterpart && fifthCounterpart.pc !== pick.pc ? fifthCounterpart : vOfPick;
  const rivalH = hyp(rivalSrc ?? null, "dominant_rival");
  if (rivalH) hypotheses.push(rivalH);
  const relPc = pick.mode === "major" ? (pick.pc + 9) % 12 : (pick.pc + 3) % 12;
  const rel = ranked.find((r) => r.pc === relPc && r.mode !== pick.mode);
  const relH = hyp(rel ?? { pc: relPc, mode: pick.mode === "major" ? "minor" : "major", corr: pick.corr * 0.9 }, "relative");
  if (relH) hypotheses.push(relH);
  const parH = hyp(parallelAlt, "parallel");
  if (parH) hypotheses.push(parH);
  for (const h of sectionHyps) hypotheses.push(h);
  for (const m of bvm.modulations) {
    hypotheses.push({ tonic: m.tonic, mode: m.mode, corr: m.corr, role: "section_key", t_start_ms: m.t_start_ms, t_end_ms: m.t_end_ms });
  }

  return {
    key: {
      tonic: PC_NAMES[pick.pc] ?? "C",
      mode: pick.mode,
      confidence: Math.round(Math.max(0, pick.corr) * 100) / 100,
    },
    status,
    note,
    hypotheses,
    introEnd,
    detail,
  };
}
