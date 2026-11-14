import type { HearingMap, SongChart } from "./types";
import { emptyChart, fmtTime, formatChordChart } from "./score";

function leanWord(v: number): string {
  if (v > 0.18) return "left";
  if (v < -0.18) return "right";
  if (v > 0.06) return "slight-left";
  if (v < -0.06) return "slight-right";
  return "center";
}

function chartOf(map: HearingMap): SongChart {
  return map.chart ?? emptyChart();
}

export function digestMap(map: HearingMap): string {
  const chart = chartOf(map);
  const g = map.graph;
  const peakI = g.energy.reduce((bi, v, i, arr) => (v > (arr[bi] ?? 0) ? i : bi), 0);
  const meanE =
    g.energy.length === 0 ? 0 : g.energy.reduce((a, b) => a + b, 0) / g.energy.length;
  const meanS =
    g.spatial.length === 0 ? 0 : g.spatial.reduce((a, b) => a + b, 0) / g.spatial.length;
  const onsetRate =
    map.duration_ms > 0
      ? g.onset.filter((v) => v > 0.18).length / (map.duration_ms / 1000)
      : 0;

  const keyLine = chart.key
    ? `${chart.key.tonic} ${chart.key.mode} (conf ${chart.key.confidence.toFixed(2)})`
    : "unmeasured";
  const tempoLine = chart.tempo_note
    ? `${chart.tempo_note} (conf ${chart.tempo_confidence.toFixed(2)})`
    : chart.tempo_bpm
      ? `${chart.tempo_bpm} BPM (conf ${chart.tempo_confidence.toFixed(2)})`
      : "unmeasured";
  const rangeLine = chart.range
    ? `${chart.range.low} – ${chart.range.high} (median ${chart.range.median})`
    : "unmeasured";

  const lines: string[] = [
    "FOX EARS PROSTHETIC HEARING BRIEF",
    "Read like a guitar tab, then like a Sonofield session: SKELETON (key, tempo, form, roman chords, lyrics), then FUNCTION (scale-degree feeling-states, tension), then LAYERS (melody, field).",
    "",
    `schema: ${map.schema}`,
    `title: ${map.title}`,
    `source: ${map.source.kind} · ${map.source.name}`,
    `duration: ${fmtTime(map.duration_ms)} (${map.duration_ms}ms)`,
    `frames: ${map.frames.length} @ ${map.sample_interval_ms}ms`,
    `painting: ${map.painting_png ? "captured" : "none"}`,
    map.listen
      ? `listen: ${map.listen.n} · ${map.listen.pass} · next ${map.listen.next ?? "?"} (${map.listen.why ?? ""})`
      : "listen: 1 · orientation (no jukebox history yet)",
    "repeat of the same digital file is not independent evidence.",
    "",
    "======== SKELETON ========",
    `key: ${keyLine}`,
    `key hypotheses: ${
      chart.key_hypotheses?.length
        ? chart.key_hypotheses.map((k) => `${k.tonic} ${k.mode} ${k.corr.toFixed(2)}`).join(" · ")
        : "—"
    }`,
    `chroma: ${chart.chroma_reliable === false ? chart.chroma_note ?? "UNRELIABLE" : chart.chroma_note ?? "ok"}`,
    `tempo: ${tempoLine}`,
    `dominant_f0 range: ${rangeLine}`,
    `vocal range: ${
      chart.vocal_range ? `${chart.vocal_range.low} – ${chart.vocal_range.high}` : "ungated / none"
    }`,
    "",
    "FORM",
  ];

  if (chart.sections.length === 0) {
    lines.push("- unmeasured — field too short or too even to cut.");
  } else {
    for (const s of chart.sections) {
      lines.push(
        `- [${s.role}] ${s.label}  ${fmtTime(s.t_start_ms)}–${fmtTime(s.t_end_ms)}  Eμ=${s.energy_mean.toFixed(3)}  ${s.hypothesis}`,
      );
    }
  }

  lines.push("", "CHORD CHART (roman = function against the virtual tonic; letters = measured roots)", formatChordChart(chart));

  const fn = chart.function;
  lines.push("", "======== FUNCTION (Sonofield) ========");
  if (!fn?.tonic) {
    lines.push("- virtual tonic unmeasured — field too short or too even.");
  } else {
    lines.push(`- virtual tonic: ${fn.tonic} ${fn.mode ?? ""}`);
    if (fn.macro_peak_ms !== undefined) {
      lines.push(
        `- MACRO tension peak (energy/onset/register/vocal): ${fmtTime(fn.macro_peak_ms)}  score ${fn.macro_peak ?? 0}`,
      );
    }
    lines.push(`- MICRO mean degree-tension: ${fn.mean_tension}   peak: ${fn.peak_tension}  (1 = home, 10 = tritone/#4; mode-relative)`);
    if (fn.tension_delta_peak != null) {
      lines.push(`- MICRO tension delta peak: ${fn.tension_delta_peak}  (signed change; resolution is the process)`);
    }
    if (fn.resolutions?.length) {
      lines.push("- resolution events (tense → stable):");
      for (const r of fn.resolutions.slice(0, 12)) {
        lines.push(
          `    ${fmtTime(r.t_ms)}  ^${r.from_degree}→^${r.to_degree}  drop ${r.drop} over ${r.delay_ms}ms  (${r.layer})`,
        );
      }
    }
    if (fn.affect) {
      lines.push(
        `- AFFECT valence ${fn.affect.mean_valence} · arousal ${fn.affect.mean_arousal} (peak ${fn.affect.peak_arousal})  [components measured; labels INTERPRETED]`,
      );
      for (const reg of fn.affect.regions.slice(0, 10)) {
        lines.push(`    ${fmtTime(reg.t_ms)}  ${reg.label}  ← ${reg.cites.join(", ")}`);
      }
      if (fn.affect.conflicts?.length) {
        lines.push("- AFFECT conflicts (valence components disagree — do not average away):");
        for (const c of fn.affect.conflicts.slice(0, 8)) {
          lines.push(
            `    ${fmtTime(c.t_ms)}  +[${c.positive.join("; ")}]  vs  −[${c.negative.join("; ")}]`,
          );
        }
      }
    }
    lines.push("- melody degrees (feeling-state of each stable pitch vs tonic):");
    const mel = fn.degrees.filter((d) => d.layer === "melody").slice(0, 40);
    for (const d of mel) {
      lines.push(`    ${fmtTime(d.t_ms)}  ^${d.degree.padEnd(3, " ")}  T=${d.tension.toFixed(1)}  ${d.feeling}`);
    }
    if (fn.degrees.filter((d) => d.layer === "melody").length > 40) {
      lines.push(`    … ${fn.degrees.filter((d) => d.layer === "melody").length - 40} more`);
    }
    const bass = fn.degrees.filter((d) => d.layer === "bass").slice(0, 16);
    if (bass.length) {
      lines.push("- bass degrees:");
      for (const d of bass) lines.push(`    ${fmtTime(d.t_ms)}  ^${d.degree}  ${d.feeling}`);
    }
  }
  lines.push(
    "- stems are HPSS (harmonic/percussive median split) + bass band + vocal gate — not HTDemucs weights.",
    "- MICRO tension is mode-relative degree vs tonic. MACRO tension is energy/register/density — the climax curve.",
    "- tension delta and resolution events are the process; static table lookup is not enough.",
    "- affect is valence×arousal from energy/onset/centroid/portamento/vibrato/register gap — not a single tension axis.",
    "- feeling-strings are INTERPRETED labels; prefer citing measured tension/stable/valence/arousal.",
  );

  lines.push("", "LYRICS");
  if (chart.lyrics.source === "none" || (!chart.lyrics.text && chart.lyrics.lines.length === 0)) {
    lines.push("- none attached. Do not invent words.");
    if (chart.vocal_regions.length) {
      lines.push("- voice-like occupancy (no words):");
      for (const v of chart.vocal_regions.slice(0, 12)) {
        lines.push(
          `    ${fmtTime(v.t_start_ms)}–${fmtTime(v.t_end_ms)}  likelihood ${v.likelihood.toFixed(2)}`,
        );
      }
    }
  } else {
    lines.push(`- source: ${chart.lyrics.source} (quote only these lines; they are not generated)`);
    if (chart.lyrics.lines.length) {
      for (const l of chart.lyrics.lines.slice(0, 80)) {
        lines.push(`    [${fmtTime(l.t_ms)}] ${l.text}`);
      }
    } else {
      lines.push(chart.lyrics.text.slice(0, 4000));
    }
  }

  lines.push("", "======== LAYERS ========", "", "DOMINANT_F0_TRACK (any pitched occupancy — guitar, bass, voice)");
  if (chart.notes.length === 0) {
    lines.push("- no stable pitched events crossed confidence.");
  } else {
    const slice = chart.notes.slice(0, 80);
    for (const n of slice) {
      lines.push(
        `- ${n.name.padEnd(4, " ")}  ${fmtTime(n.t_ms)}  ${n.dur_ms}ms  ${Math.round(n.hz)}Hz  conf ${n.confidence.toFixed(2)}`,
      );
    }
    if (chart.notes.length > 80) lines.push(`- … ${chart.notes.length - 80} more`);
  }

  lines.push("", "VOCAL_MELODY (only where vocal gate agrees; not the guitar)");
  const vm = chart.vocal_melody ?? [];
  if (!vm.length) {
    lines.push("- no gated vocal melody. Intro guitar is not labeled as voice.");
  } else {
    for (const n of vm.slice(0, 40)) {
      lines.push(`- ${n.name}  ${fmtTime(n.t_ms)}  ${n.dur_ms}ms  ${n.degree ? "^" + n.degree : ""}`);
    }
  }

  lines.push("", "FIELD SUMMARY");
  lines.push(`- mean energy: ${meanE.toFixed(3)}`);
  lines.push(`- peak energy: ${(g.energy[peakI] ?? 0).toFixed(3)} at ${fmtTime(g.t_ms[peakI] ?? 0)}`);
  lines.push(`- spatial bias: ${leanWord(meanS)} (${meanS.toFixed(3)}, +left / −right)`);
  lines.push(`- onset density: ${onsetRate.toFixed(2)} /s`);
  lines.push(`- objects: ${map.objects.length}  conflicts: ${map.conflicts.length}`);

  lines.push("", "OBJECTS (arrangement occupancy)");
  if (map.objects.length === 0) lines.push("- none — field stayed below occupancy.");
  for (const o of map.objects) {
    const hops =
      o.hops.length === 0
        ? "no hop"
        : o.hops.map((h) => `hop ${h.from}→${h.to} @${fmtTime(h.t_ms)}`).join("; ");
    lines.push(
      `- ${o.id}  ${fmtTime(o.t_start_ms)}–${fmtTime(o.t_end_ms)}  band ${o.birth_band}→${o.dominant_band}  ${leanWord(o.spatial_start)}→${leanWord(o.spatial_end)}  Eμ=${o.energy_mean.toFixed(2)}  ${hops}  ${o.concurrent ? "concurrent" : "solo"}`,
    );
    lines.push(`    ${o.cue.evidence}`);
  }

  lines.push("", "CONFLICTS");
  if (map.conflicts.length === 0) lines.push("- none recorded.");
  for (const c of map.conflicts) {
    lines.push(`- ${fmtTime(c.t_ms)} [${c.kind}] ${c.statement}`);
    lines.push(`    dominant: ${c.dominant}`);
    lines.push(`    alternative: ${c.alternative}`);
  }

  lines.push(
    "",
    "INSTRUCTION TO A LANGUAGE MODEL",
    "This is a prosthetic ear. Parse SKELETON first (the lead sheet), then FUNCTION (degrees and tension against the virtual tonic), then LAYERS (what occupies space).",
    "Quote chords and lyrics only if they appear above. Never invent words.",
    "Roman numerals and feeling-states are hypotheses from bass+chroma+Krumhansl tonic, labeled as such.",
    "When you describe affect, use the feeling-states (home, warmth, tragic, polar void) rather than inventing a narrative.",
    "When conflicts exist, keep both histories.",
  );

  if (map.transduction) {
    lines.push("", "TRANSDUCTION", map.transduction.trim());
  }

  return lines.join("\n");
}

export function compileHearing(map: HearingMap, grok?: string): string {
  const digest = digestMap(map);
  const reading = grok?.trim() || map.transduction?.trim() || "";
  return [
    `# ${map.title}`,
    "",
    "Prosthetic hearing file. This is what Fox Ears measured — not a published chart.",
    `source: ${map.source.kind} · ${map.source.name}`,
    `captured: ${map.captured_at}`,
    "",
    reading
      ? ["## Reading", "", reading, "", "## Receipt", "", digest].join("\n")
      : ["## Receipt", "", digest].join("\n"),
    "",
  ].join("\n");
}

export function compactForModel(map: HearingMap): HearingMap {
  const { painting_png: _p, ...rest } = map;
  if (rest.frames.length <= 480) return rest;
  const step = Math.ceil(rest.frames.length / 420);
  return {
    ...rest,
    frames: rest.frames.filter((_, i) => i % step === 0),
  };
}
