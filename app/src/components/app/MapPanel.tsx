import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Copy,
  Download,
  Ear,
  LoaderCircle,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { digestMap, compileHearing } from "@/lib/hearing/digest";
import { attachPastedLyrics, emptyChart, formatChordChart, fmtTime } from "@/lib/hearing/score";
import { parseTrackName, toChartLyrics } from "@/lib/hearing/lyrics";
import { DEGREE_MAP } from "@/lib/hearing/sonofield";
import type { DegreeEvent, HearingMap, SongChart } from "@/lib/hearing/types";
import { saveLocalMap } from "@/lib/library";
import { saveHearingMap } from "@/lib/server/maps";
import { lookupPublishedLyrics } from "@/lib/server/lyrics";
import { transduceHearing } from "@/lib/server/transduce";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { downloadText } from "@/lib/utils";
import { downloadPainting } from "@/lib/viz/paint";
import { THEMES } from "@/lib/viz/themes";

type Tab = "paint" | "chart" | "graph" | "receipt" | "hear";

export function MapPanel({
  map,
  onClose,
  onTransduced,
  onMapChange,
}: {
  map: HearingMap;
  onClose: () => void;
  onTransduced: (text: string) => void;
  onMapChange: (map: HearingMap) => void;
}) {
  const [tab, setTab] = useState<Tab>("chart");
  const [busy, setBusy] = useState<"save" | "ai" | "lyrics" | null>(null);
  const [lyricDraft, setLyricDraft] = useState(map.chart?.lyrics.text ?? "");
  const [lyricQuery, setLyricQuery] = useState(() => parseTrackName(map.source.name).query);
  const user = useCurrentUser();
  const digest = useMemo(() => digestMap(map), [map]);
  const chart = map.chart ?? emptyChart();
  const chartData = useMemo(
    () =>
      map.graph.t_ms.map((t, i) => ({
        t: Math.round(t / 100) / 10,
        energy: map.graph.energy[i] ?? 0,
        spatial: map.graph.spatial[i] ?? 0,
        onset: map.graph.onset[i] ?? 0,
        pitch: (map.graph.pitch_midi?.[i] ?? 0) / 80,
        vocal: map.graph.vocal?.[i] ?? 0,
        tension: (map.graph.tension?.[i] ?? 0) / 10,
      })),
    [map],
  );

  async function copyDigest() {
    await navigator.clipboard.writeText(digest);
    toast("Lead sheet copied");
  }

  function slimMap(): HearingMap {
    const { painting_png: _p, ...rest } = map;
    return rest;
  }

  function downloadJson() {
    const slug = map.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadText(`${slug || "hearing-map"}.json`, JSON.stringify(slimMap(), null, 2));
  }

  function downloadDigest() {
    const slug = map.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadText(`${slug || "hearing-map"}.txt`, digest, "text/plain");
  }

  async function save() {
    setBusy("save");
    try {
      const local = saveLocalMap(slimMap());
      if (user) {
        await saveHearingMap({
          data: {
            title: map.title,
            sourceKind: map.source.kind,
            durationMs: map.duration_ms,
            receiptJson: JSON.stringify(slimMap()),
          },
        });
      }
      toast(user ? "Saved to account and this device" : "Saved on this device");
      void local;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  function downloadHearing(text?: string) {
    const slug = map.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const body = compileHearing({ ...map, transduction: text ?? map.transduction }, text);
    downloadText(`${slug || "hearing"}.hearing.md`, body, "text/markdown");
  }

  async function transduce() {
    setBusy("ai");
    try {
      let grok = "";
      if (user) {
        const res = await transduceHearing({ data: { digest } });
        if (res.ok) grok = res.text;
        else toast(res.error);
      }
      const text = grok || localReading();
      onTransduced(text);
      downloadHearing(text);
      setTab("hear");
      toast(grok ? "Hearing file downloaded (Grok reading)" : "Hearing file downloaded (local receipt)");
    } catch (err) {
      const text = localReading();
      onTransduced(text);
      downloadHearing(text);
      setTab("hear");
      toast(err instanceof Error ? err.message : "Grok failed — local hearing file saved");
    } finally {
      setBusy(null);
    }
  }

  function localReading() {
    const chart = map.chart;
    const fn = chart?.function;
    return [
      "LOCAL HEARING (no Grok — the receipt is the ground truth)",
      chart?.key ? `Tonal family: ${chart.key.tonic} ${chart.key.mode}` : "Tonal family unmeasured",
      chart?.key_hypotheses?.length
        ? `Hypotheses: ${chart.key_hypotheses.map((k) => `${k.tonic} ${k.mode}`).join(" / ")}`
        : "",
      fn?.macro_peak_ms != null ? `Macro climax ~ ${fmtTime(fn.macro_peak_ms)}` : "",
      chart?.chroma_reliable === false ? chart.chroma_note : "",
      "Chords, degrees, and lyrics are only those listed in the receipt below. Do not invent.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function attachLyrics() {
    const lines = attachPastedLyrics(lyricDraft, map.duration_ms);
    const nextChart: SongChart = {
      ...chart,
      lyrics: {
        source: lyricDraft.trim() ? "pasted" : "none",
        text: lyricDraft,
        lines,
      },
    };
    onMapChange({ ...map, chart: nextChart });
    toast(lyricDraft.trim() ? "Lyrics attached to the skeleton" : "Lyrics cleared");
  }

  async function findLyrics() {
    if (!lyricQuery.trim()) {
      toast("Type the artist and title");
      return;
    }
    setBusy("lyrics");
    try {
      const found = await lookupPublishedLyrics({
        data: { query: lyricQuery.trim(), durationSec: map.duration_ms / 1000 },
      });
      if (!found.ok) {
        toast(found.error);
        return;
      }
      const lyrics = toChartLyrics(found, map.duration_ms);
      onMapChange({ ...map, chart: { ...chart, lyrics } });
      setLyricDraft(lyrics.text);
      toast(`${found.artist} — ${found.title}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Lyrics lookup failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 top-[10%] z-30 flex flex-col rounded-t-3xl bg-elevated shadow-border">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Lead sheet</p>
          <h2 className="truncate font-display text-2xl font-medium tracking-tight">
            {map.title}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close map">
          <X />
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto px-5">
        {(
          [
            ["chart", "Chart"],
            ["paint", "Paint"],
            ["graph", "Graph"],
            ["hear", "Hearing"],
            ["receipt", "Receipt"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-9 shrink-0 rounded-full px-3 text-sm transition-colors duration-150 ${
              tab === id ? "bg-fg text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "chart" && (
          <LeadSheet
            map={map}
            chart={chart}
            lyricDraft={lyricDraft}
            setLyricDraft={setLyricDraft}
            lyricQuery={lyricQuery}
            setLyricQuery={setLyricQuery}
            lyricBusy={busy === "lyrics"}
            onAttachLyrics={attachLyrics}
            onFindLyrics={() => void findLyrics()}
          />
        )}
        {tab === "paint" && (
          <div>
            {map.painting_png ? (
              <img
                src={map.painting_png}
                alt="Song painting"
                className="w-full rounded-2xl"
              />
            ) : (
              <p className="text-sm text-muted">No painting was captured for this map.</p>
            )}
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Color is pitch class. Washes are bass. Splats are attacks. Warm bloom is voice. The canvas is the song’s identity over time — the same field as the chart and graph.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => downloadPainting(map.title)}
            >
              <Download /> Painting PNG
            </Button>
          </div>
        )}
        {tab === "graph" && (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(236,234,228,0.08)" vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke="#8a8880"
                  tick={{ fill: "#8a8880", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[-1, 1]} />
                <Tooltip
                  contentStyle={{
                    background: "#121214",
                    border: "1px solid rgba(236,234,228,0.12)",
                    borderRadius: 12,
                    color: "#eceae4",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="energy"
                  stroke="#d8d2c6"
                  fill="rgba(216,210,198,0.2)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="pitch"
                  stroke="#c9a798"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="spatial"
                  stroke="#8ea0ae"
                  strokeWidth={1.2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="tension"
                  stroke="#c47a72"
                  strokeWidth={1.3}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-muted">
              Bone: energy · clay: pitch · cool: spatial · rose: functional tension
            </p>
          </div>
        )}
        {tab === "hear" && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              A downloadable hearing file. Transduce writes `{map.title}.hearing.md` to your downloads — no sign-in required for the local receipt.
            </p>
            <pre className="whitespace-pre-wrap break-words rounded-2xl bg-bg p-4 font-mono text-xs leading-relaxed text-fg/90">
              {compileHearing(map)}
            </pre>
          </div>
        )}
        {tab === "receipt" && (
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-bg p-4 font-mono text-xs leading-relaxed text-fg/90">
            {digest}
          </pre>
        )}
        {tab === "hear" ? null : map.transduction && tab !== "receipt" && (
          <section className="mt-6">
            <h3 className="text-sm font-medium">Transduction</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg/85">
              {map.transduction}
            </p>
          </section>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
        <Button variant="default" size="sm" onClick={() => void copyDigest()}>
          <Copy /> Copy for a model
        </Button>
        <Button variant="outline" size="sm" onClick={downloadJson}>
          <Download /> JSON
        </Button>
        <Button variant="outline" size="sm" onClick={downloadDigest}>
          <Download /> Digest
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadHearing()}>
          <Download /> Hearing
        </Button>
        <Button variant="subtle" size="sm" onClick={() => void save()} disabled={busy === "save"}>
          {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />}
          Save
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => void transduce()}
          disabled={busy === "ai"}
        >
          {busy === "ai" ? <LoaderCircle className="animate-spin" /> : <Ear />}
          Transduce
        </Button>
      </div>
    </div>
  );
}

function LeadSheet({
  map,
  chart,
  lyricDraft,
  setLyricDraft,
  lyricQuery,
  setLyricQuery,
  lyricBusy,
  onAttachLyrics,
  onFindLyrics,
}: {
  map: HearingMap;
  chart: SongChart;
  lyricDraft: string;
  setLyricDraft: (s: string) => void;
  lyricQuery: string;
  setLyricQuery: (s: string) => void;
  lyricBusy: boolean;
  onAttachLyrics: () => void;
  onFindLyrics: () => void;
}) {
  const key = chart.key ? `${chart.key.tonic} ${chart.key.mode}` : "—";
  const tempo = chart.tempo_note
    ? chart.tempo_candidates?.length
      ? chart.tempo_candidates.map((c) => c.bpm).join("/") + " ?"
      : "unresolved"
    : chart.tempo_bpm
      ? `${chart.tempo_bpm} BPM`
      : "—";
  const range = chart.range ? `${chart.range.low}–${chart.range.high}` : "—";
  const chordText = formatChordChart(chart);
  const maxT = Math.max(map.duration_ms, 1);

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl bg-bg px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Key</dt>
          <dd className="mt-1 font-medium">{key}</dd>
        </div>
        <div className="rounded-2xl bg-bg px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Tempo</dt>
          <dd className="mt-1 font-medium">{tempo}</dd>
        </div>
        <div className="rounded-2xl bg-bg px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Range</dt>
          <dd className="mt-1 font-medium">{range}</dd>
        </div>
      </dl>
      {chart.chroma_reliable === false && (
        <p className="rounded-2xl bg-bg px-3 py-2 text-xs text-danger">{chart.chroma_note}</p>
      )}
      {!!chart.key_hypotheses?.length && (
        <p className="text-xs text-muted">
          Hypotheses: {chart.key_hypotheses.map((k) => `${k.tonic} ${k.mode} (${k.corr.toFixed(2)})`).join(" · ")}
        </p>
      )}
      {map.listen && (
        <p className="text-xs text-muted">
          Listen {map.listen.n} · {map.listen.pass}
          {map.listen.next ? ` · next ${map.listen.next}` : ""}
        </p>
      )}

      <section>
        <h3 className="text-sm font-medium">Form</h3>
        <div className="relative mt-2 h-10 overflow-hidden rounded-2xl bg-bg">
          {chart.sections.map((s) => {
            const left = (s.t_start_ms / maxT) * 100;
            const width = Math.max(2, ((s.t_end_ms - s.t_start_ms) / maxT) * 100);
            const tone =
              s.role === "chorus"
                ? THEMES.ember.bar
                : s.role === "verse"
                  ? THEMES.tide.left
                  : s.role === "bridge"
                    ? THEMES.split.right
                    : THEMES.bone.bar;
            return (
              <div
                key={`${s.label}-${s.t_start_ms}`}
                className="absolute top-2 h-6 rounded-full"
                style={{ left: `${left}%`, width: `${width}%`, background: tone, opacity: 0.85 }}
                title={s.hypothesis}
              />
            );
          })}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {chart.sections.map((s) => (
            <li key={`${s.label}-${s.t_start_ms}`}>
              <span className="text-fg/80">{s.role}</span> · {fmtTime(s.t_start_ms)}–{fmtTime(s.t_end_ms)} · {s.hypothesis}
            </li>
          ))}
          {chart.sections.length === 0 && <li>Form unmeasured.</li>}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-medium">Chord chart</h3>
        <p className="mt-1 text-xs text-muted">
          Measured from chroma templates — a skeleton, not a published tab.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-2xl bg-bg p-4 font-mono text-xs leading-relaxed text-fg/90">
          {chordText}
        </pre>
      </section>

      <FunctionLayer chart={chart} />

      <section>
        <h3 className="text-sm font-medium">Melody</h3>
        <PianoRoll chart={chart} duration={maxT} />
        <p className="mt-2 text-xs text-muted">
          {chart.notes.length} pitched events
          {chart.notes.slice(0, 12).map((n) => ` · ${n.degree ? `^${n.degree}` : n.name}`).join("")}
          {chart.notes.length > 12 ? " …" : ""}
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium">Lyrics</h3>
        <p className="mt-1 text-xs text-muted">
          Published sheets are looked up by name (filename like <span className="font-mono">Artist - Title</span>, or type it). Fox Ears will not invent words.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={lyricQuery}
            onChange={(e) => setLyricQuery(e.target.value)}
            placeholder="Artist – Title"
            className="h-10 min-w-0 flex-1 rounded-full border-0 bg-bg px-4 text-sm text-fg outline-none placeholder:text-faint"
          />
          <Button variant="outline" size="sm" className="shrink-0" onClick={onFindLyrics} disabled={lyricBusy}>
            {lyricBusy ? <LoaderCircle className="animate-spin" /> : null}
            Find sheet
          </Button>
        </div>
        <textarea
          value={lyricDraft}
          onChange={(e) => setLyricDraft(e.target.value)}
          rows={6}
          placeholder={"or paste a lyric sheet, one line per row"}
          className="mt-2 w-full resize-y rounded-2xl border-0 bg-bg px-3 py-2 font-mono text-sm text-fg outline-none ring-0 placeholder:text-faint"
        />
        <Button variant="outline" size="sm" className="mt-2" onClick={onAttachLyrics}>
          Attach paste
        </Button>
        {chart.lyrics.lines.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {chart.lyrics.lines.map((l, i) => (
              <li key={`${l.t_ms}-${i}`}>
                <span className="font-mono text-xs text-muted">{fmtTime(l.t_ms)}</span> {l.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {map.objects.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">Layers over the skeleton</h3>
          <ul className="mt-2 space-y-2">
            {map.objects.map((o) => (
              <li key={o.id} className="rounded-2xl bg-bg px-4 py-3 text-sm">
                <p>
                  {o.id} · band {o.birth_band}
                  {o.hops.length ? ` → ${o.dominant_band}` : ""} · {o.memory_key}
                </p>
                <p className="mt-1 text-xs text-muted">{o.cue.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PianoRoll({ chart, duration }: { chart: SongChart; duration: number }) {
  const notes = chart.notes;
  if (!notes.length) {
    return (
      <p className="mt-2 grid h-24 place-items-center rounded-2xl bg-bg text-xs text-muted">
        No stable notes crossed confidence.
      </p>
    );
  }
  const midis = notes.map((n) => n.midi);
  const lo = Math.min(...midis) - 1;
  const hi = Math.max(...midis) + 1;
  const span = Math.max(1, hi - lo);
  return (
    <div className="relative mt-2 h-28 overflow-hidden rounded-2xl bg-bg">
      {notes.map((n, i) => {
        const left = (n.t_ms / duration) * 100;
        const width = Math.max(0.6, (n.dur_ms / duration) * 100);
        const top = ((hi - n.midi) / span) * 100;
        return (
          <div
            key={`${n.t_ms}-${n.midi}-${i}`}
            className="absolute h-1.5 rounded-full bg-accent"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              top: `${top}%`,
              opacity: 0.35 + n.confidence * 0.65,
              background: n.degree
                ? `hsl(${DEGREE_MAP.find((d) => d.degree === n.degree)?.hue ?? 42} 55% 58%)`
                : undefined,
            }}
            title={`${n.name}${n.degree ? ` ^${n.degree}` : ""} ${fmtTime(n.t_ms)}`}
          />
        );
      })}
    </div>
  );
}

function FunctionLayer({ chart }: { chart: SongChart }) {
  const fn = chart.function;
  if (!fn?.tonic) return null;
  const melody = fn.degrees.filter((d) => d.layer === "melody");
  return (
    <section>
      <h3 className="text-sm font-medium">Function</h3>
      <p className="mt-1 text-xs text-muted">
        Virtual tonic {fn.tonic} {fn.mode} · mean tension {fn.mean_tension} · peak {fn.peak_tension}. Degrees are relative to home, not letter names.
      </p>
      <SonofieldCircle degrees={fn.degrees} />
      <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
        {melody.slice(0, 24).map((d, i) => (
          <li key={`${d.t_ms}-${i}`}>
            <span className="font-mono text-fg/80">^{d.degree}</span> {fmtTime(d.t_ms)} · {d.feeling}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SonofieldCircle({ degrees }: { degrees: DegreeEvent[] }) {
  const counts = new Map<string, number>();
  for (const d of degrees) counts.set(d.degree, (counts.get(d.degree) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  const r = 64;
  return (
    <svg viewBox="0 0 180 180" className="mt-3 h-40 w-40">
      <circle cx="90" cy="90" r="66" fill="none" stroke="rgba(236,234,228,0.12)" />
      {DEGREE_MAP.map((st, i) => {
        const angle = ((7 * i) % 12) * ((Math.PI * 2) / 12) - Math.PI / 2;
        const x = 90 + Math.cos(angle) * r;
        const y = 90 + Math.sin(angle) * r;
        const w = (counts.get(st.degree) ?? 0) / max;
        return (
          <g key={st.degree}>
            <circle
              cx={x}
              cy={y}
              r={3.5 + w * 7}
              fill={`hsl(${st.hue} 60% ${40 + w * 25}%)`}
              opacity={0.35 + w * 0.65}
            />
            <text x={x} y={y - 10} textAnchor="middle" fill="#8a8880" fontSize="9">
              {st.degree}
            </text>
          </g>
        );
      })}
      <text x="90" y="94" textAnchor="middle" fill="#eceae4" fontSize="11">
        1
      </text>
    </svg>
  );
}
