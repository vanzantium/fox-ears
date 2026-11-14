import type { HearingFrame, SongSection } from "./types";

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

export function hierarchicalForm(frames: HearingFrame[]): SongSection[] {
  if (frames.length < 12) return [];
  const vecs = windows(frames);
  const cuts = changePoints(frames);
  const lastT = frames[frames.length - 1]?.t_ms ?? 0;

  type Phrase = { t0: number; t1: number; e: number; chroma: number[]; vocal: number };
  const phrases: Phrase[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = vecs[cuts[i]!]!;
    const b = vecs[cuts[i + 1]!] ?? vecs[vecs.length - 1]!;
    const span = frames.filter((f) => f.t_ms >= a.t && f.t_ms <= b.t);
    const chroma = new Array<number>(12).fill(0);
    let e = 0;
    let vocal = 0;
    for (const f of span) {
      e += energyOf(f);
      vocal += f.vocal_gate ? 1 : 0;
      if (f.chroma) for (let k = 0; k < 12; k++) chroma[k] += f.chroma[k] ?? 0;
    }
    const n = Math.max(1, span.length);
    phrases.push({ t0: a.t, t1: b.t, e: e / n, chroma, vocal: vocal / n });
  }

  // Merge tiny phrases into neighbors (< 5.5s) unless both energy and chroma jump.
  const merged: Phrase[] = [];
  for (const p of phrases) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...p });
      continue;
    }
    const dur = p.t1 - p.t0;
    const sim = cosine(prev.chroma, p.chroma);
    const dE = Math.abs(prev.e - p.e);
    if (dur < 5500 && sim > 0.55 && dE < 0.07) {
      prev.t1 = p.t1;
      prev.e = (prev.e + p.e) * 0.5;
      prev.vocal = (prev.vocal + p.vocal) * 0.5;
      for (let k = 0; k < 12; k++) prev.chroma[k] = (prev.chroma[k] ?? 0) + (p.chroma[k] ?? 0);
    } else merged.push({ ...p });
  }
  if (merged[0]) merged[0].t0 = 0;
  const last = merged[merged.length - 1];
  if (last) last.t1 = lastT;

  // Recurrence labels
  const letters = "ABCDEFGH";
  const sigs: number[][] = [];
  const sections: SongSection[] = [];
  for (const p of merged) {
    let label = letters[sigs.length] ?? "X";
    let found = -1;
    for (let i = 0; i < sigs.length; i++) {
      if (cosine(sigs[i]!, p.chroma) > 0.82) {
        found = i;
        break;
      }
    }
    if (found >= 0) label = `${letters[found] ?? "A"}'`;
    else sigs.push(p.chroma.slice());
    sections.push({
      t_start_ms: p.t0,
      t_end_ms: p.t1,
      label,
      energy_mean: Math.round(p.e * 1000) / 1000,
      hypothesis: "phrase",
      role: "phrase",
    });
  }

  const vocalT = firstSustainedVocal(frames);
  return assignRoles(splitAtVocal(sections, vocalT), vocalT);
}

function firstSustainedVocal(frames: HearingFrame[]): number | null {
  let run = 0;
  let t0 = 0;
  for (const f of frames) {
    if (f.vocal_gate && (f.vocal_likelihood ?? 0) >= 0.7) {
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
