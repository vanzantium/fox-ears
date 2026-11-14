import {
  emptyModel,
  planNextPass,
  passOptions,
  refineFromChart,
  songIdentity,
  type CompassLean,
  type JukeboxSong,
  type PassKind,
  type PassOptions,
  type ZaauAppraisal,
} from "@/lib/hearing/songModel";
import type { HearingMap } from "@/lib/hearing/types";

const KEY = "fox-ears-jukebox-v1";
const MAX = 40;

function readAll(): JukeboxSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JukeboxSong[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(songs: JukeboxSong[]) {
  window.localStorage.setItem(KEY, JSON.stringify(songs.slice(0, MAX)));
}

export function listJukebox(): JukeboxSong[] {
  return readAll();
}

export function getJukeboxSong(identity: string): JukeboxSong | undefined {
  return readAll().find((s) => s.identity === identity);
}

export function lookupSong(name: string, durationMs: number): JukeboxSong | undefined {
  return getJukeboxSong(songIdentity(name, durationMs));
}

/** Leans live on Zaau, not on the song. They cannot rewrite the model. */
function observeLean(song: JukeboxSong, appraisal: ZaauAppraisal): CompassLean[] {
  const statement =
    appraisal.valence === "inward"
      ? "this recording pulls me inward"
      : appraisal.valence === "defiance"
        ? "the climax reads as defiance more than release"
        : appraisal.valence === "uneasy"
          ? "I don't trust the spicy harmony yet"
          : appraisal.valence === "continuity"
            ? "I know this room; knowing is not liking"
            : "the field is still a sketch";
  const leans = [...(song.leans ?? [])];
  const existing = leans.find((l) => l.statement === statement && l.status !== "RETIRED");
  if (existing) {
    existing.strength = Math.min(1, existing.strength + 0.08);
    existing.supporting_listen = [...existing.supporting_listen, appraisal.listen_receipt_id].slice(-8);
    existing.status = existing.supporting_listen.length >= 4 && existing.strength >= 0.55 ? "STABLE" : existing.supporting_listen.length >= 2 ? "RECURRING" : "EMERGING";
  } else {
    leans.push({
      statement,
      direction: appraisal.valence,
      strength: 0.25,
      status: "EMERGING",
      supporting_listen: [appraisal.listen_receipt_id],
    });
  }
  return leans.slice(-12);
}

export function fileEncounter(map: HearingMap, pass: PassKind, focus: Array<{ t0: number; t1: number }>): JukeboxSong {
  const identity = songIdentity(map.source.name, map.duration_ms);
  const prev = getJukeboxSong(identity);
  const { model, listen, appraisal } = refineFromChart(prev?.model ?? null, map.chart, map, pass, focus);
  const song: JukeboxSong = {
    identity,
    title: map.title,
    duration_ms: map.duration_ms,
    model,
    history: [...(prev?.history ?? []), listen].slice(-24),
    appraisals: [...(prev?.appraisals ?? []), appraisal].slice(-24),
    leans: observeLean(prev ?? { identity, title: map.title, duration_ms: map.duration_ms, model: emptyModel(identity, map.title, map.duration_ms), history: [], appraisals: [], leans: [], last_map_at: map.captured_at }, appraisal),
    last_map_at: map.captured_at,
  };
  const rest = readAll().filter((s) => s.identity !== identity);
  writeAll([song, ...rest]);
  return song;
}

export function plannedPass(name: string, durationMs: number): { kind: PassKind; focus: Array<{ t0: number; t1: number }>; why: string; options: PassOptions; listenN: number } {
  const song = lookupSong(name, durationMs);
  const plan = planNextPass(song?.model ?? null);
  return {
    ...plan,
    options: passOptions(plan, song?.model ?? null),
    listenN: song?.model.listens ?? 0,
  };
}

export function deleteJukeboxSong(identity: string) {
  writeAll(readAll().filter((s) => s.identity !== identity));
}

export { songIdentity, planNextPass, PASS_COPY } from "@/lib/hearing/songModel";
export type { JukeboxSong, PassKind } from "@/lib/hearing/songModel";
