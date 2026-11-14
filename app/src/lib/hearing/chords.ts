import { chromaReliability } from "@/lib/audio/chroma";
import { romanize, PC_NAMES } from "./sonofield";
import type { ChordEvent, HearingFrame, SongChart } from "./types";

const MAJ = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const MIN = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];
const STATES: Array<{ root: number; quality: "maj" | "min"; suffix: string; vec: number[] }> = [];
for (let r = 0; r < 12; r++) {
  STATES.push({ root: r, quality: "maj", suffix: "", vec: MAJ });
  STATES.push({ root: r, quality: "min", suffix: "m", vec: MIN });
}

function cosine(a: number[], b: number[], root: number): number {
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] ?? 0;
    const y = b[(i - root + 12) % 12] ?? 0;
    n += x * y;
    da += x * x;
    db += y * y;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : n / d;
}

function peakPc(v: number[]): number {
  return v.reduce((bi, x, i, arr) => (x > (arr[bi] ?? 0) ? i : bi), 0);
}

function accumulate(slice: HearingFrame[]) {
  const chroma = new Array<number>(12).fill(0);
  const bass = new Array<number>(12).fill(0);
  let energy = 0;
  for (const f of slice) {
    const w = (f.left_ear.level + f.right_ear.level) * 0.5 + 0.02;
    energy += w;
    if (f.chroma) for (let k = 0; k < 12; k++) chroma[k] += (f.chroma[k] ?? 0) * w;
    if (f.bass_chroma) for (let k = 0; k < 12; k++) bass[k] += (f.bass_chroma[k] ?? 0) * w;
  }
  return { chroma, bass, energy };
}

function inFamily(
  root: number,
  quality: "maj" | "min",
  keys: Array<{ tonic: string; mode: "major" | "minor" }>,
): boolean {
  for (const key of keys) {
    const tonic = PC_NAMES.indexOf(key.tonic);
    if (tonic < 0) continue;
    const deg = (root - tonic + 12) % 12;
    if (key.mode === "minor") {
      if (quality === "min" && (deg === 0 || deg === 5 || deg === 7)) return true;
      if (quality === "maj" && (deg === 3 || deg === 8 || deg === 10)) return true;
    } else {
      if (quality === "maj" && (deg === 0 || deg === 5 || deg === 7)) return true;
      if (quality === "min" && (deg === 2 || deg === 4 || deg === 9)) return true;
    }
  }
  return false;
}

export function inferChords(
  frames: HearingFrame[],
  key: SongChart["key"],
  hypotheses: SongChart["key_hypotheses"] = [],
  winMs = 2200,
): ChordEvent[] {
  const rel = chromaReliability(frames.map((f) => ({ chroma: f.chroma })));
  if (!rel.ok || frames.length < 12) return [];

  const keys = [
    ...(key ? [{ tonic: key.tonic, mode: key.mode }] : []),
    ...(hypotheses ?? []),
  ];

  const dt = Math.max(40, (frames[1]?.t_ms ?? 80) - (frames[0]?.t_ms ?? 0));
  const win = Math.max(12, Math.round(winMs / dt));
  const hop = Math.max(5, Math.round((winMs * 0.32) / dt));
  const emissions: number[][] = [];
  const alts: string[][] = [];
  const times: Array<{ t0: number; t1: number }> = [];

  for (let i = 0; i < frames.length; i += hop) {
    const slice = frames.slice(i, i + win);
    if (slice.length < 6) continue;
    const { chroma, bass, energy } = accumulate(slice);
    if (energy < 0.12) continue;
    const bassPc = peakPc(bass);
    const bassPeak = bass[bassPc] ?? 0;
    const bassInFamily = keys.some((k) => {
      const tonic = PC_NAMES.indexOf(k.tonic);
      if (tonic < 0) return false;
      const deg = (bassPc - tonic + 12) % 12;
      return [0, 2, 3, 4, 5, 7, 8, 9, 10].includes(deg);
    });

    const row = STATES.map((st) => {
      let s = cosine(chroma, st.vec, st.root);
      const family = inFamily(st.root, st.quality, keys);
      if (family) s += 0.22;
      else s -= 0.16;
      if (bassPeak > 0.14 && bassInFamily) {
        if (st.root === bassPc) s += 0.18;
        else if ((st.root + 7) % 12 === bassPc) s += 0.04;
      }
      return s;
    });

    const ranked = row
      .map((s, idx) => ({ s, idx }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0]!;
    const second = ranked[1]!;
    const bestSt = STATES[best.idx]!;
    if (!inFamily(bestSt.root, bestSt.quality, keys) && second && inFamily(STATES[second.idx]!.root, STATES[second.idx]!.quality, keys)) {
      if (best.s - second.s < 0.18) {
        row[best.idx] = best.s - 0.12;
        row[second.idx] = second.s + 0.06;
      }
    }
    emissions.push(row);
    alts.push(
      ranked.slice(0, 3).map((r) => {
        const st = STATES[r.idx]!;
        return `${PC_NAMES[st.root]}${st.suffix}`;
      }),
    );
    times.push({ t0: slice[0]!.t_ms, t1: slice[slice.length - 1]!.t_ms });
  }
  if (!emissions.length) return [];

  const nS = STATES.length;
  const nT = emissions.length;
  const dp = emissions.map((row) => row.map(() => -Infinity));
  const bt: number[][] = emissions.map((row) => row.map(() => 0));
  dp[0] = emissions[0]!.slice();
  for (let t = 1; t < nT; t++) {
    for (let s = 0; s < nS; s++) {
      let best = -Infinity;
      let arg = s;
      const st = STATES[s]!;
      const family = inFamily(st.root, st.quality, keys);
      for (let p = 0; p < nS; p++) {
        const trans = p === s ? 0.32 : family ? -0.1 : -0.22;
        const v = (dp[t - 1]![p] ?? -Infinity) + trans;
        if (v > best) {
          best = v;
          arg = p;
        }
      }
      dp[t]![s] = best + (emissions[t]![s] ?? 0);
      bt[t]![s] = arg;
    }
  }
  let last = 0;
  for (let s = 1; s < nS; s++) if ((dp[nT - 1]![s] ?? -Infinity) > (dp[nT - 1]![last] ?? -Infinity)) last = s;
  const path: number[] = new Array(nT);
  path[nT - 1] = last;
  for (let t = nT - 1; t > 0; t--) path[t - 1] = bt[t]![path[t]!] ?? 0;

  const raw: ChordEvent[] = [];
  for (let t = 0; t < nT; t++) {
    const st = STATES[path[t]!]!;
    const tm = times[t]!;
    const scores = emissions[t]!;
    const chosen = scores[path[t]!] ?? 0;
    const rest = scores.filter((_, i) => i !== path[t]!);
    const second = Math.max(...rest, 0);
    const margin = Math.max(0, chosen - second);
    const conf = Math.round(Math.min(0.82, Math.max(0.18, 0.32 + margin * 1.15)) * 100) / 100;
    const tonicPc = key ? PC_NAMES.indexOf(key.tonic) : -1;
    const rn =
      key && tonicPc >= 0
        ? romanize(st.root, st.root, st.quality, tonicPc, key.mode)
        : null;
    const alt = (alts[t] ?? []).find((s) => s !== `${PC_NAMES[st.root]}${st.suffix}`);
    raw.push({
      t_ms: tm.t0,
      dur_ms: Math.max(400, tm.t1 - tm.t0),
      symbol: `${PC_NAMES[st.root]}${st.suffix}`,
      root: PC_NAMES[st.root]!,
      quality: st.quality,
      confidence: conf,
      roman: rn?.roman,
      root_degree: rn?.root_degree,
      bass_degree: rn?.bass_degree,
      inverted: false,
      feeling: rn?.feeling,
      tension: rn?.tension,
      alternate: alt,
    });
  }

  const merged: ChordEvent[] = [];
  for (const c of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.symbol === c.symbol) {
      prev.dur_ms = c.t_ms + c.dur_ms - prev.t_ms;
      prev.confidence = Math.max(prev.confidence, c.confidence);
    } else merged.push({ ...c });
  }
  return merged.filter((c) => c.dur_ms >= 2000);
}
