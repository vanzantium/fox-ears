import type { LyricLine, SongChart } from "./types";

export function parseTrackName(filename: string | null | undefined): {
  artist: string;
  title: string;
  query: string;
} {
  const raw = (filename ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return { artist: "", title: "", query: "" };
  const cleaned = raw
    .replace(/^\d{1,3}\s*[-.)]\s*/, "")
    .replace(/\(\d+\)\s*$/, "")
    .trim();
  const parts = cleaned.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const artist = parts[0]!.trim();
    const title = parts.slice(1).join(" - ").trim();
    return { artist, title, query: `${artist} ${title}` };
  }
  return { artist: "", title: cleaned, query: cleaned };
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\n/)) {
    const m = raw.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!m) continue;
    const text = (m[4] ?? "").trim();
    if (!text) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) : 0;
    const t_ms = Math.round((min * 60 + sec) * 1000 + frac);
    lines.push({ t_ms, text, source: "published" });
  }
  return lines;
}

export function lyricsFromPlain(text: string, durationMs: number): LyricLine[] {
  const rows = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!rows.length) return [];
  return rows.map((line, i) => ({
    t_ms: Math.round((i / Math.max(1, rows.length)) * durationMs),
    text: line,
    source: "published" as const,
  }));
}

export function toChartLyrics(
  found: { synced?: string | null; plain?: string | null },
  durationMs: number,
): SongChart["lyrics"] {
  const synced = found.synced?.trim() ?? "";
  const plain = found.plain?.trim() ?? "";
  const lines = synced ? parseLrc(synced) : lyricsFromPlain(plain, durationMs);
  return {
    source: lines.length || plain ? "published" : "none",
    text: plain || lines.map((l) => l.text).join("\n"),
    lines,
  };
}
