import { useEffect, useRef, useState } from "react";
import { drawSonar, sonarLayout } from "@/lib/viz/sonar";
import type { SongChart } from "@/lib/hearing/types";

/** P4 Sonar Form tab: the echo map, shape arcs and strips (lib/viz/sonar.ts). */
export function SonarView({ chart, durationMs }: { chart: SongChart; durationMs: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || width <= 0) return;
    const layout = sonarLayout(width);
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    c.width = Math.round(layout.width * dpr);
    c.height = Math.round(layout.height * dpr);
    c.style.width = `${layout.width}px`;
    c.style.height = `${layout.height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSonar(ctx, layout, chart, durationMs);
  }, [chart, durationMs, width]);

  const s = chart.sonar;
  const a = s?.section_agreement;
  return (
    <div ref={wrap} className="w-full">
      <canvas ref={canvas} className="block w-full rounded-xl" aria-label="Sonar form: self-similarity echo map and repetition strips" />
      {s ? (
        <div className="mt-3 space-y-1 text-sm text-muted leading-relaxed">
          <p>
            <span className="text-fg">Repetition:</span> {s.letters || "—"} · loop {s.loop?.bars || "none"}
            {s.loop?.bars ? " bars" : ""} · form period {s.loop?.period_bars || "none"}
            {s.loop?.period_bars ? " bars" : ""}
          </p>
          {a ? (
            <p>
              <span className="text-fg">Agreement with Form:</span> {a.agreed}/{a.boundaries} cuts. Diamonds are changes sonar hears that Form did not cut; clay dashes are Form cuts where the harmony repeats.
            </p>
          ) : null}
          <p>
            Passive echolocation: every bar is compared with every other bar (harmony and bass only). Bright cells are bars that sound alike; stripes off the diagonal are repeats. Everything here is SOFT, experimental and uncalibrated on real songs; it never edits the chart or its sections.
          </p>
        </div>
      ) : null}
    </div>
  );
}
