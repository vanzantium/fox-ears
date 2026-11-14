import type { EngineSnapshot } from "@/lib/audio/engine";
import { dominantChroma, midiToPc } from "@/lib/audio/pitch";
import { liveTracker } from "@/lib/hearing/sonofield";
import { lerp } from "@/lib/utils";

const PW = 1400;
const PH = 800;
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

type Splat = {
  x: number;
  y: number;
  r: number;
  hue: number;
  sat: number;
  light: number;
  alpha: number;
  vx: number;
  vy: number;
  life: number;
  kind: "splat" | "spark" | "wash";
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let lastX = 80;
let lastY = PH * 0.55;
let lastT = -1;
let splats: Splat[] = [];
let hueMem = new Array<number>(12).fill(0);
let groundHue = 210;
let stained = false;
let identitySat = 0.4;

function ensure() {
  if (canvas && ctx) return ctx;
  canvas = document.createElement("canvas");
  canvas.width = PW;
  canvas.height = PH;
  ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("paint canvas failed");
  seedPaper(ctx);
  return ctx;
}

function seedPaper(c: CanvasRenderingContext2D) {
  c.fillStyle = "#0b0c10";
  c.fillRect(0, 0, PW, PH);
  stained = false;
  hueMem = new Array<number>(12).fill(0);
  splats = [];
  lastX = 80;
  lastY = PH * 0.55;
  lastT = -1;
  identitySat = 0.4;
  liveTracker.reset();
}

export function resetPaint() {
  const c = ensure();
  seedPaper(c);
}

function pcHue(pc: number, fifths: boolean): number {
  const i = ((Math.round(pc) % 12) + 12) % 12;
  return fifths ? (FIFTHS[i] ?? 0) * 30 : i * 30;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round(h) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}% / ${a})`;
}

function stainGround(c: CanvasRenderingContext2D, hue: number, sat: number) {
  c.globalCompositeOperation = "source-over";
  c.fillStyle = hsl(hue, 0.22 + sat * 0.2, 0.07);
  c.fillRect(0, 0, PW, PH);
  const g = c.createRadialGradient(PW * 0.5, PH * 0.55, 40, PW * 0.5, PH * 0.5, PW * 0.7);
  g.addColorStop(0, hsl(hue, 0.35 + sat * 0.25, 0.14, 0.55));
  g.addColorStop(1, hsl((hue + 40) % 360, 0.2, 0.05, 0.15));
  c.fillStyle = g;
  c.fillRect(0, 0, PW, PH);
  stained = true;
}

export function paintStep(snap: EngineSnapshot, tMs: number, duration: number, _theme?: unknown) {
  if (tMs - lastT < 18 && lastT >= 0) return;
  lastT = tMs;
  const c = ensure();
  const energy = Math.min(1, (snap.rmsL + snap.rmsR) * 10);
  if (energy < 0.008) return;

  liveTracker.push(snap.chroma, energy, tMs);
  const melodyPc = snap.midi !== null ? midiToPc(snap.midi) : dominantChroma(snap.chroma);
  const bassPc = snap.bassChroma?.length ? dominantChroma(snap.bassChroma) : melodyPc;
  const melDeg = liveTracker.ofPc(melodyPc);
  const bassDeg = liveTracker.ofPc(bassPc);

  for (let i = 0; i < 12; i++) {
    hueMem[i] = (hueMem[i] ?? 0) * 0.985 + (snap.chroma[i] ?? 0) * energy;
  }
  const idPc = dominantChroma(hueMem);
  groundHue = bassDeg?.hue ?? melDeg?.hue ?? 42;
  identitySat = lerp(identitySat, 0.35 + energy * 0.4 + (melDeg?.tension ?? 3) / 25, 0.08);

  if (!stained) stainGround(c, groundHue, identitySat);

  const progress =
    duration > 0.4 ? Math.max(0, Math.min(1, snap.currentTime / duration)) : (tMs / 48000) % 1;
  const xTarget = 40 + progress * (PW - 80) + snap.ild * 120;
  const midi = snap.midi;
  const yPitch =
    midi !== null
      ? PH - 80 - ((Math.max(40, Math.min(84, midi)) - 40) / 44) * (PH - 180)
      : PH * 0.58 - Math.min(0.4, snap.centroid / 5000) * PH * 0.3;
  const x = lerp(lastX, xTarget, 0.2);
  const y = lerp(lastY, yPitch, 0.16);

  c.globalCompositeOperation = "source-over";

  // Time-curtain: the song stains a vertical strip as it advances.
  const tension = (melDeg?.tension ?? 3) / 10;
  const curtainHue = bassDeg?.hue ?? melDeg?.hue ?? pcHue(idPc, true);
  c.fillStyle = hsl(curtainHue, 0.45 + identitySat * 0.2, 0.16 + energy * 0.1, 0.07 + energy * 0.1);
  c.fillRect(x - 10, 0, 18 + energy * 36, PH);

  // Bass wash — harmonic body, colored by bass degree vs virtual tonic.
  const bassE = Math.min(1, ((snap.bandsL[500] ?? 0) + (snap.bandsR[500] ?? 0)) * 0.7 + energy * 0.35);
  if (bassE > 0.04) {
    const hue = bassDeg?.hue ?? pcHue(bassPc, true);
    const grd = c.createRadialGradient(x, PH * 0.72, 4, x, PH * 0.68, 80 + bassE * 220);
    grd.addColorStop(0, hsl(hue, 0.62 + snap.vocal * 0.15, 0.38, 0.22 + bassE * 0.28));
    grd.addColorStop(1, hsl(hue, 0.4, 0.16, 0));
    c.fillStyle = grd;
    c.beginPath();
    c.ellipse(x, PH * 0.7, 50 + bassE * 180, 30 + bassE * 90, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Melody stroke — feeling-state hue of the sung degree.
  const mHue = melDeg?.hue ?? pcHue(melodyPc, false);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = hsl(mHue, 0.68 + tension * 0.2, 0.46 + energy * 0.1, 0.72);
  c.lineWidth = 3.5 + energy * (18 + tension * 10);
  c.beginPath();
  c.moveTo(lastX, lastY);
  c.quadraticCurveTo((lastX + x) / 2, (lastY + y) / 2 - energy * 28, x, y);
  c.stroke();

  // Mid-band ribbon.
  const mid = ((snap.bandsL[1000] ?? 0) + (snap.bandsR[1000] ?? 0)) * 0.5;
  if (mid > 0.08) {
    c.strokeStyle = hsl((bassDeg?.hue ?? mHue) + 18, 0.55, 0.4, Math.min(0.45, mid * 0.4));
    c.lineWidth = 10 + mid * 24;
    c.beginPath();
    c.moveTo(lastX, lastY + 18);
    c.lineTo(x, y + 18);
    c.stroke();
  }

  // Onset / flux splats — attacks, sized by tension.
  if (snap.onset > 0.12 || snap.flux > 0.14) {
    const n = 5 + Math.floor((snap.onset + energy + tension) * 10);
    for (let i = 0; i < n; i++) {
      const pc = pickChroma(snap.chroma);
      const st = liveTracker.ofPc(pc);
      splats.push({
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.55) * 120,
        r: 8 + energy * 28 + tension * 22 + Math.random() * 20,
        hue: st?.hue ?? pcHue(pc, true),
        sat: 0.62 + tension * 0.25,
        light: 0.4 + Math.random() * 0.14,
        alpha: 0.28 + energy * 0.28,
        vx: (Math.random() - 0.5) * 1.8,
        vy: (Math.random() - 0.7) * 1.4,
        life: 1,
        kind: "splat",
      });
    }
  }

  // Continuous drips so a sustained tone still stains the page.
  if (energy > 0.05 && Math.random() < 0.28 + energy * 0.4) {
    splats.push({
      x: x + (Math.random() - 0.5) * 36,
      y: y + (Math.random() - 0.3) * 48,
      r: 5 + energy * 18 + tension * 8,
      hue: mHue,
      sat: 0.65,
      light: 0.4 + energy * 0.12,
      alpha: 0.22 + energy * 0.2,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.3 + Math.random() * 0.8,
      life: 1,
      kind: "splat",
    });
  }

  // High sparkle.
  const high = ((snap.bandsL[4000] ?? 0) + (snap.bandsR[4000] ?? 0)) * 0.5;
  if (high > 0.1) {
    for (let i = 0; i < 3; i++) {
      splats.push({
        x: x + (Math.random() - 0.5) * 50,
        y: y - 20 - Math.random() * 80,
        r: 1.2 + high * 4,
        hue: pcHue(melodyPc, false) + 20,
        sat: 0.4,
        light: 0.78,
        alpha: high * 0.5,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -0.4 - Math.random(),
        life: 0.8,
        kind: "spark",
      });
    }
  }

  // Vocal bloom.
  if (snap.vocal > 0.45 && energy > 0.04) {
    const g = c.createRadialGradient(x, y, 2, x, y, 30 + snap.vocal * 70);
    g.addColorStop(0, hsl(18 + mHue * 0.08, 0.7, 0.62, 0.18 + snap.vocal * 0.15));
    g.addColorStop(1, hsl(12, 0.5, 0.4, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, 30 + snap.vocal * 70, 0, Math.PI * 2);
    c.fill();
  }

  if (splats.length > 140) splats = splats.slice(splats.length - 140);
  for (const s of splats) {
    s.x += s.vx;
    s.y += s.vy;
    s.life *= s.kind === "spark" ? 0.9 : 0.965;
    s.r *= 1.01;
    if (s.life < 0.04) continue;
    if (s.kind === "spark") c.globalCompositeOperation = "lighter";
    else c.globalCompositeOperation = "source-over";
    c.fillStyle = hsl(s.hue, s.sat, s.light, s.alpha * s.life);
    c.beginPath();
    c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    c.fill();
  }
  splats = splats.filter((s) => s.life > 0.05);

  c.globalCompositeOperation = "source-over";
  lastX = x;
  lastY = y;
}

function pickChroma(chroma: number[]): number {
  let sum = 0;
  for (const v of chroma) sum += v;
  if (sum <= 0) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < chroma.length; i++) {
    r -= chroma[i] ?? 0;
    if (r <= 0) return i;
  }
  return dominantChroma(chroma);
}

export function blitPaint(
  dest: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ensure();
  if (!canvas) return;
  dest.drawImage(canvas, x, y, w, h);
}

export function paintingPng(): string | undefined {
  if (!canvas) return undefined;
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function downloadPainting(title: string) {
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "song"}-painting.png`;
  a.click();
}
