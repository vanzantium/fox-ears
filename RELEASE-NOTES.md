# Fox Ears release notes

Short history of the boxed runtime from the first calibration through P4 (2026-11-21). 14-song key and tempo scores in this file are **SOFT** (librosa stand-in, not Taylor's full answer key). Keep Moving's key is **SOLID** after Taylor's answer.

## Tuning pass 1 (2026-11-14)

Sub-grid tempo, whole-song key, per-band vocal cues, and novelty sections. 14-song stand-in score moved from 0/14 STRICT and 5/14 key (pre-pass baseline) to 9/14 STRICT, 12/14 FORGIVEN, 10/14 key. Details: `docs/tuning-log-2026-11-14.md`.

## P0 — binding and timing (2026-11-15)

Display-rate-robust tempo: analyser reads are stamped with the audio clock, resampled onto a 10 ms grid, and checked at 60/90/120 Hz with jitter and a background gap. Research binding grammar now builds SAME / SPLIT / UNRESOLVED from local break events. 14-song: 10/14 STRICT, 12/14 FORGIVEN, 10/14 key. Details: `docs/p0-log-2026-11-15.md`.

## P1 — work identity, multi-pulse tempo, read-rate-independent key (2026-11-16)

Work/version identity and remix compare; multi-pulse tempo roles (`reference_click`, `performed_groove`, `subdivision_or_double`); mix-vs-stem receipts; spectra computed on the same 10 ms audio-clock grid so key and sections are no longer display-rate dependent. Cadence and multi-hypothesis roles fixed the 108 BPM stretch reading as G, not D. Details: `docs/p1-log-2026-11-16.md`.

## P2 — test the third (2026-11-17 / merged 2026-11-18)

Home-chord third decides major vs minor; relative/parallel ambiguity can stay UNRESOLVED; brief borrowed degrees are not a key change; Mixolydian/Dorian tags are SOFT and never override the major/minor call. Details: `docs/p2-key-log-2026-11-17.md`. Merged as PR #9.

## P3 — tempo fallback and fold, 8-bar sections, tuning pre-pass (2026-11-19)

Tempo: if the top peak is under the comb gate, fall back to the best passing peak; fold pulses above 180 BPM (always prefer /2 in the 180–220 band when the half is in 60–160). Sections: snap internal cuts to a 2-bar unit of an 8-bar pop schema, move mid-vocal cuts, merge over-split same-family neighbours. Tuning: estimate cents vs A440 and apply when the offset is clearly off. A later tightening the same day added the missing Keep Moving chorus-2 cut from general 8-bar + vocal-dip + energy cues, labeled roles V/C/V/C/Outro, used a high-confidence pitch subset for the A4 estimate, and stopped unconditionally seeding a 750 ms click period.

14-song after P3 (vs `86b78b6`): key **11/14**, STRICT 10/14, FORGIVEN **10/14**, no displayed-tempo movement, section totals 178 → 137. Keep Moving: D major, 98.9 BPM (STRICT and FORGIVEN hit), five sections V/C/V/C/Outro. Merged as PR #10 at `468a849`. Details: `docs/p3-log-2026-11-19.md`.

## P3b — click picker and tuning residual (2026-11-21)

A reference click now needs real evidence: flux-comb canned periods only join the search when they stand out from the background, a click must cover at least 30% of its own grid, and a pulse that is only a metric relative of a locked groove is not called a click. `preferred_for` is no longer left unresolved when the felt groove is already clear (displayed and felt agree or are metrically related, felt in range). When enough high-confidence pitch frames exist, a narrower KDE and tighter trim keep a secondary bump from pulling the tuning centre.

14-song gates vs `468a849` all held: key 11/14, STRICT 10/14, FORGIVEN 10/14, section totals 137, no tempo regressions. Neon-whiskers no longer invents an 80 BPM click (preferred 128/128, resolved). Stinky-skunk no longer invents a 200 BPM click (preferred 100/100, resolved). Keep Moving stays D major, 98.9 BPM, V/C/V/C/Outro; tuning moved from A4 ≈ 432.7 Hz (−28.99 ¢) to **432.1 Hz (−31.49 ¢)**, still SOFT.

This pass is on branch `p3b/click-picker-tuning` and is **not merged** until Taylor says so.

## P4 — Sonar Form, riff finder, tension ribbon, bar brief, answer-key scorer (2026-11-21)

From the 2026-11-21 research brief. Additive and SOFT: one new chart field, `chart.sonar`. Every pre-existing chart field was byte-identical on the form etude, its 108% stretch, the built-in demo, and (checked 2026-11-21 in the harness) all 14 test songs plus Keep Moving: key 11/14, tempo 10/14 STRICT and FORGIVEN, 137 sections, Keep Moving D major / 98.9 BPM / A4 ≈ 432.1 Hz / 5 sections, all unchanged. **Sonar is experimental and uncalibrated on real songs; on Keep Moving it missed all four section cuts (about 2 bars early). It never feeds section boundaries.**

- **What it adds:**
  - a bar × bar echo map (passive echolocation: the song compared with itself);
  - repetition letters, loop and form period;
  - a downbeat-phase estimate;
  - a FORM agreement check;
  - a matched-filter riff finder in 12 transpositions;
  - a spiral-array tension ribbon;
  - a per-bar text brief and SONAR blocks in the digest;
  - Lydian and Phrygian SOFT mode colours;
  - a Sonar tab.
- **Research side:**
  - mir_eval answer-key scorer and template;
  - optional adapters for Beat This!, All-In-One and a RoFormer vocal stem (inert unless called; no new required deps; normalisers self-tested; models not run here);
  - a synthetic form etude;
  - licence classes in the capability registry.
- **Bug fix:** saved maps now open from `/maps`.
- **Tests:** `npm test` 163 pass / 3 skipped (was 151).
- **Etude (SOFT, planted truth):** SONAR section F 0.88 vs FORM 0.50 (master) and 0.38 (stretch). Read that as two methods failing differently, not as one winning. The existing beat grid sat about half a beat early on the etude master, so beat F was 0 there and 0.995 on the stretch. That is left for Beat This! to be scored against.

SongFormer is **not** wrapped (MuQ weights are CC BY-NC 4.0). Details: `docs/p4-sonar-log-2026-11-21.md` and `docs/p4-cherry-pick-2026-11-21.md`. Branch `p4/sonar-cherry-pick`, stacked on `p3b/click-picker-tuning` (PR #11); **not merged** until Taylor says so.

## Still open

- 14-song forgiven tempo misses: 4-spiral_system, 5-spiralling, 8-racer, my-little-monkey.
- 14-song key misses: 7-involuntary_spiral, music_track_a, my-little-monkey.
- L1b microtiming, cadence typing, and Vela's L2–L4 layers remain deferred.
- Taylor's full BPM/key answer key for the 14 songs is still pending; Keep Moving's key is SOLID.
