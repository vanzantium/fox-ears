/**
 * BAR BRIEF (P4, 2026-11-21) — the song as text, one line per bar, for an AI
 * listener. Vision models misread spectrograms; text tokens are exact. Each
 * line joins the layers Fox Ears already measured at that bar:
 *
 *   b17 0:42.1 | sec B·chorus | son A(2) | I V vi IV | bass 1→5 | mel 3 2 1 | str .42↑ | vox | riff+5 | "words"
 *
 * Nothing here is new measurement; it is a re-serialisation of the chart.
 * Every field is as SOFT as the layer it came from.
 */
import { fmtTime } from "./score";
import type { SongChart } from "./types";

export const BRIEF_TUNING = {
  maxBars: 96,
  maxChordsPerBar: 3,
  maxMelodyDegrees: 4,
  lyricChars: 40,
  /** Strain change (share of the song's max) that earns an arrow. */
  arrowShare: 0.05,
  /** Phrase rows/columns of the phrase SSM printed in the digest. */
  digestSsmRows: 48,
} as const;

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function barBriefLines(chart: SongChart): string[] {
  const sonar = chart.sonar;
  if (!sonar) return [];
  const lines: string[] = [];
  const tension = new Map((sonar.tension?.bars ?? []).map((b) => [b.bar, b]));
  const maxStrain = sonar.tension?.max.strain || 1;
  const motifByBar = new Map<number, number>();
  for (const h of sonar.motif?.hits ?? []) if (h.bar != null) motifByBar.set(h.bar, h.transpose);
  let prevStrain: number | null = null;
  for (const b of sonar.bars.slice(0, BRIEF_TUNING.maxBars)) {
    const t0 = b.t_start_ms;
    const t1 = b.t_end_ms;
    const parts: string[] = [`b${b.index + 1} ${fmtTime(t0)}`];

    const sec = chart.sections.find((s) => t0 >= s.t_start_ms && t0 < s.t_end_ms);
    if (sec) parts.push(`sec ${sec.label}·${sec.role}`);

    const ph = sonar.phrases.find((p) => b.index >= p.bar && b.index < p.bar + sonar.phrase_bars);
    if (ph) parts.push(`son ${ph.letter}(${ph.occurrence})`);

    const ch: string[] = [];
    for (const c of chart.chords) {
      if (overlaps(t0, t1, c.t_ms, c.t_ms + c.dur_ms) <= 0) continue;
      const tag = c.roman ?? c.symbol;
      if (ch[ch.length - 1] !== tag) ch.push(tag);
    }
    if (ch.length) parts.push(ch.slice(0, BRIEF_TUNING.maxChordsPerBar).join(" "));

    const deg = chart.function?.degrees ?? [];
    const bass = deg.filter((d) => d.layer === "bass" && d.t_ms >= t0 && d.t_ms < t1);
    if (bass.length) {
      const a = bass[0]!.degree;
      const z = bass[bass.length - 1]!.degree;
      parts.push(`bass ${a === z ? a : `${a}→${z}`}`);
    }
    const mel = deg.filter((d) => d.layer === "melody" && d.t_ms >= t0 && d.t_ms < t1);
    if (mel.length) parts.push(`mel ${mel.slice(0, BRIEF_TUNING.maxMelodyDegrees).map((d) => d.degree).join(" ")}`);

    const tb = tension.get(b.index);
    if (tb) {
      let arrow = "→";
      if (prevStrain != null) {
        const d = (tb.strain - prevStrain) / maxStrain;
        if (d > BRIEF_TUNING.arrowShare) arrow = "↑";
        else if (d < -BRIEF_TUNING.arrowShare) arrow = "↓";
      }
      parts.push(`str ${(tb.strain / maxStrain).toFixed(2).replace(/^0/, "")}${arrow}`);
      prevStrain = tb.strain;
    }

    const vox = chart.vocal_regions.reduce((a, v) => a + overlaps(t0, t1, v.t_start_ms, v.t_end_ms), 0);
    if (vox * 2 >= t1 - t0) parts.push("vox");

    if (motifByBar.has(b.index)) {
      const tr = motifByBar.get(b.index)!;
      parts.push(tr === 0 ? "riff" : `riff${tr > 0 ? "+" : ""}${tr}`);
    }

    const lyr = chart.lyrics.lines.find((l) => l.t_ms >= t0 && l.t_ms < t1);
    if (lyr) {
      const txt = lyr.text.length > BRIEF_TUNING.lyricChars ? `${lyr.text.slice(0, BRIEF_TUNING.lyricChars - 1)}…` : lyr.text;
      parts.push(`"${txt}"`);
    }
    lines.push(parts.join(" | "));
  }
  if (sonar.bars.length > BRIEF_TUNING.maxBars) lines.push(`… ${sonar.bars.length - BRIEF_TUNING.maxBars} more bars`);
  return lines;
}

/** The SONAR / TENSION RIBBON / BAR BRIEF blocks of the digest. */
export function sonarDigestLines(chart: SongChart): string[] {
  const s = chart.sonar;
  const out: string[] = ["", "======== SONAR (SOFT · EXPERIMENTAL · UNCALIBRATED) ========"];
  if (!s) {
    out.push("- unmeasured — too short, or no stable harmonic content to compare.");
    return out;
  }
  out.push(`- ${s.caveat}`);
  out.push(
    "Passive echolocation: every bar compared with every other bar (harmony + bass only). Letters are phrases that come back; a prime (A') is a close variant. A second opinion on FORM, never an edit of it.",
    `- meter: ${s.meter.note}`,
    `- loop (shortest cycle that repeats straight away): ${s.loop?.bars ? `${s.loop.bars} bar${s.loop.bars === 1 ? "" : "s"}, covers ${Math.round(s.loop.strength * 100)}% of bars` : "none"}`,
    `- form period (repeat that covers the most bars): ${s.loop?.period_bars ? `${s.loop.period_bars} bars, covers ${Math.round(s.loop.period_strength * 100)}%` : "none"} · letters are ${s.phrase_bars}-bar phrases`,
    `- repetition: ${s.letters || "—"}`,
  );
  const a = s.section_agreement;
  if (a) {
    out.push(
      `- agreement with FORM: ${a.agreed}/${a.boundaries} section cuts have a sonar letter change within ±${(a.tolerance_ms / 1000).toFixed(1)} s`,
    );
    if (a.sonar_only_ms.length) out.push(`    sonar hears a change FORM did not cut: ${a.sonar_only_ms.map(fmtTime).join(", ")}`);
    if (a.section_only_ms.length)
      out.push(`    FORM cut where harmony repeats (energy/vocal change, or over-split): ${a.section_only_ms.map(fmtTime).join(", ")}`);
  }
  const m = s.motif;
  if (m) {
    out.push(
      `- riff (matched filter) from bar ${m.template.bar + 1}, ${m.template.bars} bar${m.template.bars === 1 ? "" : "s"}${m.template.letter ? ` (phrase ${m.template.letter})` : ""}: ${m.hits.length} hit${m.hits.length === 1 ? "" : "s"}, ${m.transposed_hits} transposed`,
    );
    const shown = m.hits.slice(0, 24).map((h) => {
      const where = h.bar != null ? `b${h.bar + 1}${h.on_downbeat ? "" : "~"}` : fmtTime(h.t_ms);
      const tr = h.transpose === 0 ? "" : ` ${h.transpose > 0 ? "+" : ""}${h.transpose}`;
      return `${where}${tr}`;
    });
    if (shown.length) out.push(`    at ${shown.join(", ")}${m.hits.length > 24 ? ", …" : ""}  (~ = off the downbeat; ±n = semitones moved)`);
  }
  if (s.phrase_ssm_rows?.length) {
    out.push(`- phrase self-similarity (0 = unlike, 9 = same; rows and columns are the phrases above, in order):`);
    const rows = s.phrase_ssm_rows.slice(0, BRIEF_TUNING.digestSsmRows);
    rows.forEach((r, i) => {
      const p = s.phrases[i]!;
      out.push(`    ${p.letter.padEnd(3, " ")} ${fmtTime(p.t_start_ms).padStart(6, " ")}  ${r.slice(0, BRIEF_TUNING.digestSsmRows)}`);
    });
    if (s.phrase_ssm_rows.length > rows.length) out.push(`    … ${s.phrase_ssm_rows.length - rows.length} more phrases`);
  }

  out.push("", "TENSION RIBBON (SOFT · spiral array: diameter = spread, momentum = motion, strain = distance from home key)");
  const t = s.tension;
  if (!t) {
    out.push("- unmeasured — needs a key.");
  } else {
    const at = (bar: number | null) => (bar == null ? "—" : `b${bar + 1}`);
    out.push(
      `- key centre: ${t.key} · peak strain ${at(t.peak_strain_bar)} · widest harmony ${at(t.peak_diameter_bar)} · max strain ${t.max.strain}, diameter ${t.max.diameter}, momentum ${t.max.momentum}`,
    );
  }

  out.push("", "BAR BRIEF (SOFT · one line per bar: section | sonar letter(n-th time) | chords | bass | melody degrees | strain | vox | riff | lyric)");
  const lines = barBriefLines(chart);
  if (!lines.length) out.push("- no bars.");
  else out.push(...lines);
  return out;
}
