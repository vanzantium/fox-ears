#!/usr/bin/env node
/**
 * Fox Ears desktop browser pass (P0, 2026-11-15).
 *   node scripts/browser-pass.mjs <audio file> [--url http://localhost:8080/] [--chrome /usr/bin/google-chrome] [--out pass.json]
 * Opens the running dev build in headless Chrome, loads the file through the
 * app's own file input, lets it play to the end (real AudioContext, real
 * requestAnimationFrame), then reads the sealed hearing map from the dev-only
 * window.__foxEarsLastMap hook (FoxEarsApp sealMap, DEV builds only):
 * tempo, key, sections, plus tick statistics (how many analyser reads, their
 * spacing, gaps). Compare with the offline harness on the same file.
 * A phone pass is manual: see docs/browser-phone-check.md.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : dflt;
};
const url = opt("--url", "http://localhost:8080/");
const chrome = opt("--chrome", process.env.CHROME_PATH || undefined);
const out = opt("--out", "");
const timeoutS = Number(opt("--timeout-s", "240"));
const file = args[0];
if (!file) {
  console.error("usage: node scripts/browser-pass.mjs <audio file> [--url ...] [--chrome ...] [--out ...]");
  process.exit(2);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle" });
// A cold Vite dev server may optimise dependencies and reload once; settle first.
await page.waitForTimeout(3000);
await page.waitForLoadState("networkidle");
const ua = await page.evaluate(() => navigator.userAgent);
const rafHz = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => (++n < 120 ? requestAnimationFrame(f) : res(Math.round((n * 1000) / (performance.now() - t0))));
      requestAnimationFrame(f);
      setTimeout(() => res(null), 5000);
    }),
);
const t0 = Date.now();
await page.setInputFiles('input[type="file"]', file);
let entry = null;
while (Date.now() - t0 < timeoutS * 1000) {
  await page.waitForTimeout(2000);
  entry = await page.evaluate(() => {
    const m = window.__foxEarsLastMap;
    return m ? { map: m, durationMs: m.duration_ms ?? null } : null;
  });
  if (entry) break;
}
await browser.close();
if (!entry) {
  console.log(JSON.stringify({ ok: false, error: "no sealed map before timeout", consoleErrors }, null, 2));
  process.exit(1);
}
const map = entry.map;
const c = map.chart ?? {};
const ticks = [];
for (const f of map.frames ?? []) for (const t of f.ticks?.t_ms ?? []) ticks.push(t);
const dts = ticks.slice(1).map((t, i) => t - ticks[i]).sort((a, b) => a - b);
const q = (p) => (dts.length ? Math.round(dts[Math.floor(p * (dts.length - 1))] * 10) / 10 : null);
const result = {
  ok: true,
  date: new Date().toISOString(),
  userAgent: ua,
  measuredRafHz: rafHz,
  file,
  wallSeconds: Math.round((Date.now() - t0) / 1000),
  durationMs: entry.durationMs,
  frames: map.frames?.length ?? 0,
  ticks: ticks.length,
  tickIntervalMs: { p05: q(0.05), median: q(0.5), p95: q(0.95), max: dts.length ? Math.round(dts[dts.length - 1]) : null },
  tempo_bpm: c.tempo_bpm ?? null,
  tempo_confidence: c.tempo_confidence ?? null,
  tempo_note: c.tempo_note ?? null,
  key: c.key ? `${c.key.tonic} ${c.key.mode} (${Math.round(c.key.confidence * 100) / 100})` : "UNKNOWN",
  sections: (c.sections ?? []).length,
  section_cuts_s: (c.sections ?? []).slice(1).map((s) => Math.round(s.t_start_ms / 100) / 10),
  consoleErrors: consoleErrors.slice(0, 10),
};
console.log(JSON.stringify(result, null, 2));
if (out) writeFileSync(out, JSON.stringify(result, null, 2));
