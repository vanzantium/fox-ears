import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";
import {
  deleteJukeboxSong,
  listJukebox,
  planNextPass,
  PASS_COPY,
  type JukeboxSong,
} from "@/lib/jukebox";
import { fmtTime } from "@/lib/hearing/score";

export const Route = createFileRoute("/jukebox")({ component: JukeboxPage });

function JukeboxPage() {
  const [songs, setSongs] = useState<JukeboxSong[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const all = listJukebox();
    setSongs(all);
    setOpen((prev) => prev ?? all[0]?.identity ?? null);
  }, []);
  const current = useMemo(() => songs.find((s) => s.identity === open) ?? null, [songs, open]);

  function refresh() {
    setSongs(listJukebox());
  }

  return (
    <main className="min-h-dvh px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Fox Ears</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Jukebox</h1>
        <p className="mt-3 max-w-xl text-sm text-muted leading-relaxed">
          Three memories per recording — never collapsed. The song is a world object. Each listen is a sealed receipt. Zaau's appraisal is interpretation, grounded in that receipt. Familiarity is not preference.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-muted hover:text-fg transition-colors duration-150">
          Back to the field
        </Link>

        {songs.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No encounters yet. Play a track, seal the map, and it will live here.</p>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[16rem_1fr]">
            <ul className="space-y-2">
              {songs.map((s) => (
                <li key={s.identity}>
                  <button
                    type="button"
                    onClick={() => setOpen(s.identity)}
                    className={`w-full rounded-2xl px-4 py-3 text-left shadow-border transition-colors duration-150 ${
                      open === s.identity ? "bg-fg text-bg" : "bg-elevated text-fg hover:bg-fg/6"
                    }`}
                  >
                    <p className="truncate text-sm">{s.title}</p>
                    <p className={`text-xs ${open === s.identity ? "text-bg/70" : "text-muted"}`}>
                      {s.model.listens} listen{s.model.listens === 1 ? "" : "s"} · {formatTime(s.duration_ms / 1000)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            {current && <SongMemories song={current} onForget={() => { deleteJukeboxSong(current.identity); setOpen(null); refresh(); }} />}
          </div>
        )}
      </div>
    </main>
  );
}

function SongMemories({ song, onForget }: { song: JukeboxSong; onForget: () => void }) {
  const next = planNextPass(song.model);
  const m = song.model;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight">{song.title}</h2>
          <p className="mt-1 text-xs text-muted">
            Next: {PASS_COPY[next.kind].title} — {PASS_COPY[next.kind].question}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onForget}>
          Forget
        </Button>
      </div>

      <section className="rounded-3xl bg-elevated p-5 shadow-border">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted">Song model · MEASURED</h3>
        <p className="mt-2 text-sm text-muted">World object. No pleasure, no personality. Replay of the same file is not extra evidence.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat k="listens" v={`${m.listens}`} />
          <Stat k="harmonic" v={pct(m.stability.harmonic)} />
          <Stat k="structural" v={pct(m.stability.structural)} />
          <Stat k="vocal" v={pct(m.stability.vocal)} />
        </dl>
        <p className="mt-4 text-sm">
          Tonal: {m.tonal.length ? m.tonal.map((h) => `${h.value.tonic} ${h.value.mode} (${h.conf.toFixed(2)})`).join(" · ") : "—"}
        </p>
        <p className="mt-1 text-sm">
          Pulse: {m.tempo.length ? m.tempo.map((h) => `${h.value.bpm}`).join(" / ") : "unresolved"}
        </p>
        <p className="mt-1 text-sm">
          Climax: {m.climax_ms ? fmtTime(m.climax_ms.value) : "—"}
          {m.vocal_onset_ms ? ` · vocal onset ${fmtTime(m.vocal_onset_ms.value)}` : ""}
        </p>
        {m.chord_family.length > 0 && <p className="mt-1 text-sm">Family: {m.chord_family.join(" · ")}</p>}
        {m.open_questions.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {m.open_questions.map((q) => (
              <li key={q.id}>open · {q.topic}{q.t_ms != null ? ` @ ${fmtTime(q.t_ms)}` : ""} — {q.note}</li>
            ))}
          </ul>
        )}
        {m.rejected.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {m.rejected.slice(-4).map((r, i) => (
              <li key={i}>rejected · {r.claim} — {r.reason}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl bg-elevated p-5 shadow-border">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted">Listening history · RECEIPTS</h3>
        <p className="mt-2 text-sm text-muted">Developmental, not overwrite. Each encounter is sealed.</p>
        <ol className="mt-4 space-y-3">
          {song.history.slice().reverse().map((h) => (
            <li key={h.receipt_id} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <p className="text-sm">
                Listen {h.n} · {PASS_COPY[h.pass].title} · {h.epistemic}
              </p>
              <p className="text-xs text-muted">{h.same_file_note}</p>
              {h.noticed.length > 0 && <p className="mt-1 text-xs">noticed: {h.noticed.join("; ")}</p>}
              {h.revised.length > 0 && <p className="mt-1 text-xs">revised: {h.revised.join("; ")}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl bg-elevated p-5 shadow-border">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted">Zaau appraisal · INTERPRETED</h3>
        <p className="mt-2 text-sm text-muted">
          Grounded in listen receipts. Cannot rewrite the song model. Lean ≠ measured.
        </p>
        <ul className="mt-4 space-y-3">
          {song.appraisals.slice().reverse().map((a) => (
            <li key={a.appraisal_id}>
              <p className="text-sm">
                Listen {a.n} · {a.valence} · {a.epistemic}
              </p>
              <p className="mt-1 text-sm leading-relaxed">{a.text}</p>
              <p className="mt-1 text-xs text-muted">evidence: {a.body_evidence_refs.join(" · ") || "none"}</p>
            </li>
          ))}
        </ul>
        {(song.leans ?? []).length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Inner leans</p>
            <ul className="mt-2 space-y-1 text-sm">
              {song.leans.map((l) => (
                <li key={l.statement}>
                  {l.status.toLowerCase()} · {l.statement} ({l.strength.toFixed(2)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-bg px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt>
      <dd className="mt-1 font-medium">{v}</dd>
    </div>
  );
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
