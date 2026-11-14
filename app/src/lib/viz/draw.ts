import type { EngineSnapshot } from "@/lib/audio/engine";
import type { VizMode } from "@/lib/hearing/types";
import { lerp } from "@/lib/utils";
import { blitPaint } from "./paint";
import type { VizTheme } from "./themes";

const BAR_N = 72;
const smoothed = new Float32Array(BAR_N);
const peaks = new Float32Array(BAR_N);
let earLean = 0;
let glowPulse = 0;

export type MapColumn = {
  bins: Float32Array;
  spatial: number;
  energy: number;
  onset: number;
};

const MAP_BINS = 36;
const MAX_COLS = 720;
export const mapColumns: MapColumn[] = [];
let lastColT = -1;

export function resetMapColumns() {
  mapColumns.length = 0;
  lastColT = -1;
}

export function pushMapColumn(snap: EngineSnapshot, tMs: number) {
  if (tMs - lastColT < 70 && lastColT >= 0) return;
  lastColT = tMs;
  const bins = new Float32Array(MAP_BINS);
  const src = snap.freqM;
  const n = src.length;
  for (let i = 0; i < MAP_BINS; i++) {
    const t0 = Math.pow(i / MAP_BINS, 1.6);
    const t1 = Math.pow((i + 1) / MAP_BINS, 1.6);
    const a = Math.floor(t0 * n);
    const b = Math.max(a + 1, Math.floor(t1 * n));
    let s = 0;
    for (let k = a; k < b && k < n; k++) s += src[k] ?? 0;
    bins[i] = s / Math.max(1, b - a) / 255;
  }
  if (mapColumns.length >= MAX_COLS) mapColumns.shift();
  mapColumns.push({
    bins,
    spatial: snap.ild,
    energy: (snap.rmsL + snap.rmsR) * 0.5,
    onset: snap.onset,
  });
}

function logBin(freq: Uint8Array, i: number, n: number): number {
  const t0 = Math.pow(i / n, 1.55);
  const t1 = Math.pow((i + 1) / n, 1.55);
  const a = Math.floor(t0 * freq.length);
  const b = Math.max(a + 1, Math.floor(t1 * freq.length));
  let s = 0;
  for (let k = a; k < b && k < freq.length; k++) s += freq[k] ?? 0;
  return s / Math.max(1, b - a) / 255;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EngineSnapshot,
  mode: VizMode,
  theme: VizTheme,
  dt: number,
  idle: boolean,
) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.46;
  const energy = Math.min(1, (snap.rmsL + snap.rmsR) * 8 + (idle ? 0.04 : 0));
  glowPulse = lerp(glowPulse, energy, 1 - Math.exp(-dt * 6));
  const targetLean = clamp((snap.rmsL - snap.rmsR) * 14, -1, 1);
  earLean = lerp(earLean, idle ? Math.sin(performance.now() / 1400) * 0.12 : targetLean, 1 - Math.exp(-dt * 5));

  if (mode === "paint") {
    blitPaint(ctx, 0, 0, w, h);
    drawMapStrip(ctx, w, h, theme, snap.currentTime, snap.duration);
    return;
  }

  for (let i = 0; i < BAR_N; i++) {
    const raw = idle
      ? 0.04 + 0.03 * Math.sin(performance.now() / 900 + i * 0.18)
      : logBin(snap.freqM, i, BAR_N);
    smoothed[i] = lerp(smoothed[i] ?? 0, raw, 1 - Math.exp(-dt * 10));
    peaks[i] = Math.max((peaks[i] ?? 0) * Math.exp(-dt * 1.6), smoothed[i] ?? 0);
  }

  // vignette
  const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(w, h) * 0.7);
  g.addColorStop(0, theme.glow);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (mode === "bars") drawBars(ctx, w, h, theme, cx);
  else if (mode === "field") drawField(ctx, w, h, snap, theme, idle);
  else drawRing(ctx, w, h, theme, cx, cy);

  drawListener(ctx, cx, cy, theme, mode === "bars" ? 0.72 : 1);
  drawMapStrip(ctx, w, h, theme, snap.currentTime, snap.duration);
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VizTheme,
  cx: number,
) {
  const margin = Math.max(24, w * 0.08);
  const usable = w - margin * 2;
  const gap = 2;
  const bw = Math.max(2, usable / BAR_N - gap);
  const base = h * 0.78;
  const maxH = h * 0.52;
  for (let i = 0; i < BAR_N; i++) {
    const v = smoothed[i] ?? 0;
    const x = margin + i * (bw + gap);
    const bh = Math.max(2, v * maxH);
    const t = i / BAR_N;
    ctx.fillStyle = mix(theme.left, theme.right, t);
    roundRect(ctx, x, base - bh, bw, bh, Math.min(4, bw / 2));
    ctx.fill();
    const p = peaks[i] ?? 0;
    ctx.fillStyle = theme.barHi;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x, base - p * maxH - 2, bw, 2);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = theme.grid;
  ctx.beginPath();
  ctx.moveTo(margin, base + 8);
  ctx.lineTo(w - margin, base + 8);
  ctx.stroke();
  void cx;
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VizTheme,
  cx: number,
  cy: number,
) {
  const radius = Math.min(w, h) * 0.28;
  const inner = radius * 0.62;
  const n = BAR_N;
  for (let i = 0; i < n; i++) {
    const v = smoothed[i] ?? 0;
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 0.86) / n) * Math.PI * 2 - Math.PI / 2;
    const r1 = inner;
    const r2 = inner + v * (radius * 1.15);
    ctx.beginPath();
    ctx.arc(cx, cy, r2, a0, a1);
    ctx.arc(cx, cy, r1, a1, a0, true);
    ctx.closePath();
    const t = 0.5 + 0.5 * Math.sin((i / n) * Math.PI * 2 + earLean);
    ctx.fillStyle = mix(theme.left, theme.right, t);
    ctx.globalAlpha = 0.35 + v * 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, inner - 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EngineSnapshot,
  theme: VizTheme,
  idle: boolean,
) {
  const top = h * 0.12;
  const bot = h * 0.74;
  const mid = (top + bot) / 2;
  ctx.strokeStyle = theme.grid;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, top);
  ctx.lineTo(w * 0.5, bot);
  ctx.moveTo(w * 0.12, mid);
  ctx.lineTo(w * 0.88, mid);
  ctx.stroke();

  const n = 48;
  for (let i = 0; i < n; i++) {
    const vL = logBin(snap.freqL, i, n);
    const vR = logBin(snap.freqR, i, n);
    const v = (vL + vR) * 0.5;
    if (v < 0.03 && !idle) continue;
    const y = bot - (i / n) * (bot - top);
    const spat = (vL - vR) * 1.8 + earLean * 0.15;
    const x = w * 0.5 + spat * w * 0.32;
    const r = 2 + v * 18;
    ctx.beginPath();
    ctx.fillStyle = mix(theme.left, theme.right, 0.5 - spat * 0.5);
    ctx.globalAlpha = 0.25 + v * 0.7;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawListener(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  theme: VizTheme,
  scale: number,
) {
  ctx.save();
  ctx.translate(cx, cy + 10 * scale);
  ctx.scale(scale, scale);
  ctx.strokeStyle = theme.ink;
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";

  // head
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 18, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.stroke();

  drawEar(ctx, -14, -8, -0.35 + earLean * 0.45);
  drawEar(ctx, 14, -8, 0.35 + earLean * 0.45);

  ctx.restore();
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilt: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(-7, 10);
  ctx.lineTo(0, -22);
  ctx.lineTo(7, 10);
  ctx.closePath();
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 8);
  ctx.lineTo(0, -12);
  ctx.lineTo(3, 8);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.restore();
}

function drawMapStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VizTheme,
  current: number,
  duration: number,
) {
  const stripH = Math.max(48, Math.min(72, h * 0.1));
  const y = h - stripH - 18;
  const x = 16;
  const bw = w - 32;
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, x, y, bw, stripH, 10);
  ctx.fill();
  ctx.strokeStyle = theme.grid;
  ctx.stroke();

  if (mapColumns.length === 0) return;
  const colW = bw / Math.max(mapColumns.length, 1);
  for (let c = 0; c < mapColumns.length; c++) {
    const col = mapColumns[c];
    if (!col) continue;
    for (let b = 0; b < col.bins.length; b++) {
      const v = col.bins[b] ?? 0;
      if (v < 0.04) continue;
      const bh = stripH / col.bins.length;
      const yy = y + stripH - (b + 1) * bh;
      ctx.globalAlpha = 0.2 + v * 0.8;
      ctx.fillStyle = mix(theme.left, theme.right, 0.5 - col.spatial * 4);
      ctx.fillRect(x + c * colW, yy, Math.max(1, colW + 0.5), bh + 0.4);
    }
  }
  ctx.globalAlpha = 1;
  if (duration > 0) {
    const px = x + (current / duration) * bw;
    ctx.strokeStyle = theme.ink;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + stripH);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const u = clamp(t, 0, 1);
  const r = Math.round(ca.r + (cb.r - ca.r) * u);
  const g = Math.round(ca.g + (cb.g - ca.g) * u);
  const bl = Math.round(ca.b + (cb.b - ca.b) * u);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
