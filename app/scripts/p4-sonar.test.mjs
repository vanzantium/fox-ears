/**
 * P4 (2026-11-21): SONAR FORM — passive echolocation layers.
 * Bar self-similarity + repetition letters, downbeat phase, loop length,
 * riff matched filter (with transposition), section agreement, spiral-array
 * tension ribbon, bar brief, and the two new SOFT mode colours.
 * Synthetic chord frames only; no audio, no answer key. Everything here is SOFT.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@/": resolve(root, "src") + "/" } });
const S = await jiti.import(resolve(root, "src/lib/hearing/sonar.ts"));
const M = await jiti.import(resolve(root, "src/lib/hearing/motif.ts"));
const P = await jiti.import(resolve(root, "src/lib/hearing/spiral.ts"));
const B = await jiti.import(resolve(root, "src/lib/hearing/barBrief.ts"));
const K = await jiti.import(resolve(root, "src/lib/hearing/keyResolve.ts"));
const D = await jiti.import(resolve(root, "src/lib/hearing/digest.ts"));
const { emptyChart } = await jiti.import(resolve(root, "src/lib/hearing/score.ts"));

const C = 0, Db = 1, Dn = 2, E = 4, F = 5, Fs = 6, G = 7, A = 9;
const maj = (r) => [r % 12, (r + 4) % 12, (r + 7) % 12];
const min = (r) => [r % 12, (r + 3) % 12, (r + 7) % 12];

const BEAT = 500; // 120 BPM
const BAR = 4 * BEAT;

/** One chord per bar; `bars` is a list of [pcs, bass] or null for silence. */
function framesFor(bars, { pickupBeats = 0, hop = 10, vocal = () => false } = {}) {
  const start = pickupBeats * BEAT;
  const end = start + bars.length * BAR;
  const out = [];
  for (let t = 0; t < end; t += hop) {
    const bi = Math.floor((t - start) / BAR);
    const spec = t < start ? null : bars[bi];
    const ch = new Array(12).fill(0);
    const bc = new Array(12).fill(0);
    let level = 0.02;
    if (spec) {
      const [pcs, bass] = spec;
      const w = [0.4, 0.3, 0.25, 0.15];
      pcs.forEach((pc, i) => { ch[pc] = Math.max(ch[pc], w[i] ?? 0.12); });
      for (let p = 0; p < 12; p++) ch[p] += 0.01;
      bc[bass ?? pcs[0]] = 0.8;
      for (let p = 0; p < 12; p++) bc[p] += 0.02;
      level = 0.3;
    }
    out.push({
      t_ms: t,
      left_ear: { level, bands: { 500: 0, 1000: 0, 2000: 0, 4000: 0 }, onset: 0 },
      right_ear: { level, bands: { 500: 0, 1000: 0, 2000: 0, 4000: 0 }, onset: 0 },
      binaural_measurement: { level_delta_L_minus_R: 0, itd_ms_R_minus_L: null },
      centroid_hz: 0, flux: 0, pitch_hz: null, midi: null, note: null,
      pitch_confidence: 0, harmonicity: 0,
      chroma: spec ? ch : new Array(12).fill(0),
      bass_chroma: spec ? bc : new Array(12).fill(0),
      vocal_likelihood: 0, vocal_gate: vocal(t),
    });
  }
  return { frames: out, beats: Array.from({ length: Math.floor(end / BEAT) }, (_, i) => i * BEAT) };
}

const prog = (roots) => roots.map(([r, q]) => [q === "m" ? min(r) : maj(r), r % 12]);
const A4 = prog([[C], [G], [A, "m"], [F]]);           // I V vi IV in C
const B4 = prog([[F], [G], [E, "m"], [A, "m"]]);       // IV V iii vi
const C4 = prog([[Dn, "m"], [Dn, "m"], [G], [G]]);     // ii ii V V
const shift = (bars, s) => bars.map(([pcs, bass]) => [pcs.map((p) => (p + s) % 12), (bass + s) % 12]);

test("p4 sonar: repetition letters and loop length for A A B A C A", () => {
  const { frames, beats } = framesFor([...A4, ...A4, ...B4, ...A4, ...C4, ...A4]);
  const r = S.analyseSonar(frames, beats, 120, [], { tonic: "C", mode: "major" });
  assert.ok(r, "sonar reading");
  assert.equal(r.label, "SOFT");
  assert.equal(r.status, "experimental-uncalibrated");
  assert.match(r.caveat, /never edits or sets section boundaries/);
  assert.equal(r.unit, "beat");
  assert.equal(r.bars.length, 24);
  assert.equal(r.loop.bars, 4, JSON.stringify(r.loop));
  assert.equal(r.loop.period_bars, 4, "no longer block repeats straight away here");
  assert.equal(r.phrase_ssm_rows.length, 6);
  const row = r.phrase_ssm_rows[0];
  assert.deepEqual([0, 1, 3, 5].map((i) => row[i]), ["9", "9", "9", "9"], `A row matches every A: ${row}`);
  assert.ok(Number(row[2]) < 8 && Number(row[4]) < 8, `A row does not match B or C: ${row}`);
  assert.equal(r.phrase_bars, 4);
  assert.equal(r.letters, "A A B A C A", r.letters);
  assert.deepEqual(r.phrases.map((p) => p.occurrence), [1, 2, 1, 3, 1, 4]);
  assert.equal(r.ssm_rows.length, 24);
  assert.equal(r.ssm_rows[0][0], "9");
  assert.equal(r.ssm_rows[0][4], "9", "bar 1 echoes at bar 5");
});

test("p4 sonar: downbeat phase found after a one-beat pickup", () => {
  const { frames, beats } = framesFor([...A4, ...B4, ...A4, ...B4], { pickupBeats: 1 });
  const r = S.analyseSonar(frames, beats, 120, [], null);
  assert.equal(r.meter.downbeat_phase, 1, JSON.stringify(r.meter));
  assert.equal(r.meter.downbeat_clear, true);
  assert.equal(r.bars[0].t_start_ms, BEAT);
  assert.equal(r.letters, "A B A B");
  assert.equal(r.loop.bars, 8, "an A B cycle is an 8-bar loop; letters stay 4-bar phrases");
});

test("p4 sonar: a close variant is primed, silence is a dash", () => {
  const variant = [A4[0], A4[1], A4[2], prog([[Dn, "m"]])[0]]; // last bar IV → ii
  const silence = [null, null, null, null];
  const { frames, beats } = framesFor([...A4, ...variant, ...silence, ...A4]);
  const r = S.analyseSonar(frames, beats, 120, [], null);
  assert.equal(r.letters, "A A' – A", r.letters);
});

test("p4 sonar: section agreement reports matched, sonar-only and section-only cuts", () => {
  const { frames, beats } = framesFor([...A4, ...A4, ...B4, ...A4]);
  const sec = (t0, t1, label) => ({ t_start_ms: t0, t_end_ms: t1, label, energy_mean: 0, hypothesis: "", role: "section" });
  // FORM cut at 16 s (the B entry, agreed) and at 4 s (inside the repeating A: section-only).
  const sections = [sec(0, 4000, "A"), sec(4000, 16000, "A'"), sec(16000, 24000, "B"), sec(24000, 32000, "A")];
  const r = S.analyseSonar(frames, beats, 120, sections, null);
  const a = r.section_agreement;
  assert.equal(a.boundaries, 3);
  assert.equal(a.agreed, 2, JSON.stringify(a));
  assert.deepEqual(a.section_only_ms, [4000]);
  assert.deepEqual(a.sonar_only_ms, []);
});

test("p4 motif: the home riff is found again, including a move to the IV (+5)", () => {
  const { frames, beats } = framesFor([...A4, ...B4, ...A4, ...shift(A4, 5), ...A4]);
  const r = S.analyseSonar(frames, beats, 120, [], null);
  const m = r.motif;
  assert.ok(m, "motif reading");
  assert.equal(m.template.bar, 0);
  const at = m.hits.map((h) => [h.bar, h.transpose]);
  assert.deepEqual(at, [[0, 0], [8, 0], [12, 5], [16, 0]], JSON.stringify(m.hits));
  assert.ok(m.hits[0].origin);
  assert.equal(m.transposed_hits, 1);
  assert.ok(m.hits.every((h) => h.on_downbeat));
});

test("p4 motif: matched filter on a custom bar range", () => {
  const { frames, beats } = framesFor([...A4, ...B4, ...B4, ...A4]);
  const { units } = S.sonarUnits(frames, beats);
  const bars = S.barsFromUnits(units, 0);
  const m = M.findMotifAt(units, bars, 4, 4, null);
  assert.deepEqual(m.hits.map((h) => h.bar), [4, 8]);
});

test("p4 spiral: home triad has less strain than a far chord; a cluster is wider than a triad", () => {
  const far = prog([[Fs]]);                                       // F# major in C
  const cluster = [[[C, Db, Dn], C]];                              // C–C#–D
  const { frames, beats } = framesFor([A4[0], A4[0], far[0], cluster[0], A4[0], A4[0], A4[0], A4[0]]);
  const { units } = S.sonarUnits(frames, beats);
  const bars = S.barsFromUnits(units, 0);
  const t = P.spiralTension(units, bars, { tonic: "C", mode: "major" });
  assert.ok(t);
  const [home, , farBar, clusterBar] = t.bars;
  assert.ok(farBar.strain > home.strain * 2, JSON.stringify(t.bars.slice(0, 4)));
  assert.ok(clusterBar.diameter > home.diameter, "cluster spreads wider than the tonic triad");
  assert.equal(t.peak_strain_bar, 2);
  assert.ok(farBar.momentum > 0 && t.bars[1].momentum === 0);
});

test("p4 spiral: spelling keeps the key's accidentals (C# in D major, Db in Ab major)", () => {
  const kD = 2; // D on the line of fifths
  assert.equal(P.spell(1, kD, "major"), 7);   // C# = +7
  const kAb = -4;
  assert.equal(P.spell(1, kAb, "major"), -5); // Db = -5
});

test("p4 mode colour: Lydian and Phrygian are named only when clear, never over Mixolydian/Dorian", () => {
  const share = (o) => { const a = new Array(12).fill(0.04); for (const [k, v] of Object.entries(o)) a[Number(k)] = v; return a; };
  assert.equal(K.modeTag(share({ 0: 0.2, 4: 0.15, 7: 0.15, 6: 0.1, 5: 0.03 }), 0, "major")?.name, "Lydian");
  assert.equal(K.modeTag(share({ 0: 0.2, 4: 0.15, 7: 0.15, 6: 0.06, 5: 0.05 }), 0, "major"), null, "a passing #4 is not Lydian");
  assert.equal(K.modeTag(share({ 0: 0.2, 4: 0.15, 7: 0.15, 10: 0.1, 11: 0.03, 6: 0.1, 5: 0.03 }), 0, "major")?.name, "Mixolydian");
  assert.equal(K.modeTag(share({ 9: 0.2, 0: 0.15, 4: 0.15, 10: 0.1, 11: 0.03 }), 9, "minor")?.name, "Phrygian");
});

test("p4 bar brief and digest: one line per bar, SONAR block present", () => {
  const { frames, beats } = framesFor([...A4, ...A4, ...B4, ...A4], { vocal: (t) => t >= 8000 && t < 16000 });
  const sonar = S.analyseSonar(frames, beats, 120, [], { tonic: "C", mode: "major" });
  const chart = {
    ...emptyChart(),
    key: { tonic: "C", mode: "major", confidence: 0.8 },
    tempo_bpm: 120,
    beats,
    chords: [{ t_ms: 0, dur_ms: 2000, symbol: "C", root: "C", quality: "maj", confidence: 0.9, roman: "I" }],
    vocal_regions: [{ t_start_ms: 8000, t_end_ms: 16000, likelihood: 0.9 }],
    lyrics: { source: "pasted", text: "home again", lines: [{ t_ms: 8100, text: "home again", source: "pasted" }] },
    sonar,
  };
  const lines = B.barBriefLines(chart);
  assert.equal(lines.length, 16);
  assert.match(lines[0], /^b1 0:00\.0 \| son A\(1\) \| I \| str \.\d\d→ \| riff$/);
  assert.match(lines[4], /son A\(2\) .* \| vox \| riff \| "home again"$/);
  const map = {
    schema: "fox-ears-hearing-map-1.1", version: "fox-ears-0.3", title: "etude", source: { kind: "demo", name: "etude" },
    duration_ms: 32000, sample_interval_ms: 10, captured_at: "2026-11-21", frames: [], objects: [], conflicts: [],
    graph: { t_ms: [], energy: [], spatial: [], centroid_hz: [], onset: [], pitch_midi: [], vocal: [], tension: [], degree: [], band_500: [], band_1000: [], band_2000: [], band_4000: [] },
    chart, grammar: { cue_hierarchy: [], break_conditions: [], persistence_conditions: [], conflict_rule: "" },
  };
  const digest = D.digestMap(map);
  assert.match(digest, /======== SONAR \(SOFT · EXPERIMENTAL · UNCALIBRATED\) ========/);
  assert.match(digest, /- repetition: A A B A/);
  assert.match(digest, /BAR BRIEF \(SOFT/);
  assert.match(digest, /TENSION RIBBON/);
});

test("p4 sonar: no beat grid falls back to blocks and says so", () => {
  const { frames } = framesFor([...A4, ...A4, ...A4, ...A4]);
  const r = S.analyseSonar(frames, [], null, [], null);
  assert.equal(r.unit, "block");
  assert.match(r.meter.note, /no beat grid/);
});

test("p4 capabilities: new candidates are optional and carry a licence class", async () => {
  const { researchCapabilities, baseStartupRequiresResearchTools } = await jiti.import(resolve(root, "src/lib/research/capabilities.ts"));
  const cap = researchCapabilities();
  assert.equal(baseStartupRequiresResearchTools(), false);
  for (const k of ["beatThis", "allin1", "vocalSeparator", "basicPitch", "songformer", "mirEval"]) {
    assert.equal(cap[k].optional, true, k);
    assert.ok(cap[k].license_class, `${k} licence class`);
  }
  assert.equal(cap.songformer.license_class, "noncommercial");
  assert.equal(cap.beatThis.license_class, "permissive");
});
