# Fox Ears — Audit & Update Report (v3 → v4)

**Date:** 2026-09-19
**Base:** `fox-ears-review-v3.zip` (source dated through 2026-08-22)
**Result:** `fox-ears-review-v4.zip`

## What was audited

Full read of the hearing pipeline (`score.ts`, `sonofield.ts`, `form.ts`, `digest.ts`,
`sampler.ts`, `bind.ts`), the audio engine (`analyse.ts`, `chroma.ts`, `engine.ts`, `pitch.ts`),
`package.json`, and the project-local `AGENTS.md`.

**What's solid (left alone):**
- The three-memory design (measured song model / sealed receipts / interpreted appraisal) is intact and well separated.
- `digest.ts` receipts + conflicts mechanism already exists and distinguishes measurement from interpretation.
- `songModel.ts` already has `falsifyChromatic` (a real correction pass, not just additive).
- Chroma lab fixtures (`runChromaLab`, 44.1 kHz synthetic tones) pass.
- Sampler runs at 80 ms frames — fine for onset work; no change needed.

**What was weak:** tempo estimation (`estimateTempo` in `score.ts`).
- Single method: IOI histogram with coarse 5-BPM bins.
- A dead expression in the metrical-ambiguity branch (`dbl ? topBpm : topBpm` — always `topBpm`).
- Beat grid nailed to t=0 (`for (let t = 0; ...)`), ignoring where beats actually land.
- No independent confirmation; confidence capped at 0.55/0.40 with no way to earn more.

## What changed in v4

**New: `src/lib/hearing/tempo.ts`** (self-contained, zero imports — runs under Node
type-stripping for deterministic tests, no bundler needed)
- **Two independent methods:** IOI histogram (now 2-BPM bins) + onset-envelope
  autocorrelation with parabolic peak refinement.
- **Agreement raises confidence** (up to 0.75) with an honest note naming both methods.
- **Disagreement stays honest:** "unresolved metrical level" or "single pulse peak",
  low confidence, no false certainty.
- **New honest states:** `null` on sparse input; low-confidence autocorrelation-only
  fallback when the IOI band filters everything out (e.g. straight 8th-note strumming).
- **`alignBeatPhase()` / `beatGridAligned()`:** beat grid phase-aligns to the actual
  onsets (32 candidate phases, Gaussian scoring) instead of starting at zero.
- **`runTempoLab()`:** 9 deterministic synthetic fixtures (perfect 120/90 BPM grids,
  ±15 ms jittered 100 BPM, sparse input → null, swing 8ths as a known hard case,
  pickup 8ths, straight-8ths fallback, phase alignment, phase-aligned grid).

**Modified: `src/lib/hearing/score.ts`**
- Removed the old local `estimateTempo`/`beatGrid`; `buildChart` now imports from `./tempo`.
- Beats come from `beatGridAligned` (phase-aligned), not t=0.

**Modified: `package.json`** — `test` script now passes `--experimental-strip-types`
so `.test.mjs` drivers can import the TS hearing modules directly.

**New: `scripts/tempo-lab.test.mjs`** — node:test driver for the tempo lab.

## Verification

- Tempo lab: **9/9 fixtures pass** (run: `node --test --experimental-strip-types 'scripts/**/*.test.mjs'`).
- `tsc --noEmit --strict` clean on `tempo.ts` and on all of `src/lib/hearing/**`.
- Full suite: 96 tests, 87 pass, **9 fail — all 9 pre-existing** in
  `scripts/grok-pwa-plugin.test.mjs` (share-card/og:title metadata expecting "Wild Race"
  while the app is titled "Fox Ears"). Verified identical failures on the pristine v3
  copy; unrelated to this update.

## Known limitations (not fixed, documented honestly)

- Swing/shuffle feels: IOI histograms inherently see the long/short subdivision, not the
  quarter pulse. The module reports this as *no false agreement* rather than a confident
  wrong answer. A swing-ratio estimator is the natural next step.
- Vocal detection remains heuristic (185–560 Hz gate), not source separation.
- Bass chroma is coarse at 44.1 kHz / 2048-point FFT — physics, not a bug.
- No browser QA run in this pass (no audio fixtures in the repo); the lab covers the
  pure DSP, not the Web Audio path.

## Suggested next updates (not done)

1. Swing-ratio / triplet detection in the tempo module.
2. Explicit UNKNOWN key state when chroma is unreliable (partially present via `chroma_reliable`; could go further).
3. Onset peak-picking with adaptive thresholding instead of the fixed 0.18 flux gate.
4. Browser QA with real audio once fixtures exist.
