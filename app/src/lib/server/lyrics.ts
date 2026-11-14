import { createServerFn } from "@tanstack/react-start";

type Hit = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export const lookupPublishedLyrics = createServerFn({ method: "GET" })
  .validator((input: { query: string; durationSec?: number }) => input)
  .handler(async ({ data }) => {
    const q = data.query.trim();
    if (q.length < 2) {
      return { ok: false as const, error: "Need a title to look up lyrics." };
    }
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FoxEars/0.2 (prosthetic listening instrument)" },
    });
    if (!res.ok) {
      return { ok: false as const, error: `Lyrics lookup failed (${res.status}).` };
    }
    const rows = (await res.json()) as Hit[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false as const, error: "No published lyric sheet matched that name." };
    }
    const dur = data.durationSec ?? 0;
    const scored = rows
      .filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
      .map((r) => {
        const dd = dur > 0 && r.duration ? Math.abs((r.duration ?? 0) - dur) : 8;
        return { r, score: dd };
      })
      .sort((a, b) => a.score - b.score);
    const best = (scored[0]?.r ?? rows[0]) as Hit | undefined;
    if (!best || (!best.plainLyrics && !best.syncedLyrics)) {
      return { ok: false as const, error: "Matched a track but no lyric sheet." };
    }
    return {
      ok: true as const,
      artist: best.artistName ?? "",
      title: best.trackName ?? q,
      plain: best.plainLyrics ?? "",
      synced: best.syncedLyrics ?? "",
    };
  });
