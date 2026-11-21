/**
 * SONAR FORM view (P4, 2026-11-21): the song's echo map, drawn for a person.
 *
 *  left  — bar × bar self-similarity: bright cells are bars that sound alike;
 *          the diagonal stripes off the centre line are repeats.
 *  right — "shape" arcs joining each phrase to its next return (after
 *          Wattenberg's Shape of Song), then strips: sonar letters, FORM
 *          sections (solid tick = both methods cut here, clay dash = FORM only,
 *          diamond = sonar only), riff hits (+n = moved), spiral-array strain,
 *          lyric line starts, time.
 *
 * Pure drawing: takes a 2D context and the chart; no React, no state.
 */
import type { SongChart } from "@/lib/hearing/types";

const BG = "#121214";
const FG = "#eceae4";
const MUTED = "#8a8880";
const GRID = "rgba(236,234,228,0.08)";
const CLAY = "#c47a72";
const STRAIN = "#c9a798";

const LETTER_HUES = [205, 18, 140, 280, 45, 330, 175, 95, 250, 0, 60, 300];

export function letterColour(letter: string, alpha = 1): string {
  if (letter === "–") return `rgba(138,136,128,${0.35 * alpha})`;
  const base = letter.replace(/'+$/, "");
  const i = Math.max(0, base.charCodeAt(0) - 65);
  const hue = LETTER_HUES[i % LETTER_HUES.length]!;
  const light = letter.endsWith("'") ? 72 : 62;
  return `hsla(${hue}, 38%, ${light}%, ${alpha})`;
}

/**
 * Similarity digit 0–9 → colour on a dark-to-bone ramp, contrast-stretched
 * above the song's own median cell (`floor`), so a song whose bars all share
 * chords does not turn the whole map grey. Display only.
 */
function ssmColour(d: number, floor: number): string {
  const t = Math.max(0, Math.min(1, (d - floor) / Math.max(1, 9 - floor)));
  const k = Math.pow(t, 1.4); // keep the background quiet; let repeats glow
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * k);
  return `rgb(${lerp(18, 243)}, ${lerp(18, 228)}, ${lerp(20, 200)})`;
}

export type SonarLayout = { wide: boolean; width: number; height: number };

export function sonarLayout(width: number): SonarLayout {
  const wide = width >= 640;
  const pad = 16;
  const s = wide ? Math.min(380, Math.floor(width * 0.4)) : width - pad * 2;
  const height = wide ? Math.max(400, s + pad * 2 + 24) : s + pad * 2 + 24 + 320;
  return { wide, width, height };
}

function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`;
}

export function drawSonar(ctx: CanvasRenderingContext2D, layout: SonarLayout, chart: SongChart, durationMs: number): void {
  const { wide, width, height } = layout;
  const pad = 16;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  const s = chart.sonar;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  if (!s) {
    ctx.fillStyle = MUTED;
    ctx.fillText("No sonar reading for this map (sealed before P4, or too short).", pad, pad + 14);
    return;
  }

  // ── self-similarity square ─────────────────────────────────────────────
  const S = wide ? Math.min(380, Math.floor(width * 0.4)) : width - pad * 2;
  const sx = pad;
  const sy = pad + 18;
  ctx.fillStyle = MUTED;
  ctx.fillText(`echo map · ${s.bars.length} bars${s.ssm_step_bars > 1 ? ` (${s.ssm_step_bars} per cell)` : ""}`, sx, pad + 6);
  const n = s.ssm_rows.length;
  if (n) {
    const cell = S / n;
    const all = s.ssm_rows.join("").split("").map(Number).sort((a, b) => a - b);
    const floor = all[Math.floor(all.length / 2)] ?? 0;
    for (let i = 0; i < n; i++) {
      const row = s.ssm_rows[i]!;
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = ssmColour(Number(row[j] ?? 0), floor);
        ctx.fillRect(sx + j * cell, sy + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    // phrase grid + letters along the left edge
    ctx.strokeStyle = "rgba(18,18,20,0.55)";
    ctx.lineWidth = 1;
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    for (const p of s.phrases) {
      const k = (p.bar / s.ssm_step_bars) * cell;
      ctx.beginPath();
      ctx.moveTo(sx, sy + k);
      ctx.lineTo(sx + S, sy + k);
      ctx.moveTo(sx + k, sy);
      ctx.lineTo(sx + k, sy + S);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = GRID;
  ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1);

  // ── timeline panel ─────────────────────────────────────────────────────
  const tx = wide ? sx + S + 64 : pad + 48;
  const ty = wide ? pad : sy + S + 28;
  const tw = width - tx - pad;
  const dur = Math.max(1, durationMs);
  const X = (t: number) => tx + (Math.max(0, Math.min(dur, t)) / dur) * tw;
  const rowLabel = (label: string, y: number) => {
    ctx.fillStyle = MUTED;
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(label, tx - 8, y);
    ctx.textAlign = "left";
  };

  // shape arcs: each phrase to the next phrase with the same base letter
  const arcMax = wide ? 110 : 70;
  const arcBase = ty + arcMax + 10;
  rowLabel("shape", arcBase - 4);
  const byLetter = new Map<string, typeof s.phrases>();
  for (const p of s.phrases) {
    const b = p.letter.replace(/'+$/, "");
    if (b === "–") continue;
    byLetter.set(b, [...(byLetter.get(b) ?? []), p]);
  }
  for (const [letter, list] of byLetter) {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const xa = (X(a.t_start_ms) + X(a.t_end_ms)) / 2;
      const xb = (X(b.t_start_ms) + X(b.t_end_ms)) / 2;
      const r = (xb - xa) / 2;
      ctx.strokeStyle = letterColour(letter, 0.55);
      ctx.lineWidth = Math.max(1.5, Math.min(6, (X(a.t_end_ms) - X(a.t_start_ms)) / 6));
      ctx.beginPath();
      ctx.ellipse(xa + r, arcBase, r, Math.min(arcMax, r * 0.9), 0, Math.PI, 2 * Math.PI);
      ctx.stroke();
    }
  }

  // sonar letters strip
  const yS = arcBase + 8;
  const hS = 22;
  rowLabel("sonar", yS + 15);
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  for (const p of s.phrases) {
    const x0 = X(p.t_start_ms);
    const x1 = X(p.t_end_ms);
    ctx.fillStyle = letterColour(p.letter, 0.85);
    ctx.fillRect(x0 + 0.5, yS, Math.max(1, x1 - x0 - 1), hS);
    if (x1 - x0 > 14) {
      ctx.fillStyle = BG;
      ctx.fillText(p.letter, x0 + 4, yS + 15);
    }
  }
  const agree = s.section_agreement;
  for (const t of agree?.sonar_only_ms ?? []) {
    const x = X(t);
    ctx.fillStyle = FG;
    ctx.beginPath();
    ctx.moveTo(x, yS - 6);
    ctx.lineTo(x + 4, yS - 2);
    ctx.lineTo(x, yS + 2);
    ctx.lineTo(x - 4, yS - 2);
    ctx.closePath();
    ctx.fill();
  }

  // FORM strip
  const yF = yS + hS + 10;
  const hF = 22;
  rowLabel("form", yF + 15);
  chart.sections.forEach((sec, i) => {
    const x0 = X(sec.t_start_ms);
    const x1 = X(sec.t_end_ms);
    ctx.fillStyle = i % 2 ? "rgba(216,210,198,0.16)" : "rgba(216,210,198,0.26)";
    ctx.fillRect(x0 + 0.5, yF, Math.max(1, x1 - x0 - 1), hF);
    const full = `${sec.label} ${sec.role === "section" || sec.role === "phrase" ? "" : sec.role}`.trim();
    const room = x1 - x0 - 8;
    const text = ctx.measureText(full).width <= room ? full : ctx.measureText(sec.label).width <= room ? sec.label : "";
    if (text) {
      ctx.fillStyle = FG;
      ctx.fillText(text, x0 + 4, yF + 15);
    }
  });
  const onlyForm = new Set(agree?.section_only_ms ?? []);
  for (const sec of chart.sections.slice(1)) {
    const x = X(sec.t_start_ms);
    const formOnly = onlyForm.has(Math.round(sec.t_start_ms));
    ctx.strokeStyle = formOnly ? CLAY : FG;
    ctx.lineWidth = 2;
    ctx.setLineDash(formOnly ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x, yF - 4);
    ctx.lineTo(x, yF + hF + 4);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // riff hits
  const yR = yF + hF + 22;
  rowLabel("riff", yR + 4);
  for (const h of s.motif?.hits ?? []) {
    const x = X(h.t_ms);
    ctx.fillStyle = h.origin ? FG : h.transpose ? CLAY : "rgba(216,210,198,0.8)";
    ctx.beginPath();
    ctx.moveTo(x, yR - 6);
    ctx.lineTo(x + 5, yR + 4);
    ctx.lineTo(x - 5, yR + 4);
    ctx.closePath();
    ctx.fill();
    if (h.transpose) {
      ctx.fillStyle = CLAY;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(`${h.transpose > 0 ? "+" : ""}${h.transpose}`, x + 6, yR + 4);
    }
  }

  // strain curve
  const yT = yR + 22;
  const hT = 54;
  rowLabel("strain", yT + hT / 2);
  const tb = s.tension?.bars ?? [];
  const max = s.tension?.max.strain || 1;
  if (tb.length) {
    ctx.fillStyle = "rgba(201,167,152,0.14)";
    ctx.beginPath();
    ctx.moveTo(X(tb[0]!.t_ms), yT + hT);
    for (const b of tb) ctx.lineTo(X(b.t_ms), yT + hT - (b.strain / max) * hT);
    ctx.lineTo(X(tb[tb.length - 1]!.t_ms), yT + hT);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = STRAIN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    tb.forEach((b, i) => {
      const x = X(b.t_ms);
      const y = yT + hT - (b.strain / max) * hT;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else {
    ctx.fillStyle = MUTED;
    ctx.fillText("needs a key", tx, yT + hT / 2);
  }

  // lyric line starts
  const yL = yT + hT + 16;
  rowLabel("lyrics", yL + 4);
  ctx.strokeStyle = "rgba(236,234,228,0.5)";
  ctx.lineWidth = 1;
  for (const l of chart.lyrics.lines) {
    const x = X(l.t_ms);
    ctx.beginPath();
    ctx.moveTo(x, yL - 4);
    ctx.lineTo(x, yL + 6);
    ctx.stroke();
  }

  // time axis
  const yA = yL + 24;
  ctx.strokeStyle = GRID;
  ctx.beginPath();
  ctx.moveTo(tx, yA);
  ctx.lineTo(tx + tw, yA);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  const step = dur > 240000 ? 60000 : 30000;
  for (let t = 0; t <= dur; t += step) {
    const x = X(t);
    ctx.fillRect(x, yA, 1, 4);
    ctx.fillText(fmt(t), x + 2, yA + 14);
  }
}
