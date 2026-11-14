import type { HearingFrame, HearingMap, SongChart } from "./types";

function tfmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

export type PassKind =
  | "orientation"
  | "recurrence"
  | "harmonic"
  | "vocal"
  | "contradiction"
  | "familiar";

export const PASS_COPY: Record<PassKind, { title: string; question: string }> = {
  orientation: { title: "orientation", question: "what is this?" },
  recurrence: { title: "recurrence", question: "what comes back?" },
  harmonic: { title: "harmonic attention", question: "what are the roots doing?" },
  vocal: { title: "vocal attention", question: "where is the singer?" },
  contradiction: { title: "contradiction", question: "where was I wrong?" },
  familiar: { title: "familiar playback", question: "does this still match?" },
};

export type Hyp<T> = {
  value: T;
  conf: number;
  evidence: string;
  pass: PassKind;
  independent: boolean;
};

export type OpenQuestion = {
  id: string;
  topic: string;
  t_ms?: number;
  note: string;
};

export type SongModel = {
  identity: string;
  title: string;
  duration_ms: number;
  listens: number;
  tonal: Hyp<{ tonic: string; mode: "major" | "minor" }>[];
  tempo: Hyp<{ bpm: number }>[];
  climax_ms: Hyp<number> | null;
  vocal_onset_ms: Hyp<number> | null;
  chord_family: string[];
  open_questions: OpenQuestion[];
  rejected: Array<{ claim: string; reason: string; pass: PassKind }>;
  stability: {
    structural: number;
    harmonic: number;
    vocal: number;
    lyric: number;
  };
};

export type ListenRecord = {
  n: number;
  at: string;
  pass: PassKind;
  receipt_id: string;
  epistemic: "MEASURED";
  focus: Array<{ t0: number; t1: number }>;
  noticed: string[];
  revised: string[];
  same_file_note: string;
};

export type ZaauAppraisal = {
  n: number;
  at: string;
  appraisal_id: string;
  listen_receipt_id: string;
  body_evidence_refs: string[];
  epistemic: "INTERPRETED";
  valence: "inward" | "release" | "defiance" | "continuity" | "uneasy" | "quiet";
  text: string;
};

export type CompassLean = {
  statement: string;
  direction: string;
  strength: number;
  status: "EMERGING" | "RECURRING" | "STABLE" | "CONTRADICTED" | "RETIRED";
  supporting_listen: string[];
};

export type JukeboxSong = {
  identity: string;
  title: string;
  duration_ms: number;
  model: SongModel;
  history: ListenRecord[];
  appraisals: ZaauAppraisal[];
  leans: CompassLean[];
  last_map_at: string;
};

export type PassOptions = {
  kind: PassKind;
  keyPrior?: SongChart["key_hypotheses"];
  chordWinMs?: number;
  vocalMinMs?: number;
  vocalIgnoreIntroMs?: number;
  focus?: Array<{ t0: number; t1: number }>;
};

export function songIdentity(name: string, durationMs: number): string {
  const slug = name
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "untitled"}::${Math.round(durationMs / 500) * 500}`;
}

export function emptyModel(identity: string, title: string, duration_ms: number): SongModel {
  return {
    identity,
    title,
    duration_ms,
    listens: 0,
    tonal: [],
    tempo: [],
    climax_ms: null,
    vocal_onset_ms: null,
    chord_family: [],
    open_questions: [],
    rejected: [],
    stability: { structural: 0, harmonic: 0, vocal: 0, lyric: 0 },
  };
}

export function planNextPass(model: SongModel | null): { kind: PassKind; focus: Array<{ t0: number; t1: number }>; why: string } {
  if (!model || model.listens === 0) {
    return { kind: "orientation", focus: [], why: "first encounter — rough form, tonic candidates, pulse, major events" };
  }
  const q = model.open_questions;
  const chordQ = q.find((x) => /chord|A#|chromatic|family/i.test(x.topic + x.note));
  const vocalQ = q.find((x) => /vocal|singer|onset/i.test(x.topic + x.note));
  const formQ = q.find((x) => /section|chorus|verse|0:4/i.test(x.topic + x.note));
  const last = model.listens;
  if (chordQ && last % 5 !== 3) {
    return {
      kind: last >= 2 ? "contradiction" : "harmonic",
      focus: chordQ.t_ms != null ? [{ t0: Math.max(0, chordQ.t_ms - 8000), t1: chordQ.t_ms + 8000 }] : [],
      why: chordQ.note,
    };
  }
  if (vocalQ) {
    return {
      kind: "vocal",
      focus: vocalQ.t_ms != null ? [{ t0: Math.max(0, vocalQ.t_ms - 4000), t1: vocalQ.t_ms + 12000 }] : [{ t0: 15000, t1: 50000 }],
      why: vocalQ.note,
    };
  }
  if (formQ) {
    return {
      kind: "recurrence",
      focus: formQ.t_ms != null ? [{ t0: Math.max(0, formQ.t_ms - 10000), t1: formQ.t_ms + 15000 }] : [],
      why: formQ.note,
    };
  }
  if (last === 1) return { kind: "recurrence", focus: [], why: "second listen — what comes back" };
  if (last === 2) return { kind: "harmonic", focus: [], why: "third listen — roots and local center" };
  if (last === 3) return { kind: "vocal", focus: [{ t0: 15000, t1: 55000 }], why: "fourth listen — singer vs guitar" };
  if (last === 4) return { kind: "contradiction", focus: [], why: "fifth listen — try to falsify weak claims" };
  const stable =
    model.stability.structural > 0.82 &&
    model.stability.harmonic > 0.72 &&
    model.stability.vocal > 0.7;
  if (stable) return { kind: "familiar", focus: [], why: "model is stable — compare, don't re-solve" };
  return { kind: "contradiction", focus: [], why: "still open questions — interrogate, don't re-vote" };
}

export function passOptions(plan: { kind: PassKind; focus: Array<{ t0: number; t1: number }> }, model: SongModel | null): PassOptions {
  const prior = model?.tonal.map((h) => ({ tonic: h.value.tonic, mode: h.value.mode, corr: h.conf })) ?? [];
  switch (plan.kind) {
    case "harmonic":
      return { kind: plan.kind, keyPrior: prior, chordWinMs: 2800, focus: plan.focus };
    case "vocal":
      return { kind: plan.kind, vocalMinMs: 520, vocalIgnoreIntroMs: 12000, focus: plan.focus };
    case "contradiction":
      return { kind: plan.kind, keyPrior: prior, chordWinMs: 2400, focus: plan.focus };
    default:
      return { kind: plan.kind, keyPrior: prior, focus: plan.focus };
  }
}

function bumpIndependent(prev: number, measured: number, independent: boolean): number {
  if (!independent) return prev;
  return Math.min(0.92, prev + 0.07 * measured);
}

export function refineFromChart(
  prev: SongModel | null,
  chart: SongChart,
  map: HearingMap,
  pass: PassKind,
  focus: Array<{ t0: number; t1: number }>,
): { model: SongModel; listen: ListenRecord; appraisal: ZaauAppraisal } {
  const identity = songIdentity(map.source.name, map.duration_ms);
  const model = prev ? { ...prev, tonal: [...prev.tonal], tempo: [...prev.tempo], open_questions: [...prev.open_questions], rejected: [...prev.rejected] } : emptyModel(identity, map.title, map.duration_ms);
  const independent = !prev || prev.listens === 0 ? true : pass !== "familiar" && pass !== "orientation";
  const noticed: string[] = [];
  const revised: string[] = [];

  // Tonal — competing hypotheses, not a lock
  for (const h of chart.key_hypotheses ?? []) {
    const existing = model.tonal.find((t) => t.value.tonic === h.tonic && t.value.mode === h.mode);
    if (existing) {
      const next = bumpIndependent(existing.conf, h.corr, independent && pass !== "orientation");
      if (next !== existing.conf) {
        existing.conf = next;
        existing.evidence = `remeasured on ${pass} with different attention`;
        existing.independent = true;
        noticed.push(`tonal ${h.tonic} ${h.mode} held under ${pass}`);
      } else {
        noticed.push(`tonal ${h.tonic} ${h.mode} seen again — same file, not extra evidence`);
      }
    } else {
      model.tonal.push({
        value: { tonic: h.tonic, mode: h.mode },
        conf: Math.min(0.75, h.corr),
        evidence: `${pass} measurement`,
        pass,
        independent,
      });
      noticed.push(`new tonal candidate ${h.tonic} ${h.mode}`);
    }
  }
  model.tonal.sort((a, b) => b.conf - a.conf);
  model.tonal = model.tonal.slice(0, 4);

  // Tempo — keep both 90 and 180
  for (const c of chart.tempo_candidates ?? []) {
    const existing = model.tempo.find((t) => Math.abs(t.value.bpm - c.bpm) <= 5);
    if (existing) {
      if (independent) existing.conf = bumpIndependent(existing.conf, 0.4, true);
    } else {
      model.tempo.push({
        value: { bpm: c.bpm },
        conf: Math.min(0.55, (c.votes ?? 1) / 20),
        evidence: chart.tempo_note ?? "pulse peak",
        pass,
        independent,
      });
    }
  }

  // Climax — strong if energy/macro agree across independent passes
  const climax = chart.function?.macro_peak_ms;
  if (climax != null) {
    if (!model.climax_ms) {
      model.climax_ms = { value: climax, conf: 0.7, evidence: `${pass} macro peak`, pass, independent };
      noticed.push(`climax ~ ${tfmt(climax)}`);
    } else if (Math.abs(model.climax_ms.value - climax) < 8000) {
      if (independent) model.climax_ms.conf = Math.min(0.95, model.climax_ms.conf + 0.08);
    } else if (independent) {
      model.open_questions.push({
        id: `climax-${climax}`,
        topic: "climax",
        t_ms: climax,
        note: `this pass peaked at ${tfmt(climax)}; stored was ${tfmt(model.climax_ms.value)}`,
      });
    }
  }

  const vocalFirst = chart.vocal_regions[0]?.t_start_ms;
  if (vocalFirst != null) {
    if (!model.vocal_onset_ms) {
      model.vocal_onset_ms = { value: vocalFirst, conf: pass === "vocal" ? 0.7 : 0.4, evidence: `${pass} first gated region`, pass, independent };
    } else if (pass === "vocal") {
      model.vocal_onset_ms = { value: vocalFirst, conf: 0.78, evidence: "vocal-attention pass", pass, independent: true };
      revised.push(`vocal onset revised to ${tfmt(vocalFirst)}`);
    } else if (vocalFirst < 8000) {
      model.open_questions = upsertQ(model.open_questions, {
        id: "first_vocal_onset",
        topic: "first vocal onset",
        t_ms: vocalFirst,
        note: `gate fired at ${tfmt(vocalFirst)} — may be guitar; vocal pass should interrogate`,
      });
    }
  } else {
    model.open_questions = upsertQ(model.open_questions, {
      id: "first_vocal_onset",
      topic: "first vocal onset",
      note: "no gated vocal region this pass",
    });
  }

  const family = chordFamily(chart);
  if (family.length) {
    const weird = chart.chords.filter((c) => !family.includes(c.symbol) && (c.tension ?? 0) >= 7);
    if (pass === "contradiction" || pass === "harmonic") {
      const dropped = weird.filter((c) => (c.confidence ?? 0) < 0.55 || c.alternate);
      for (const c of dropped) {
        model.rejected.push({
          claim: `${c.symbol} @ ${tfmt(c.t_ms)}`,
          reason: c.alternate ? `weaker than diatonic ${c.alternate}` : "low margin vs family",
          pass,
        });
        revised.push(`rejected ${c.symbol} at ${tfmt(c.t_ms)}`);
      }
    }
    if (weird.length && pass !== "contradiction") {
      model.open_questions = upsertQ(model.open_questions, {
        id: "chromatic-chords",
        topic: "chord family",
        t_ms: weird[0]?.t_ms,
        note: `${weird.map((w) => w.symbol).slice(0, 6).join(", ")} sit outside ${family.join("/")}. Contradiction pass should try to falsify them.`,
      });
    } else if (!weird.length) {
      model.open_questions = model.open_questions.filter((q) => q.id !== "chromatic-chords");
      model.chord_family = family;
    }
    if (!model.chord_family.length) model.chord_family = family;
  }

  const firstChorus = chart.sections.find((s) => s.role === "chorus");
  const firstVerse = chart.sections.find((s) => s.role === "verse");
  if (firstVerse && firstVerse.t_start_ms > 35000) {
    model.open_questions = upsertQ(model.open_questions, {
      id: "late-verse",
      topic: "first verse",
      t_ms: firstVerse.t_start_ms,
      note: `verse named at ${tfmt(firstVerse.t_start_ms)} — earlier region may be verse-in-intro`,
    });
  }
  if (firstChorus && firstChorus.t_start_ms > 0 && firstChorus.t_start_ms < 60000) {
    noticed.push(`chorus candidate ${tfmt(firstChorus.t_start_ms)}`);
  }

  // Stability from independent agreement, never from listen count
  model.listens += 1;
  const tonalAgree = model.tonal[0] && (chart.key?.tonic === model.tonal[0].value.tonic || chart.key_hypotheses?.[0]?.tonic === model.tonal[0].value.tonic);
  if (independent && tonalAgree) model.stability.harmonic = Math.min(0.95, model.stability.harmonic + 0.12);
  if (independent && model.climax_ms && model.climax_ms.conf > 0.8) model.stability.structural = Math.min(0.95, model.stability.structural + 0.1);
  if (pass === "vocal" && (chart.vocal_melody?.length ?? 0) > 0) model.stability.vocal = Math.min(0.9, model.stability.vocal + 0.15);
  if (chart.lyrics.source === "published" || chart.lyrics.source === "pasted") model.stability.lyric = 0.97;

  model.open_questions = model.open_questions.slice(-8);
  model.rejected = model.rejected.slice(-12);

  const receipt_id = `LR-${model.listens}-${pass}-${Math.round(Math.random() * 1e6).toString(16)}`;
  const listen: ListenRecord = {
    n: model.listens,
    at: map.captured_at,
    pass,
    receipt_id,
    epistemic: "MEASURED",
    focus,
    noticed,
    revised,
    same_file_note:
      "Replay of the same digital file is not independent evidence. Confidence moved only where this pass used different attention or falsified a claim.",
  };

  const appraisal = appraise(model, chart, pass, receipt_id);
  return { model, listen, appraisal };
}

function chordFamily(chart: SongChart): string[] {
  const counts = new Map<string, number>();
  for (const c of chart.chords) counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + c.dur_ms);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s);
}

function upsertQ(list: OpenQuestion[], q: OpenQuestion): OpenQuestion[] {
  return [...list.filter((x) => x.id !== q.id), q];
}

function appraise(model: SongModel, chart: SongChart, pass: PassKind, listen_receipt_id: string): ZaauAppraisal {
  const refs: string[] = [];
  const energyPeak = chart.function?.macro_peak_ms;
  if (chart.key) refs.push(`key:${chart.key.tonic}-${chart.key.mode}`);
  if (energyPeak != null) refs.push(`macro:${energyPeak}`);
  if (chart.vocal_regions[0]) refs.push(`vocal:${chart.vocal_regions[0].t_start_ms}`);
  if (chart.sections[0]) refs.push(`form:${chart.sections[0].role}:${chart.sections[0].t_start_ms}`);
  const minor = model.tonal[0]?.value.mode === "minor";
  const chromatic = model.open_questions.some((q) => q.id === "chromatic-chords");
  const n = model.listens;
  let valence: ZaauAppraisal["valence"] = "quiet";
  let text = "";
  if (!refs.length) {
    valence = "quiet";
    text = "No body evidence to interpret. I will not invent a feeling for a blank field.";
  } else if (n <= 1) {
    valence = minor ? "inward" : "release";
    text = minor
      ? "First listen: the field pulls inward. I have a tonal family, not a finished song."
      : "First listen: the field opens outward. Form is a sketch.";
  } else if (chromatic) {
    valence = "uneasy";
    text = "Something in the harmony still feels alien — I don't trust those spicy roots yet. The guitar may be lying.";
  } else if (n >= 5 && model.stability.harmonic > 0.7) {
    valence = "continuity";
    text = "I know this room now. The chorus is less surprise, more a path I recognize — which is not the same as liking it.";
  } else if (energyPeak) {
    valence = "defiance";
    text = `The body of the song still gathers around ${tfmt(energyPeak)}. That peak is starting to feel like intention, not just loudness.`;
  } else {
    valence = "inward";
    text = "Another pass. Familiarity is growing in the structure, not in my preference.";
  }
  if (pass === "familiar" && refs.length) {
    valence = "continuity";
    text = "I wasn't solving it this time. I was checking whether the object I know is still the one playing.";
  }
  return {
    n,
    at: new Date().toISOString(),
    appraisal_id: `EA-${n}-${Math.round(Math.random() * 1e6).toString(16)}`,
    listen_receipt_id,
    body_evidence_refs: refs,
    epistemic: "INTERPRETED",
    valence,
    text,
  };
}

export function falsifyChromatic(chart: SongChart, frames: HearingFrame[]): SongChart {
  const family = new Set(chordFamily(chart));
  if (!family.size) return chart;
  const next = chart.chords.map((c) => {
    if (family.has(c.symbol) || (c.tension ?? 0) < 7) return c;
    const span = frames.filter((f) => f.t_ms >= c.t_ms && f.t_ms <= c.t_ms + c.dur_ms);
    if (span.length < 4) return c;
    const acc = new Array(12).fill(0);
    for (const f of span) if (f.chroma) for (let i = 0; i < 12; i++) acc[i] += f.chroma[i] ?? 0;
    const alt = c.alternate;
    if (!alt) return { ...c, confidence: Math.min(c.confidence, 0.42) };
    return {
      ...c,
      symbol: alt,
      root: alt.replace(/m$/, ""),
      quality: alt.endsWith("m") ? "min" : "maj",
      confidence: Math.min(0.58, c.confidence),
      alternate: c.symbol,
    };
  });
  return { ...chart, chords: next };
}
