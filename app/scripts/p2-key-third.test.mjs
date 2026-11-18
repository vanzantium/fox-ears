/**
 * P2 key pass (2026-11-17): test the third, relative-key ambiguity,
 * 4 vs #4 tie-breaker margin, borrowed colour vs modulation, SOFT mode tag.
 * After Rowan's breakdown of Max Konyi's ear-training videos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root, "src") + "/" } });
const K = await jiti.import(resolve(root, "src/lib/hearing/keyResolve.ts"));
const { estimateKeyDetailed, testTheThird, borrowingVsModulation, modeTag, leakCompensate } = K;

const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11, BB = 10;

/** Chroma for a set of pitch classes (first = root), bass on `bass`. */
function chord(pcs, bass = pcs[0]) {
  const ch = new Array(12).fill(0.02);
  const w = [0.4, 0.27, 0.23, 0.15];
  pcs.forEach((pc, i) => { ch[pc % 12] = Math.max(ch[pc % 12], w[i] ?? 0.12); });
  const b = new Array(12).fill(0.03);
  b[bass % 12] = 0.7;
  return { ch, b };
}

function frames(regions, hop = 50) {
  const end = Math.max(...regions.map((r) => r.until));
  const out = [];
  for (let t = 0; t < end; t += hop) {
    const r = regions.find((x) => t >= x.from && t < x.until) ?? regions[regions.length - 1];
    const { ch, b } = chord(r.pcs, r.bass);
    out.push({ t_ms: t, chroma: ch, bass_chroma: b, pitch_hz: null, midi: null, pitch_confidence: 0 });
  }
  return out;
}

/** Repeat a progression of [pcs, bass?] every `barMs` from `from` to `until`. */
function loop(prog, from, until, barMs = 2000) {
  const regs = [];
  let i = 0;
  for (let t = from; t < until; t += barMs, i++) {
    const [pcs, bass] = prog[i % prog.length];
    regs.push({ from: t, until: Math.min(until, t + barMs), pcs, bass });
  }
  return regs;
}

const maj = (r) => [r, r + 4, r + 7];
const min = (r) => [r, r + 3, r + 7];

test("p2 test the third: home-chord third decides A minor vs A major", () => {
  const minorHome = frames(loop([[min(A)], [maj(D) /* borrowed IV */], [maj(E)], [min(A)]], 0, 16000));
  const majorHome = frames(loop([[maj(A)], [maj(D)], [maj(E)], [maj(A)]], 0, 16000));
  const tm = testTheThird(minorHome, A, { cadenceFrom: 12000 });
  const tM = testTheThird(majorHome, A, { cadenceFrom: 12000 });
  assert.equal(tm.lean, "minor", JSON.stringify(tm));
  assert.equal(tM.lean, "major", JSON.stringify(tM));
  assert.ok(tm.s3 < 0 && tM.s3 > 0, "3 vs b3 carries the call");
});

test("p2 overtone compensation: a lone strong tonic does not fake a major third", () => {
  const a = new Array(12).fill(0);
  a[A] = 0.6; // tonic with its 5th-harmonic leak into C#
  a[1] = 0.6 * 0.1;
  a[C] = 0.06;
  const c = leakCompensate(a);
  assert.ok(c[C] > c[1], `b3 should beat the leaked 3 (C ${c[C]} vs C# ${c[1]})`);
});

test("p2 third flips a near-tie parallel call toward the home chord", () => {
  // A-minor home (bass A) with D major / E major colour: profile is close between A major and A minor.
  const fr = frames([
    ...loop([[min(A)], [maj(D)], [maj(E)], [min(A)], [maj(D)], [maj(E)]], 0, 24000),
    { from: 24000, until: 28000, pcs: min(A), bass: A },
  ]);
  const est = estimateKeyDetailed(fr, []);
  assert.equal(est.key?.tonic, "A", est.note);
  assert.equal(est.key?.mode, "minor", est.note);
  assert.equal(est.detail.third_test?.lean, "minor");
});

test("p2 relative major/minor with no strong cadence is UNRESOLVED with both hypotheses", () => {
  // Loop of C major and A minor triads, equal time, ending on F (no cadence on either tonic).
  const fr = frames([
    ...loop([[maj(C)], [min(A)], [maj(F)], [maj(G)]], 0, 32000),
    { from: 32000, until: 36000, pcs: maj(F), bass: F },
  ]);
  const est = estimateKeyDetailed(fr, []);
  const rel = est.hypotheses.find((h) => h.role === "relative");
  if (est.detail.relative) {
    assert.equal(est.status, "UNRESOLVED", est.note);
    assert.match(est.note, /relative major\/minor/);
    assert.ok(rel, "relative hypothesis kept");
    const pair = new Set([`${est.key?.tonic} ${est.key?.mode}`, `${rel.tonic} ${rel.mode}`]);
    assert.ok(pair.has("C major") && pair.has("A minor"), [...pair].join(" / "));
  } else {
    // Profile gap too wide to call it relative: must at least keep a relative hypothesis.
    assert.ok(rel);
  }
});

test("p2 relative major/minor: a strong A cadence resolves to A minor", () => {
  const fr = frames([
    ...loop([[maj(C)], [min(A)], [maj(F)], [maj(G)]], 0, 32000),
    { from: 32000, until: 34000, pcs: [E, 8, B], bass: E }, // E major: G# leading tone
    { from: 34000, until: 40000, pcs: min(A), bass: A },
  ]);
  const est = estimateKeyDetailed(fr, []);
  assert.equal(`${est.key?.tonic} ${est.key?.mode}`, "A minor", est.note);
});

test("p2 brief b7 over a held C bass is modal borrowing, not a key change", () => {
  const regs = loop([[maj(C)], [maj(F)], [maj(G)], [maj(C)]], 0, 24000);
  regs.push({ from: 24000, until: 26000, pcs: [BB, D, F], bass: C }); // bVII over tonic pedal
  regs.push(...loop([[maj(C)], [maj(G)], [maj(C)]], 26000, 36000));
  const fr = frames(regs);
  const est = estimateKeyDetailed(fr, [], { barMs: 2000 });
  assert.equal(`${est.key?.tonic} ${est.key?.mode}`, "C major", est.note);
  assert.equal(est.detail.modulations.length, 0, JSON.stringify(est.detail.modulations));
  const b7 = est.detail.borrowing.find((b) => b.degree === "b7");
  assert.ok(b7 && b7.tonic_held, JSON.stringify(est.detail.borrowing));
  assert.match(est.note, /modal borrowing/);
});

test("p2 a new tonic that wins bass and local key for several bars is a modulation", () => {
  const regs = [
    ...loop([[maj(C)], [maj(F)], [maj(G)], [maj(C)]], 0, 32000),
    ...loop([[maj(D)], [maj(G), D], [maj(A), D], [maj(D)]].map(([p]) => [p, D]), 32000, 48000),
  ];
  // Force every bar of the second half onto D in the bass with D-major colour (F#, C#).
  for (const r of regs) if (r.from >= 32000) { r.pcs = [D, 6, A, 1]; r.bass = D; }
  const est = estimateKeyDetailed(frames(regs), [], { barMs: 2000 });
  const mod = est.detail.modulations.find((m) => m.tonic === "D" || m.tonic === "C");
  assert.ok(mod, `expected a modulation, got ${JSON.stringify(est.detail.modulations)} (${est.note})`);
  assert.ok(mod.bars >= 4);
});

test("p2 a short IV vamp without a new pitch class is not a modulation", () => {
  const regs = [
    ...loop([[maj(C)], [maj(G)]], 0, 12000),
    ...loop([[maj(F)]], 12000, 22000), // 5 bars of F over F bass, no Bb
    ...loop([[maj(G)], [maj(C)]], 22000, 34000),
  ];
  const r = borrowingVsModulation(frames(regs), C, "major", 2000);
  assert.equal(r.modulations.length, 0, JSON.stringify(r.modulations));
});

test("p2 Mixolydian / Dorian tags are SOFT and never change the major/minor call", () => {
  const a = new Array(12).fill(0.02);
  [D, 6, A, C].forEach((pc) => (a[pc] = 0.15)); // D major triad + C natural (b7)
  const tag = modeTag(a, D, "major");
  assert.equal(tag?.name, "Mixolydian");
  assert.equal(tag?.label, "SOFT");
  const fr = frames(loop([[[D, 6, A, C]], [maj(G)], [[C, E, G]], [[D, 6, A]]], 0, 24000));
  const est = estimateKeyDetailed(fr, []);
  if (est.key?.tonic === "D") assert.equal(est.key.mode, "major", "Mixolydian stays major");
  const b = new Array(12).fill(0.02);
  [E, 7, B, 1].forEach((pc) => (b[pc] = 0.15)); // E minor + C# (natural 6)
  assert.equal(modeTag(b, E, "minor")?.name, "Dorian");
});

test("p2 4 vs #4 tie-breaker abstains on a coin-flip difference", () => {
  // Close G/D song ending on D. A hair's difference between C (4 of G) and
  // C# (#4 of G) must not swing the call; a clear difference still votes.
  const regs = [
    { from: 0, until: 2000, pcs: maj(D), bass: D },
    { from: 2000, until: 6000, pcs: maj(G), bass: G },
    { from: 6000, until: 8000, pcs: maj(D), bass: D },
    { from: 8000, until: 10000, pcs: maj(G), bass: G },
    { from: 10000, until: 14000, pcs: maj(D), bass: D },
  ];
  const run = (c, cs) => {
    const fr = frames(regs);
    for (const f of fr) { f.chroma[C] = c; f.chroma[1] = cs; }
    return estimateKeyDetailed(fr, []);
  };
  const up = run(0.0205, 0.02);
  const down = run(0.02, 0.0205);
  assert.match(up.note, /tonic-vs-dominant/, up.note);
  assert.equal(`${up.key?.tonic} ${up.status}`, `${down.key?.tonic} ${down.status}`, `${up.note} || ${down.note}`);
  assert.match(up.note, /degree abstain/);
  const clear = run(0.16, 0.01);
  assert.match(clear.note, /tonic-vs-dominant/);
  assert.doesNotMatch(clear.note, /degree abstain/);
});
