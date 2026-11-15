import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Brush,
  Circle,
  Maximize2,
  Mic,
  Minimize2,
  Pause,
  Play,
  Radio,
  Type,
  Upload,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getEngine } from "@/lib/audio/engine";
import { assembleMap } from "@/lib/hearing/bind";
import { parseTrackName, toChartLyrics } from "@/lib/hearing/lyrics";
import { HearingSampler, SAMPLE_INTERVAL_MS } from "@/lib/hearing/sampler";
import { liveTracker, type LiveFunction } from "@/lib/hearing/sonofield";
import type { HearingMap, LyricLine, ThemeId, VizMode } from "@/lib/hearing/types";
import { formatTime } from "@/lib/utils";
import { lookupPublishedLyrics } from "@/lib/server/lyrics";
import { dominantChroma, midiToPc } from "@/lib/audio/pitch";
import { drawFrame, pushMapColumn, resetMapColumns } from "@/lib/viz/draw";
import { paintStep, paintingPng, resetPaint } from "@/lib/viz/paint";
import { THEME_ORDER, THEMES } from "@/lib/viz/themes";
import { speechAvailable, startLyricListen } from "@/lib/hearing/speech";
import { AuthSlot } from "./AuthSlot";
import { MapPanel } from "./MapPanel";
import { fileEncounter, plannedPass, PASS_COPY, type PassKind } from "@/lib/jukebox";

export function FoxEarsApp({ initialMap }: { initialMap?: HearingMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const samplerRef = useRef(new HearingSampler());
  const endedHandled = useRef(false);
  const sealMapRef = useRef<() => void>(() => {});

  const [mode, setMode] = useState<VizMode>("paint");
  const [themeId, setThemeId] = useState<ThemeId>("bone");
  const [sensitivity, setSensitivity] = useState(0.58);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sourceKind, setSourceKind] = useState<"none" | "file" | "mic" | "demo">("none");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [map, setMap] = useState<HearingMap | null>(initialMap ?? null);
  const [showMap, setShowMap] = useState(Boolean(initialMap));
  const [dragOver, setDragOver] = useState(false);
  const [hearWords, setHearWords] = useState(false);
  const [fnHud, setFnHud] = useState<LiveFunction | null>(null);
  const [listenPlan, setListenPlan] = useState<ReturnType<typeof plannedPass> | null>(null);
  const lyricLinesRef = useRef<LyricLine[]>([]);
  const speechStopRef = useRef<(() => void) | null>(null);
  const hudAt = useRef(0);

  const hideTimer = useRef<number | null>(null);
  const bumpChrome = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (getEngine().isPlaying() && !showMap) setChrome(false);
    }, 2800);
  }, [showMap]);

  useEffect(() => {
    const engine = getEngine();
    engine.setSensitivity(sensitivity);
    const unsub = engine.subscribe(() => {
      setPlaying(engine.isPlaying());
      setCurrentTime(engine.currentTime());
      setDuration(engine.duration());
      setSourceKind(engine.sourceKind);
      setFileName(engine.fileName);
      setError(engine.error);
    });
    return unsub;
  }, [sensitivity]);

  useEffect(() => {
    if (!fileName || duration <= 0) return;
    setListenPlan(plannedPass(fileName, duration * 1000));
  }, [fileName, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const engine = getEngine();
      const snap = engine.snapshot();
      const playingNow = engine.isPlaying();
      if (playingNow && !samplerRef.current.isRunning) {
        samplerRef.current.start();
        resetMapColumns();
        resetPaint();
        endedHandled.current = false;
      }
      if (playingNow) {
        // P0 2026-11-15: observations carry AudioContext time (file timeline for
        // files, audio time since start for the mic), not the display frame clock.
        const clock = engine.clockMs() ?? undefined;
        samplerRef.current.push(snap, clock);
        pushMapColumn(snap, clock ?? performance.now());
        paintStep(snap, clock ?? performance.now(), engine.duration(), THEMES[themeId]);
        if (now - hudAt.current > 220) {
          hudAt.current = now;
          const bassPc = snap.bassChroma?.length ? dominantChroma(snap.bassChroma) : null;
          setFnHud(
            liveTracker.snapshot(
              snap.midi !== null ? midiToPc(snap.midi) : null,
              bassPc,
              clock ?? performance.now(),
            ),
          );
        }
      }
      if (engine.hasEnded() && !endedHandled.current && samplerRef.current.frames.length > 4) {
        endedHandled.current = true;
        sealMapRef.current();
      }

      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 800;
      const h = parent?.clientHeight ?? 600;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(ctx, w, h, snap, mode, THEMES[themeId], dt, !playingNow);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, themeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        void getEngine().togglePlay();
      } else if (e.key === "f" || e.key === "F") {
        void toggleFullscreen();
      } else if (e.key === "1") setMode("paint");
      else if (e.key === "2") setMode("bars");
      else if (e.key === "3") setMode("ring");
      else if (e.key === "4") setMode("field");
      else if (e.key === "m" || e.key === "M") {
        if (map) setShowMap((v) => !v);
      } else if (e.key === "Escape") {
        setShowMap(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function beginCapture() {
    samplerRef.current.start();
    resetMapColumns();
    resetPaint();
    lyricLinesRef.current = [];
    setFnHud(null);
    endedHandled.current = false;
    setMap(null);
    setShowMap(false);
  }

  async function sealMap() {
    speechStopRef.current?.();
    speechStopRef.current = null;
    setHearWords(false);
    const engine = getEngine();
    const frames = samplerRef.current.frames;
    samplerRef.current.stop();
    if (frames.length < 3) {
      toast("Not enough field to map yet");
      return;
    }
    const kind = engine.sourceKind === "none" ? "demo" : engine.sourceKind;
    const lines = lyricLinesRef.current;
    let lyrics: {
      source: "none" | "speech" | "published" | "pasted";
      text: string;
      lines: LyricLine[];
    } = {
      source: lines.length ? "speech" : "none",
      text: lines.map((l) => l.text).join("\n"),
      lines,
    };
    if (lyrics.source === "none") {
      const guess = parseTrackName(engine.fileName);
      if (guess.query && kind === "file") {
        try {
          const found = await lookupPublishedLyrics({
            data: { query: guess.query, durationSec: engine.duration() },
          });
          if (found.ok) {
            lyrics = toChartLyrics(found, frames[frames.length - 1]?.t_ms ?? 0);
            toast(`Lyrics: ${found.artist} — ${found.title}`);
          }
        } catch {
          /* published sheet is optional */
        }
      }
    }
    const plan = listenPlan ?? plannedPass(engine.fileName ?? "untitled", engine.duration() * 1000);
    const next = assembleMap({
      title: engine.fileName ?? "Untitled field",
      sourceKind: kind,
      sourceName: engine.fileName ?? "untitled",
      frames,
      intervalMs: SAMPLE_INTERVAL_MS,
      lyrics,
      paintingPng: paintingPng(),
      pass: plan.options,
    });
    const song = fileEncounter(next, plan.kind, plan.focus);
    const following = plannedPass(song.title, song.duration_ms);
    next.listen = {
      n: song.model.listens,
      pass: plan.kind,
      song_id: song.identity,
      next: following.kind,
      why: following.why,
    };
    setListenPlan(following);
    setMap(next);
    setShowMap(true);
    setChrome(true);
    toast(`Listen ${song.model.listens} · ${PASS_COPY[plan.kind].title}. Next: ${PASS_COPY[following.kind as PassKind].title}`);
  }
  sealMapRef.current = sealMap;

  async function onPlayDemo() {
    beginCapture();
    await getEngine().playDemo();
    bumpChrome();
  }

  async function onMic() {
    beginCapture();
    try {
      await getEngine().playMic();
    } catch {
      /* engine stores the error */
    }
    bumpChrome();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    beginCapture();
    await getEngine().loadFile(file);
    bumpChrome();
  }

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen().catch(() => toast("Fullscreen was blocked"));
  }

  const idle = !playing && sourceKind === "none";

  return (
    <main
      ref={stageRef}
      className="relative h-dvh overflow-hidden bg-bg text-fg"
      onPointerMove={bumpChrome}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("audio")) void onFile(file);
        else toast("Drop an audio file");
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <header
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-5 transition-opacity duration-300 ${
          chrome || idle || showMap ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto">
          <Link to="/" className="block">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Listening instrument</p>
            <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Fox Ears</h1>
          </Link>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <Link to="/jukebox" className="text-sm text-muted hover:text-fg transition-colors duration-150">
            Jukebox
          </Link>
          <Link to="/maps" className="text-sm text-muted hover:text-fg transition-colors duration-150">
            Maps
          </Link>
          <AuthSlot />
        </div>
      </header>

      {playing && listenPlan && (
        <div className="pointer-events-none absolute right-5 top-24 z-10 max-w-[16rem] text-right">
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">
            Listen {listenPlan.listenN + 1}
          </p>
          <p className="mt-1 font-display text-lg font-medium tracking-tight">
            {PASS_COPY[listenPlan.kind].title}
          </p>
          <p className="mt-1 text-xs text-muted">{PASS_COPY[listenPlan.kind].question}</p>
        </div>
      )}

      {playing && fnHud?.melody && (
        <div className="pointer-events-none absolute left-5 top-24 z-10 max-w-[14rem]">
          <p className="font-display text-5xl font-medium leading-none tracking-tight" style={{ color: `hsl(${fnHud.melody.hue} 50% 70%)` }}>
            {fnHud.melody.degree}
          </p>
          <p className="mt-2 text-sm text-muted">{fnHud.melody.feeling}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-faint">
            tonic {fnHud.tonic} {fnHud.mode}
            {fnHud.bass ? ` · bass ${fnHud.bass.degree}` : ""}
          </p>
        </div>
      )}

      {idle && !showMap && (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] z-10 flex flex-col items-center px-6 text-center">
          <p className="max-w-md text-sm leading-relaxed text-muted">
            The song paints its own identity — color, splats, washes from pitch and weight. Seal it for a lead sheet: bass-rooted chords, published lyrics when the file can be named, then the field.
          </p>
        </div>
      )}

      {error && (
        <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-elevated px-4 py-2 text-sm text-danger shadow-border">
          {error}
        </p>
      )}

      {dragOver && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-bg/70">
          <p className="font-display text-2xl">Drop audio to listen</p>
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 transition-opacity duration-300 ${
          chrome || idle || !playing ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto w-full max-w-3xl rounded-3xl bg-elevated/95 p-3 shadow-border sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="default"
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                if (sourceKind === "none") void onPlayDemo();
                else void getEngine().togglePlay();
              }}
            >
              {playing ? <Pause /> : <Play className="ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Microphone" onClick={() => void onMic()}>
              <Mic />
            </Button>
            <Button
              variant={hearWords ? "default" : "ghost"}
              size="icon"
              aria-label="Listen for words"
              onClick={() => {
                if (hearWords) {
                  speechStopRef.current?.();
                  speechStopRef.current = null;
                  setHearWords(false);
                  return;
                }
                if (!speechAvailable()) {
                  toast("This browser cannot hear words — paste lyrics after you seal");
                  return;
                }
                const handle = startLyricListen(
                  () => getEngine().currentTime() * 1000,
                  (line) => {
                    lyricLinesRef.current = [...lyricLinesRef.current, line];
                  },
                );
                speechStopRef.current = handle.stop;
                setHearWords(true);
                toast("Listening for words through the microphone");
              }}
            >
              <Type />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Upload audio"
              onClick={() => fileRef.current?.click()}
            >
              <Upload />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
                <span className="truncate">{fileName ?? "Listening etude"}</span>
                <span className="tabular shrink-0">
                  {formatTime(currentTime)}
                  {duration > 0 ? ` / ${formatTime(duration)}` : sourceKind === "mic" ? " live" : ""}
                </span>
              </div>
              <Slider
                className="mt-2"
                min={0}
                max={Math.max(duration, 0.01)}
                step={0.05}
                value={[currentTime]}
                disabled={sourceKind === "mic" || sourceKind === "none"}
                onValueChange={(v) => getEngine().seek(v[0] ?? 0)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <ModeToggle mode={mode} setMode={setMode} />
            <div className="flex items-center gap-2">
              {THEME_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={THEMES[id].label}
                  onClick={() => setThemeId(id)}
                  className={`size-6 rounded-full border transition-transform duration-150 ${
                    themeId === id ? "scale-110 border-fg" : "border-border"
                  }`}
                  style={{ background: THEMES[id].bar }}
                />
              ))}
            </div>
            <label className="ml-auto flex min-w-[140px] flex-1 items-center gap-2 sm:max-w-[220px]">
              <span className="text-[11px] uppercase tracking-wider text-muted">Sense</span>
              <Slider
                min={0.08}
                max={1}
                step={0.01}
                value={[sensitivity]}
                onValueChange={(v) => {
                  const n = v[0] ?? 0.58;
                  setSensitivity(n);
                  getEngine().setSensitivity(n);
                }}
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              variant={playing && sourceKind === "mic" ? "default" : "outline"}
              size="sm"
              onClick={sealMap}
            >
              Seal map
            </Button>
          </div>
        </div>
        {idle && (
          <button
            type="button"
            onClick={() => void onPlayDemo()}
            className="pointer-events-auto mt-3 text-sm text-muted hover:text-fg transition-colors duration-150"
          >
            Play the listening etude
          </button>
        )}
      </div>

      {showMap && map && (
        <MapPanel
          map={map}
          onClose={() => setShowMap(false)}
          onTransduced={(text) => setMap({ ...map, transduction: text })}
          onMapChange={setMap}
        />
      )}

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "#121214",
            color: "#eceae4",
            border: "1px solid rgba(236,234,228,0.12)",
          },
        }}
      />
    </main>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: VizMode;
  setMode: (m: VizMode) => void;
}) {
  const items: Array<{ id: VizMode; icon: typeof BarChart3; label: string }> = [
    { id: "paint", icon: Brush, label: "Paint" },
    { id: "bars", icon: BarChart3, label: "Bars" },
    { id: "ring", icon: Circle, label: "Ring" },
    { id: "field", icon: Radio, label: "Field" },
  ];
  return (
    <div className="flex rounded-full bg-bg p-1">
      {items.map((it) => {
        const Icon = it.icon;
        const on = mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            aria-label={it.label}
            onClick={() => setMode(it.id)}
            className={`grid size-9 place-items-center rounded-full transition-colors duration-150 ${
              on ? "bg-fg text-bg" : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
