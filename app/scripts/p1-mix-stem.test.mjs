import test from "node:test";
import assert from "node:assert/strict";
import { preferReading } from "../src/lib/research/mixStem.ts";
import { researchCapabilities, baseStartupRequiresResearchTools } from "../src/lib/research/capabilities.ts";

test("p1 research tools are optional and never required for base startup", () => {
  assert.equal(baseStartupRequiresResearchTools(), false);
  const cap = researchCapabilities();
  assert.equal(cap.essentia.optional, true);
  assert.equal(cap.madmom.optional, true);
  assert.match(cap.essentia.license, /AGPL/);
  assert.match(cap.madmom.license, /CC-BY-NC-SA/);
});

test("p1 mix-vs-stem prefers the better receipt and keeps both, without a hard-coded winner", () => {
  const songA = preferReading([
    { source: "vocal_stem", available: true, quality: { wer: 0.281, n_hyp_tokens: 351, n_ref_tokens: 334, voiced_fraction: 0.70, usable: true }, measured: {} },
    { source: "mix", available: true, quality: { wer: 0.734, n_hyp_tokens: 136, n_ref_tokens: 334, usable: false, notes: "not very usable" }, measured: {} },
  ]);
  assert.equal(songA.preferred, "vocal_stem");
  assert.match(songA.reason, /vocal_stem/);
  assert.equal(songA.receipts.length, 2);

  const songBRemix = preferReading([
    { source: "vocal_stem", available: true, quality: { wer: 0.526, n_hyp_tokens: 221, n_ref_tokens: 304, voiced_fraction: 0.54, usable: true }, measured: {} },
    { source: "mix", available: true, quality: { wer: 0.326, n_hyp_tokens: 283, n_ref_tokens: 304, usable: true }, measured: {} },
  ]);
  assert.equal(songBRemix.preferred, "mix");
  assert.match(songBRemix.reason, /mix preferred/);
  assert.ok(songBRemix.disagreement.some((d) => /WER/.test(d)));
});
