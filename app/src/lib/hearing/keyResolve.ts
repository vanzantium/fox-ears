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

export function estimateKeyDetailed(
  frames: HearingFrame[],
  sections: SongChart["sections"] = [],
): KeyEstimate {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const introEnd = introEndMs(sections, lastT);
  const whole = accumulateProfile(frames, { introEnd });
  const ranked = rankKeys(whole.mixed);
  const top = ranked[0];
  const empty: KeyEstimate = { key: null, status: "UNRESOLVED", note: "no voiced chroma", hypotheses: [], introEnd };
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
    const degree = uniqueDegreeVote(whole.a, lower, upper, top.mode);
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
      note = `tonic-vs-dominant: ${PC_NAMES[lower]} vs ${PC_NAMES[upper]} UNRESOLVED (degree ${PC_NAMES[degree.vote]}, cadence bass ${cadenceBass >= 0 ? PC_NAMES[cadenceBass] : "—"}, chroma ${cadenceChroma >= 0 ? PC_NAMES[cadenceChroma] : "—"}); preferred ${PC_NAMES[pick.pc]}`;
    }
    break;
  }

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
  for (const h of sectionHyps) hypotheses.push(h);

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
  };
}
