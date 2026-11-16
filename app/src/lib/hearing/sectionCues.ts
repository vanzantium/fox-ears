/**
 * Section cues as receipts, not hidden overrides. Vocal entry and lyric
 * repetition are available evidence; novelty cuts stay visible when they
 * disagree with those cues.
 */
import type { HearingFrame, LyricLine, SongSection } from "./types";

export type SectionCue = {
  kind: "vocal_entry" | "lyric_repetition" | "novelty_cut";
  t_ms: number;
  source: string;
  used: boolean;
  detail?: string;
};

export type SectionDisagreement = {
  t_ms: number;
  statement: string;
  cues: SectionCue[];
};

export type FormReceipts = {
  sections: SongSection[];
  cues: SectionCue[];
  disagreement: SectionDisagreement[];
};

export function firstSustainedVocal(frames: HearingFrame[], vocalMask?: boolean[]): number | null {
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

/** Repeated lyric lines (normalized) become chorus-like cues at each later start. */
export function lyricRepetitionCues(lines: LyricLine[] | undefined): SectionCue[] {
  if (!lines?.length) return [];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9'\s]+/g, " ").replace(/\s+/g, " ").trim();
  const firstAt = new Map<string, number>();
  const cues: SectionCue[] = [];
  for (const line of lines) {
    const key = norm(line.text);
    if (key.split(" ").length < 4) continue;
    const prev = firstAt.get(key);
    if (prev == null) {
      firstAt.set(key, line.t_ms);
      continue;
    }
    if (line.t_ms - prev < 4000) continue;
    cues.push({
      kind: "lyric_repetition",
      t_ms: line.t_ms,
      source: `lyrics:${line.source}`,
      used: false,
      detail: `repeats line first heard at ${(prev / 1000).toFixed(1)}s: "${key.slice(0, 60)}"`,
    });
  }
  return cues;
}

function nearestCut(sections: SongSection[], t: number): SongSection | null {
  if (!sections.length) return null;
  return sections.reduce((best, s) =>
    Math.abs(s.t_start_ms - t) < Math.abs(best.t_start_ms - t) ? s : best,
  );
}

/**
 * Attach vocal-entry and lyric-repetition cues to an already-cut section list.
 * Does not silently rewrite cuts. A vocal entry far from any novelty boundary
 * is recorded as disagreement; a close one is marked used as corroboration.
 */
export function attachSectionCues(
  sections: SongSection[],
  frames: HearingFrame[],
  opts: { vocalMask?: boolean[]; lyrics?: LyricLine[]; agreeMs?: number } = {},
): FormReceipts {
  const agreeMs = opts.agreeMs ?? 2000;
  const cues: SectionCue[] = sections.slice(1).map((s) => ({
    kind: "novelty_cut" as const,
    t_ms: s.t_start_ms,
    source: "novelty",
    used: true,
    detail: `${s.role} ${s.label}`,
  }));
  const disagreement: SectionDisagreement[] = [];

  const vocalT = firstSustainedVocal(frames, opts.vocalMask);
  if (vocalT != null) {
    const near = nearestCut(sections, vocalT);
    const delta = near ? vocalT - near.t_start_ms : Infinity;
    const used = Math.abs(delta) <= agreeMs;
    const cue: SectionCue = {
      kind: "vocal_entry",
      t_ms: vocalT,
      source: "vocal_mask",
      used,
      detail: used
        ? `agrees with novelty cut at ${((near?.t_start_ms ?? 0) / 1000).toFixed(1)}s`
        : `novelty has no cut within ${agreeMs} ms of vocal entry`,
    };
    cues.unshift(cue);
    if (!used && near) {
      disagreement.push({
        t_ms: vocalT,
        statement: `vocal entry at ${(vocalT / 1000).toFixed(2)}s; nearest novelty cut is ${((near.t_start_ms) / 1000).toFixed(2)}s (${near.role})`,
        cues: [cue, { kind: "novelty_cut", t_ms: near.t_start_ms, source: "novelty", used: true, detail: near.role }],
      });
    }
  }

  const lyricCues = lyricRepetitionCues(opts.lyrics);
  for (const cue of lyricCues) {
    const near = nearestCut(sections, cue.t_ms);
    const used = near != null && Math.abs(cue.t_ms - near.t_start_ms) <= agreeMs;
    const marked = { ...cue, used };
    cues.push(marked);
    if (!used && near) {
      disagreement.push({
        t_ms: cue.t_ms,
        statement: `lyric repetition at ${(cue.t_ms / 1000).toFixed(2)}s; nearest novelty cut is ${((near.t_start_ms) / 1000).toFixed(2)}s (${near.role})`,
        cues: [marked],
      });
    }
  }

  return { sections, cues, disagreement };
}
