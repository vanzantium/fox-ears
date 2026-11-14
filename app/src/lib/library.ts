import type { HearingMap } from "@/lib/hearing/types";
import { uid } from "@/lib/utils";

const KEY = "fox-ears-maps-v1";
const MAX = 24;

export type LibraryEntry = {
  id: string;
  title: string;
  sourceKind: HearingMap["source"]["kind"];
  durationMs: number;
  createdAt: string;
  map: HearingMap;
};

function readAll(): LibraryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: LibraryEntry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
}

export function listLocalMaps(): LibraryEntry[] {
  return readAll();
}

export function saveLocalMap(map: HearingMap): LibraryEntry {
  const { painting_png: _p, ...rest } = map;
  const slim = rest as HearingMap;
  const entry: LibraryEntry = {
    id: uid(),
    title: slim.title,
    sourceKind: slim.source.kind,
    durationMs: slim.duration_ms,
    createdAt: slim.captured_at,
    map: slim,
  };
  const next = [entry, ...readAll().filter((e) => e.title !== map.title || e.durationMs !== map.duration_ms)];
  writeAll(next);
  return entry;
}

export function getLocalMap(id: string): LibraryEntry | undefined {
  return readAll().find((e) => e.id === id);
}

export function deleteLocalMap(id: string) {
  writeAll(readAll().filter((e) => e.id !== id));
}
