import type { HearingFrame, SongSection, SectionSchema } from "./types";

function cosine(a: number[], b: number[]): number {
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    n += (a[i] ?? 0) * (b[i] ?? 0);
    da += (a[i] ?? 0) ** 2;
    db += (b[i] ?? 0) ** 2;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : n / d;
}

function energyOf(f: HearingFrame) {
  return (f.left_ear.level + f.right_ear.level) * 0.5;
}

type Vec = { t: number; e: number; chroma: number[]; vocal: number };

function windows(frames: HearingFrame[]): Vec[] {
  const dt = Math.max(40, (frames[1]?.t_ms ?? 80) - (frames[0]?.t_ms ?? 0));
  const win = Math.max(8, Math.round(2500 / dt));
  const hop = Math.max(3, Math.floor(win / 2));
  const vecs: Vec[] = [];
  for (let i = 0; i < frames.length; i += hop) {
    const slice = frames.slice(i, i + win);
    if (!slice.length) continue;
    const chroma = new Array<number>(12).fill(0);
    let e = 0;
    let vocal = 0;
    for (const f of slice) {
      e += energyOf(f);
      vocal += f.vocal_gate ? 1 : f.vocal_likelihood ?? 0;
      if (f.chroma) for (let k = 0; k < 12; k++) chroma[k] += f.chroma[k] ?? 0;
    }
    vecs.push({ t: slice[0]!.t_ms, e: e / slice.length, chroma, vocal: vocal / slice.length });
  }
  return vecs;
}

/** Raw change points — keep these, then merge into phrases/sections. */
export function changePoints(frames: HearingFrame[]): number[] {
  const vecs = windows(frames);
  const cuts = [0];
  for (let i = 1; i < vecs.length; i++) {
    const a = vecs[i - 1]!;
    const b = vecs[i]!;
    const dChroma = 1 - cosine(a.chroma, b.chroma);
    const dE = Math.abs(a.e - b.e);
    const dV = Math.abs(a.vocal - b.vocal);
    if (dChroma > 0.32 || dE > 0.055 || dV > 0.28) cuts.push(i);
  }
  cuts.push(Math.max(0, vecs.length - 1));
  return [...new Set(cuts)].sort((a, b) => a - b);
}

/**
 * Section-boundary tuning (tuning pass 1, 2026-11-14). Boundaries come from
 * a Foote checkerboard novelty curve over a beat-synchronous self-similarity
 * matrix (chroma, bass chroma, band energy + level, vocal presence), instead
 * of thresholded jumps between neighbouring 2.5 s windows.
 */
export const FORM_TUNING = {
  /** Kernel half-width in beats (2 bars of 4/4). */
  kernelBeats: 8,
  /** Minimum section length in beats (4 bars). */
  minBeats: 16,
  /** Peaks below this fraction of the strongest novelty peak are ignored. */
  peakFrac: 0.4,
  /** Block length when no tempo is known, ms. */
  fallbackBlockMs: 600,
  /** Feature-group weights in the similarity matrix. */
  wChroma: 1,
  wBass: 0.5,
  wEnergy: 1,
  wVocal: 1,
  /** Same-letter recurrence threshold (cosine of section chroma). */
  recurrence: 0.82,
  /** Segments whose mean feature vectors match at this cosine share a label for block merging. */
  segmentMatch: 0.6,
  /** Adjacent segments with harmony cosine at or above this fold into one section. */
  adjacentMatch: 0.7,
  /** A merged block may not exceed this many beats (16 bars of 4/4). */
  maxMergeBeats: 64,
} as const;

function unitBounds(frames: HearingFrame[], bpm: number | null, beats: number[]): number[] {
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  if (bpm && beats.length >= 16) {
    const out = beats[0]! > 0 ? [0, ...beats] : beats.slice();
    if ((out[out.length - 1] ?? 0) < lastT) out.push(lastT + 1);
    return out;
  }
  const out: number[] = [];
  for (let t = 0; t < lastT; t += FORM_TUNING.fallbackBlockMs) out.push(t);
  out.push(lastT + 1);
  return out;
}

function centreNormalize(rows: number[][]): number[][] {
  if (!rows.length) return rows;
  const d = rows[0]!.length;
  const mean = new Array<number>(d).fill(0);
  for (const r of rows) for (let k = 0; k < d; k++) mean[k]! += (r[k] ?? 0) / rows.length;
  return rows.map((r) => {
    const c = r.map((v, k) => v - (mean[k] ?? 0));
    const n = Math.sqrt(c.reduce((a, v) => a + v * v, 0)) || 1;
    return c.map((v) => v / n);
  });
}

type Novelty = {
  /** Unit (beat or block) start times, plus the end. */
  bounds: number[];
  /** Per-unit combined, weighted feature vector (centred, unit-norm groups). */
  feats: number[][];
  /** Chosen boundary unit indices, ascending, and their novelty. */
  cuts: number[];
  strength: number[];
};

function noveltyAnalysis(
  frames: HearingFrame[],
  bpm: number | null,
  beats: number[],
  vocalMask?: boolean[],
): Novelty | null {
  const bounds = unitBounds(frames, bpm, beats);
  const units = bounds.length - 1;
  if (units < FORM_TUNING.kernelBeats * 2 + 2) return null;
  const chroma: number[][] = [];
  const bass: number[][] = [];
  const energy: number[][] = [];
  const vocal: number[][] = [];
  let fi = 0;
  for (let u = 0; u < units; u++) {
    const t0 = bounds[u]!;
    const t1 = bounds[u + 1]!;
    const c = new Array<number>(12).fill(0);
    const b = new Array<number>(12).fill(0);
    const e = [0, 0, 0, 0, 0];
    let v = 0;
    let n = 0;
    while (fi < frames.length && frames[fi]!.t_ms < t0) fi++;
    let j = fi;
    while (j < frames.length && frames[j]!.t_ms < t1) {
      const f = frames[j]!;
      for (let k = 0; k < 12; k++) {
        c[k]! += f.chroma?.[k] ?? 0;
        b[k]! += f.bass_chroma?.[k] ?? 0;
      }
      e[0]! += (f.left_ear.bands[500] + f.right_ear.bands[500]) / 2;
      e[1]! += (f.left_ear.bands[1000] + f.right_ear.bands[1000]) / 2;
      e[2]! += (f.left_ear.bands[2000] + f.right_ear.bands[2000]) / 2;
      e[3]! += (f.left_ear.bands[4000] + f.right_ear.bands[4000]) / 2;
      e[4]! += energyOf(f) * 4;
      v += (vocalMask ? vocalMask[j] : f.vocal_gate) ? 1 : 0;
      n++;
      j++;
    }
    const k = Math.max(1, n);
    chroma.push(c.map((x) => x / k));
    bass.push(b.map((x) => x / k));
    energy.push(e.map((x) => x / k));
    vocal.push([v / k, 1 - v / k]);
  }
  const C = centreNormalize(chroma);
  const B = centreNormalize(bass);
  const E = centreNormalize(energy);
  const V = centreNormalize(vocal);
  const wsum = FORM_TUNING.wChroma + FORM_TUNING.wBass + FORM_TUNING.wEnergy + FORM_TUNING.wVocal;
  const sim = (a: number, b: number) => {
    const dot = (x: number[][]) => {
      let s = 0;
      const xa = x[a]!;
      const xb = x[b]!;
      for (let k = 0; k < xa.length; k++) s += (xa[k] ?? 0) * (xb[k] ?? 0);
      return s;
    };
    return (
      (FORM_TUNING.wChroma * dot(C) + FORM_TUNING.wBass * dot(B) + FORM_TUNING.wEnergy * dot(E) + FORM_TUNING.wVocal * dot(V)) /
      wsum
    );
  };
  const L = FORM_TUNING.kernelBeats;
  const nov = new Array<number>(units).fill(0);
  for (let i = 0; i < units; i++) {
    let acc = 0;
    for (let a = -L; a < L; a++) {
      for (let b = -L; b < L; b++) {
        const ia = Math.max(0, Math.min(units - 1, i + a));
        const ib = Math.max(0, Math.min(units - 1, i + b));
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        const ga = Math.exp(-(((a + 0.5) / (L * 0.5)) ** 2));
        const gb = Math.exp(-(((b + 0.5) / (L * 0.5)) ** 2));
        acc += sign * ga * gb * sim(ia, ib);
      }
    }
    nov[i] = Math.max(0, acc);
  }
  const maxNov = Math.max(...nov);
  const wv = (x: number[][], w: number) => x.map((r) => r.map((v) => v * Math.sqrt(w / wsum)));
  const parts = [wv(C, FORM_TUNING.wChroma), wv(B, FORM_TUNING.wBass), wv(E, FORM_TUNING.wEnergy), wv(V, FORM_TUNING.wVocal)];
  const feats = C.map((_, u) => parts.flatMap((g) => g[u]!));
  if (maxNov <= 0) return { bounds, feats, cuts: [], strength: [] };
  const peaks: number[] = [];
  for (let i = 1; i < units - 1; i++) {
    if (nov[i]! >= nov[i - 1]! && nov[i]! > nov[i + 1]!) peaks.push(i);
  }
  peaks.sort((a, b) => nov[b]! - nov[a]!);
  const chosen: number[] = [];
  for (const i of peaks) {
    if (nov[i]! < FORM_TUNING.peakFrac * maxNov) break;
    if (i < FORM_TUNING.minBeats / 2 || units - i < FORM_TUNING.minBeats / 2) continue;
    if (chosen.every((c) => Math.abs(c - i) >= FORM_TUNING.minBeats)) chosen.push(i);
  }
  chosen.sort((a, b) => a - b);
  return { bounds, feats, cuts: chosen, strength: chosen.map((i) => nov[i]! / maxNov) };
}

/** Novelty-based boundaries in ms (excluding 0 and the end), before block merging. */
export function noveltyBoundaries(
  frames: HearingFrame[],
  bpm: number | null,
  beats: number[],
  vocalMask?: boolean[],
): number[] {
  const nv = noveltyAnalysis(frames, bpm, beats, vocalMask);
  return nv ? nv.cuts.map((i) => nv.bounds[i]!) : [];
}

/**
 * Segments between novelty cuts, labelled by similarity of their mean
 * feature vectors, then merged where a pair of neighbours repeats in the same
 * order later in the song (verse-a + verse-b ... verse-a + verse-b). Merges go
 * weakest internal boundary first and stop at maxMergeBeats, so phrase-level
 * cuts fold into sections without folding a verse into its chorus.
 */
export function sectionCuts(
  frames: HearingFrame[],
  bpm: number | null,
  beats: number[],
  vocalMask?: boolean[],
): { cuts: number[]; labels: number[] } {
  const nv = noveltyAnalysis(frames, bpm, beats, vocalMask);
  if (!nv) return { cuts: [], labels: [] };
  const units = nv.bounds.length - 1;
  type Seg = { u0: number; u1: number; strength: number };
  let segs: Seg[] = [];
  const edges = [0, ...nv.cuts, units];
  for (let i = 0; i < edges.length - 1; i++) {
    segs.push({ u0: edges[i]!, u1: edges[i + 1]!, strength: i === 0 ? 1 : nv.strength[i - 1]! });
  }
  // Labels use harmony only (chroma + bass): a repeated verse keeps its
  // chords even when the arrangement around it changes.
  const sig = (sg: Seg) => {
    const d = 24;
    const m = new Array<number>(d).fill(0);
    for (let u = sg.u0; u < sg.u1; u++) for (let k = 0; k < d; k++) m[k]! += nv.feats[u]![k] ?? 0;
    return m;
  };
  const labelsOf = (list: Seg[]) => {
    const sigs = list.map(sig);
    const labels: number[] = [];
    const reps: number[] = [];
    sigs.forEach((v, i) => {
      const hit = reps.find((r) => cosine(sigs[r]!, v) >= FORM_TUNING.segmentMatch);
      if (hit !== undefined) labels.push(labels[hit]!);
      else {
        reps.push(i);
        labels.push(reps.length - 1);
      }
    });
    return labels;
  };
  for (let guard = 0; guard < 32; guard++) {
    const labels = labelsOf(segs);
    let best = -1;
    for (let i = 0; i + 1 < segs.length; i++) {
      const len = segs[i + 1]!.u1 - segs[i]!.u0;
      if (len > FORM_TUNING.maxMergeBeats) continue;
      let repeats = false;
      for (let j = 0; j + 1 < segs.length; j++) {
        if (Math.abs(j - i) < 2) continue;
        if (labels[j] === labels[i] && labels[j + 1] === labels[i + 1]) repeats = true;
      }
      if (!repeats) continue;
      if (best < 0 || segs[i + 1]!.strength < segs[best + 1]!.strength) best = i;
    }
    if (best < 0) {
      // No repeated pair left: fold adjacent segments that carry the same
      // harmony (one section split by an arrangement change).
      const sg = segs.map(sig);
      for (let i = 0; i + 1 < segs.length; i++) {
        if (segs[i + 1]!.u1 - segs[i]!.u0 > FORM_TUNING.maxMergeBeats) continue;
        if (i === 0 || i + 2 === segs.length) continue; // keep intro / outro edges
        if (cosine(sg[i]!, sg[i + 1]!) < FORM_TUNING.adjacentMatch) continue;
        if (best < 0 || segs[i + 1]!.strength < segs[best + 1]!.strength) best = i;
      }
      if (best < 0) break;
      segs = [
        ...segs.slice(0, best),
        { u0: segs[best]!.u0, u1: segs[best + 1]!.u1, strength: segs[best]!.strength },
        ...segs.slice(best + 2),
      ];
      continue;
    }
    const pat = [labels[best], labels[best + 1]];
    const next: Seg[] = [];
    for (let i = 0; i < segs.length; i++) {
      if (i + 1 < segs.length && labels[i] === pat[0] && labels[i + 1] === pat[1] && segs[i + 1]!.u1 - segs[i]!.u0 <= FORM_TUNING.maxMergeBeats) {
        next.push({ u0: segs[i]!.u0, u1: segs[i + 1]!.u1, strength: segs[i]!.strength });
        i++;
      } else next.push(segs[i]!);
    }
    segs = next;
  }
  return { cuts: segs.slice(1).map((sg) => nv.bounds[sg.u0]!), labels: labelsOf(segs) };
}

export function hierarchicalForm(
  frames: HearingFrame[],
  bpm: number | null = null,
  beats: number[] = [],
  vocalMask?: boolean[],
): { sections: SongSection[]; section_schema: SectionSchema } {
  if (frames.length < 12) {
    return {
      sections: [],
      section_schema: {
        label: "SOFT",
        bars: 8,
        snap_unit_bars: 2,
        bar_ms: null,
        applied: false,
        note: "too few frames for form (SOFT)",
      },
    };
  }
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;
  const sc = sectionCuts(frames, bpm, beats, vocalMask);
  const vocal = vocalRuns(frames, vocalMask);
  let cuts = [0, ...sc.cuts, lastT];
  let schema: SectionSchema = {
    label: "SOFT",
    bars: 8,
    snap_unit_bars: 2,
    bar_ms: null,
    applied: false,
    note: "tempo not locked; 8-bar pop schema not applied (SOFT)",
  };
  if (bpm && bpm > 0) {
    const snapped = snapCutsToSchema(cuts, bpm, lastT, vocal, beats);
    cuts = snapped.cuts;
    schema = {
      label: "SOFT",
      bars: 8,
      snap_unit_bars: 2,
      bar_ms: snapped.bar_ms,
      applied: true,
      note: snapped.note,
    };
  }

  type Phrase = { t0: number; t1: number; e: number; chroma: number[]; vocal: number };
  const merged: Phrase[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i]!;
    const t1 = cuts[i + 1]!;
    const chroma = new Array<number>(12).fill(0);
    let e = 0;
    let vocal = 0;
    let n = 0;
    frames.forEach((f, j) => {
      if (f.t_ms < t0 || f.t_ms >= t1) return;
      e += energyOf(f);
      vocal += (vocalMask ? vocalMask[j] : f.vocal_gate) ? 1 : 0;
      if (f.chroma) for (let k = 0; k < 12; k++) chroma[k] += f.chroma[k] ?? 0;
      n++;
    });
    const d = Math.max(1, n);
    merged.push({ t0, t1, e: e / d, chroma, vocal: vocal / d });
  }

  // Recurrence labels: harmony-signature clusters from sectionCuts when the
  // novelty path ran, else the legacy chroma-sum cosine.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const sigs: number[][] = [];
  const seen = new Set<number>();
  const sections: SongSection[] = [];
  merged.forEach((p, idx) => {
    let label: string;
    const cl = sc.labels.length === merged.length ? sc.labels[idx] : undefined;
    if (cl !== undefined) {
      label = (letters[cl] ?? "X") + (seen.has(cl) ? "'" : "");
      seen.add(cl);
    } else {
      label = letters[sigs.length] ?? "X";
      let found = -1;
      for (let i = 0; i < sigs.length; i++) {
        if (cosine(sigs[i]!, p.chroma) > FORM_TUNING.recurrence) {
          found = i;
          break;
        }
      }
      if (found >= 0) label = `${letters[found] ?? "A"}'`;
      else sigs.push(p.chroma.slice());
    }
    sections.push({
      t_start_ms: p.t0,
      t_end_ms: p.t1,
      label,
      energy_mean: Math.round(p.e * 1000) / 1000,
      hypothesis: "phrase",
      role: "phrase",
    });
  });

  // P1: vocal entry is an explicit cue attached in attachSectionCues, not a
  // hidden rewrite of novelty cuts. assignRoles may still *label* an intro
  // using the vocal time; it does not move boundaries.
  const vocalT = firstSustainedVocal(frames, vocalMask);
  const rolled = assignRoles(sections, vocalT);
  const joined = mergeOverSplitSections(rolled, vocal, bpm);
  return { sections: joined, section_schema: schema };
}

function firstSustainedVocal(frames: HearingFrame[], vocalMask?: boolean[]): number | null {
  let run = 0;
  let t0 = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const on = vocalMask ? vocalMask[i] : f.vocal_gate && (f.vocal_likelihood ?? 0) >= 0.7;
    if (on) {
      if (!run) t0 = f.t_ms;
      run++;
      if (run >= 6) return t0;
    } else run = 0;
  }
  return null;
}

function splitAtVocal(sections: SongSection[], vocalT: number | null): SongSection[] {
  if (vocalT === null || !sections.length) return sections;
  const first = sections[0]!;
  const dur = first.t_end_ms - first.t_start_ms;
  if (vocalT < first.t_start_ms + 8000) return sections;
  if (vocalT > first.t_end_ms - 2500) return sections;
  if (dur < 18000) return sections;
  return [
    { ...first, t_end_ms: vocalT, label: first.label },
    { ...first, t_start_ms: vocalT, label: `${first.label}v`, energy_mean: first.energy_mean },
    ...sections.slice(1),
  ];
}

function assignRoles(sections: SongSection[], vocalT: number | null): SongSection[] {
  if (!sections.length) return sections;
  const mean = sections.reduce((a, s) => a + s.energy_mean, 0) / sections.length;
  const max = Math.max(...sections.map((s) => s.energy_mean));
  const last = sections.length - 1;
  let verseI = -1;
  let chorusI = -1;
  return sections.map((s, i) => {
    const dur = s.t_end_ms - s.t_start_ms;
    let role: SongSection["role"] = "phrase";
    if (i === last && s.energy_mean <= mean && i > 0) role = "outro";
    else if (i === 0 && (vocalT === null || s.t_end_ms <= vocalT + 800)) role = "intro";
    else if (verseI < 0 && dur >= 6000) {
      role = "verse";
      verseI = i;
    } else if (chorusI < 0 && verseI >= 0 && i > verseI && dur >= 5500 && s.energy_mean >= (sections[verseI]?.energy_mean ?? 0) * 0.98) {
      role = "chorus";
      chorusI = i;
    } else if (dur < 7000) role = "phrase";
    else if (s.label.includes("'") && s.energy_mean >= max * 0.86) role = "chorus";
    else if (s.energy_mean >= max * 0.9 && i !== verseI) role = "chorus";
    else if (s.energy_mean < mean * 0.8 && i > 0 && i < last) role = "bridge";
    else role = "verse";

    const name =
      role === "intro"
        ? "Intro"
        : role === "outro"
          ? "Outro"
          : role === "chorus"
            ? `Chorus ${s.label}`
            : role === "bridge"
              ? `Bridge ${s.label}`
              : role === "phrase"
                ? `Phrase ${s.label}`
                : `Verse ${s.label}`;
    return {
      ...s,
      role,
      hypothesis: `${name} · named from sustained vocal + recurrence/energy (cuts unchanged)`,
    };
  });
}

/** Sustained vocal runs used to avoid cutting through a line. */
export function vocalRuns(
  frames: HearingFrame[],
  vocalMask?: boolean[],
): Array<{ t0: number; t1: number }> {
  const runs: Array<{ t0: number; t1: number }> = [];
  let t0: number | null = null;
  let last = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    last = f.t_ms;
    const on = vocalMask ? Boolean(vocalMask[i]) : Boolean(f.vocal_gate);
    if (on) {
      if (t0 == null) t0 = f.t_ms;
    } else if (t0 != null) {
      runs.push({ t0, t1: f.t_ms });
      t0 = null;
    }
  }
  if (t0 != null) runs.push({ t0, t1: last });
  return runs;
}

function throughVocal(t: number, runs: Array<{ t0: number; t1: number }>, marginMs = 300): { t0: number; t1: number } | null {
  for (const r of runs) {
    if (t > r.t0 + marginMs && t < r.t1 - marginMs) return r;
  }
  return null;
}

function nearestGapEdge(t: number, runs: Array<{ t0: number; t1: number }>, maxMs: number): number | null {
  const edges: number[] = [];
  for (const r of runs) {
    edges.push(r.t0, r.t1);
  }
  let best: number | null = null;
  let bestD = Infinity;
  for (const e of edges) {
    const d = Math.abs(e - t);
    if (d < bestD && d <= maxMs) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function vocalGapAt(
  boundary: number,
  runs: Array<{ t0: number; t1: number }>,
  minGapMs = 400,
): boolean {
  for (let i = 0; i < runs.length - 1; i++) {
    const g0 = runs[i]!.t1;
    const g1 = runs[i + 1]!.t0;
    if (g1 - g0 >= minGapMs && boundary >= g0 - 80 && boundary <= g1 + 80) return true;
  }
  return false;
}

/**
 * Once tempo is locked, snap internal cuts to a 2-bar unit of an 8-bar pop
 * schema (SOFT). Cuts that fall through an ongoing vocal are moved to the
 * nearest vocal gap or dropped.
 */
export function snapCutsToSchema(
  cuts: number[],
  bpm: number,
  durationMs: number,
  vocal: Array<{ t0: number; t1: number }>,
  beats: number[] = [],
): { cuts: number[]; bar_ms: number; note: string } {
  const barMs = (4 * 60000) / bpm;
  const unitMs = 2 * barMs;
  const phase = beats[0] != null && beats[0] >= 0 && beats[0] < barMs ? beats[0] : 0;
  const minSpan = barMs; // don't leave slivers shorter than a bar
  const snapped = [0];
  const internal = [...new Set(cuts)].filter((c) => c > 250 && c < durationMs - 250).sort((a, b) => a - b);
  for (const raw of internal) {
    let t = raw;
    if (throughVocal(t, vocal)) {
      const edge = nearestGapEdge(t, vocal, 2000);
      if (edge == null) continue;
      t = edge;
    }
    const k = Math.round((t - phase) / unitMs);
    const grid = phase + k * unitMs;
    if (grid > 250 && grid < durationMs - 250 && Math.abs(grid - t) <= barMs) {
      t = grid;
    }
    if (throughVocal(t, vocal)) {
      const edge = nearestGapEdge(t, vocal, 2000);
      if (edge == null || throughVocal(edge, vocal)) continue;
      t = edge;
    }
    const prev = snapped[snapped.length - 1]!;
    if (t - prev < minSpan) continue;
    snapped.push(t);
  }
  if (durationMs - (snapped[snapped.length - 1] ?? 0) < minSpan && snapped.length > 1) snapped.pop();
  if ((snapped[snapped.length - 1] ?? 0) < durationMs) snapped.push(durationMs);
  return {
    cuts: snapped,
    bar_ms: Math.round(barMs * 10) / 10,
    note: `internal cuts snapped to a 2-bar unit of an 8-bar pop schema (${Math.round(barMs)} ms/bar), avoiding mid-vocal cuts; schema labeled SOFT`,
  };
}

function verseFamily(role: SongSection["role"]): boolean {
  return role === "verse" || role === "phrase" || role === "bridge" || role === "section";
}

function mergeRole(a: SongSection, b: SongSection): SongSection["role"] {
  const rank: Record<SongSection["role"], number> = {
    outro: 5,
    chorus: 4,
    verse: 3,
    bridge: 2,
    intro: 1,
    section: 1,
    phrase: 0,
  };
  return (rank[b.role] ?? 0) > (rank[a.role] ?? 0) ? b.role : a.role;
}

/**
 * Merge over-split neighbours that share a role family and have no vocal gap
 * at the boundary (so a long verse is not three short ones).
 */
export function mergeOverSplitSections(
  sections: SongSection[],
  vocal: Array<{ t0: number; t1: number }>,
  bpm: number | null = null,
): SongSection[] {
  if (sections.length < 2) return sections;
  const barMs = bpm && bpm > 0 ? (4 * 60000) / bpm : 2000;
  const maxMergeMs = (a: SongSection, b: SongSection): number => {
    const bothChorus = a.role === "chorus" && b.role === "chorus";
    // Choruses are typically 8 bars; do not let one chorus swallow the next
    // verse and chorus into a 40-bar block. Verses may run longer.
    if (bothChorus) return 12 * barMs;
    return 32 * barMs;
  };
  const canMerge = (a: SongSection, b: SongSection): boolean => {
    if (a.role === "intro" || b.role === "intro") return false;
    const verseVerse = verseFamily(a.role) && verseFamily(b.role);
    const same = a.role === b.role;
    const outroTail =
      (a.role === "outro" && (verseFamily(b.role) || b.role === "outro")) ||
      (b.role === "outro" && (verseFamily(a.role) || a.role === "outro"));
    if ((a.role === "verse" && b.role === "chorus") || (a.role === "chorus" && b.role === "verse")) return false;
    if ((a.role === "chorus" && b.role === "outro") || (a.role === "outro" && b.role === "chorus")) return false;
    if (!(same || verseVerse || outroTail)) return false;
    if (vocalGapAt(a.t_end_ms, vocal, 400)) return false;
    if (b.t_end_ms - a.t_start_ms > maxMergeMs(a, b)) return false;
    return true;
  };
  const out: SongSection[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    if (prev && canMerge(prev, s)) {
      const role = mergeRole(prev, s);
      const name =
        role === "outro"
          ? "Outro"
          : role === "chorus"
            ? `Chorus ${prev.label}`
            : role === "bridge"
              ? `Bridge ${prev.label}`
              : role === "phrase"
                ? `Phrase ${prev.label}`
                : `Verse ${prev.label}`;
      out[out.length - 1] = {
        ...prev,
        t_end_ms: s.t_end_ms,
        label: prev.label,
        energy_mean: Math.round(((prev.energy_mean + s.energy_mean) / 2) * 1000) / 1000,
        role,
        hypothesis: `${name} · merged over-split neighbours (no vocal gap; 8-bar schema SOFT)`,
      };
    } else {
      out.push(s);
    }
  }
  return out;
}
