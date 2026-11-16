# Fox Ears tuning log: pass 1

**Date:** 2026-11-14 (America/Dawson_Creek, MST). Written 2026-11-14 at about 15:40 MST.
**Branch:** `tuning/pass-1`, cut from `test-song/baseline-master` (e82dd07). It stacks on PR #1.
**Ground truth:** "Fox at the Gate" master v1 is 96.006 BPM in G major. It has 6 sections: intro, verse, chorus, verse, chorus, outro. Vocal regions come from an htdemucs stem (`test-song/results/scoring-truth-master.json`).
**Guard set:** 14 songs (librosa BPM and Krumhansl key as the reference, which is *not* ground truth) and the 36 s listening etude (9 grains, 5 scenes).
**Not touched:** Calibration 003 key material and the research runtime. Vela's blind run is still pending.

All numbers come from the offline harness (`harness/fox-calibrate.ts`) at the app's default sensitivity of 0.58. The harness copies the AnalyserNode and engine snapshot math, so a browser pass should still confirm the headline numbers.

## 2026-11-14: master, before vs after

| Measure | Before (e82dd07) | After (tuning/pass-1) | Truth |
|---|---|---|---|
| Tempo | 90 BPM, conf 0.11 (−6.26%) | **96 BPM, conf 0.84 (−0.01%)** | 96.006 |
| Key | D major (the dominant) | **G major**, with G over D confirmed by the scale-degree test | G major |
| Sections | 2 (one cut at 105.0 s) | 7 (cuts at 9.8, 29.8, 54.8, 64.8, 74.8, 99.2 s) | 6 |
| Boundary error vs bar lines | 95.25, 75.25, 50.25, 30.26, 5.26 s | **0.01, 0.01, 0.01, 0.02, 0.61 s** (plus 1 extra cut at 64.8 s, mid verse 2) | — |
| Boundary error vs lyric cues | 95.17 … 5.17 s | 0.07, 0.38, 0.07, 0.41, 0.70 s | — |
| Vocal frames vs stem (P / R) | 0.00 / 0.00 (mask 0%) | **0.92 / 0.72** (mask 45.3%) | stem 58.1% vocal |
| Vocal frames vs SRT spans (P / R) | 0.00 / 0.00 | 0.98 / 0.53 | — |
| Live vocal gate open | 4.1% of frames | 40.4% | — |
| Vocal notes / regions | 0 / 0 | 5 / 26 | — |

After, the sections are: intro 0–9.8 · verse 9.8–29.8 · chorus 29.8–54.8 · verse 54.8–64.8 · "chorus" 64.8–74.8 · chorus 74.8–99.2 · outro 99.2–108.4. The 64.8 s cut splits verse 2, and that half is labelled with the wrong role. Fixing it is the next sections job.

## 2026-11-14: guard set (14 songs + demo)

**Scoring.** Tempo counts as a hit within ±4% of librosa, forgiving octave and 2:3 errors. Key counts only as an exact tonic and mode match.

| Measure | Before | After |
|---|---|---|
| Tempo hits | 1/14 | **12/14** (the old 60 Hz harness proposal scored 10/14) |
| Key exact | 5/14 | **10/14** (no song lost) |
| Vocal frames vs demucs stems, mean P / R | 0.36 / 0.00 (the gate barely opened) | 0.71 / 0.52 |
| Demo tempo | none | none (correct: the etude is aperiodic) |
| Demo vocal | 0% | 0% (correct: the etude has no voice) |
| Demo grains | 4/9 found, 0 fake, 3 objects | 4/9 found, 0 fake, 3 objects (binding is untouched) |
| Demo sections | 15, one about every 1.25 s | 3 (cuts at 19.2 and 28.8 s match scenes C and Q; scenes N at 10.0 s and T at 24.2 s are missed) |

| Song | Reference (librosa) | Tempo before | Tempo after | Key before | Key after | Sections before → after | Vocal P/R vs stem, after (before: no vocal found) |
|---|---|---|---|---|---|---|---|
| 10-turn_the_screw.mp3 | 99.4 BPM, D# minor | 90 ✗ | 98 ✓ | D# minor ✓ | D# minor ✓ | 2 → 17 | 0.84 / 0.55 (stem says 71% vocal; marked 46%) |
| 4-spiral_system.mp3 | 123.0 BPM, F# minor | 90 ✗ | 93 ✗ | F# minor ✓ | F# minor ✓ | 6 → 15 | 0.98 / 0.62 (stem says 90% vocal; marked 57%) |
| 5-spiralling.mp3 | 123.0 BPM, A minor | 80 ✓ | 121 ✓ | E minor ✗ | A minor ✓ | 2 → 15 | 0.44 / 0.29 (stem says 21% vocal; marked 14%) |
| 6-pressure_makes.mp3 | 129.2 BPM, E major | 90 ✗ | 126 ✓ | A major ✗ | A major ✗ | 3 → 21 | 0.54 / 0.48 (stem says 57% vocal; marked 51%) |
| 7-involuntary_spiral.mp3 | 99.4 BPM, C major | 90 ✗ | 98 ✓ | C minor ✗ | C major ✓ | 5 → 9 | 1.00 / 0.07 (stem says 87% vocal; marked 6%) |
| 8-racer.mp3 | 143.6 BPM, C minor | 180 ✗ | 73.4 ✓ | D# major ✗ | C minor ✓ | 2 → 7 | 0.31 / 0.80 (stem says 33% vocal; marked 85%) |
| 9-step_up.mp3 | 95.7 BPM, A minor | 90 ✗ | 95 ✓ | A major ✗ | A major ✗ | 2 → 8 | 0.69 / 0.72 (stem says 66% vocal; marked 69%) |
| music_midnight_funky.ogg | 136.0 BPM, D major | 72 ✗ | 68 ✓ | D major ✓ | D major ✓ | 4 → 8 | 0.80 / 0.37 (stem says 74% vocal; marked 34%) |
| music_midnight_slow.ogg | 136.0 BPM, D major | 180 ✗ | 91.9 ✓ | A major ✗ | D major ✓ | 2 → 11 | 0.68 / 0.48 (stem says 76% vocal; marked 54%) |
| music_track_a.ogg | 129.2 BPM, F minor | 180 ✗ | 130.6 ✓ | F major ✗ | F major ✗ | 1 → 16 | 0.81 / 0.66 (stem says 81% vocal; marked 66%) |
| music_track_b.ogg | 107.7 BPM, G minor | 180 ✗ | 108 ✓ | G minor ✓ | G minor ✓ | 1 → 15 | 0.88 / 0.59 (stem says 78% vocal; marked 52%) |
| my-little-monkey.mp3 | 152.0 BPM, D major | 90 ✗ | 79.3 ✗ | A major ✗ | A major ✗ | 3 → 8 | 0.97 / 0.67 (stem says 89% vocal; marked 61%) |
| neon-whiskers.mp3 | 129.2 BPM, D# major | 90 ✗ | 128 ✓ | G minor ✗ | D# major ✓ | 3 → 11 | 0.97 / 0.75 (stem says 89% vocal; marked 69%) |
| stinky-skunk-shuffle.mp3 | 99.4 BPM, C major | 180 ✗ | 100 ✓ | C major ✓ | C major ✓ | 1 → 8 | 0.01 / 0.26 (stem says 1% vocal; marked 33%) |

The vocal column was "no vocal found" on every song before this pass.

## 2026-11-14: parameter changes

### Tempo (`app/src/lib/hearing/tempo.ts`, `score.ts` `chartTempo`)
| | Old | New |
|---|---|---|
| Onsets | 80 ms chart frames where max(onset, flux) > **0.18** (one fixed gate) | Every ~60 Hz analyser tick (`frame.ticks`), with an adaptive peak pick: flux > local mean + **1.0**·sd over a **1000 ms** window, at least **90 ms** apart |
| Periodicity | IOI histogram and frame autocorrelation | Weighted onset envelope at **10 ms**, autocorrelation, then a comb over 1–4 periods × a log-normal prior centred on **110 BPM** (σ = **1 octave**), then parabolic and grid-fit refinement |
| Range | — | **50–220 BPM** |
| "No tempo" gate | none (always guessed) | comb < **0.15** gives null. The demo scores 0.03–0.04 and songs score at least 0.36 |
| Fallback | — | Maps without `ticks` (saved before this pass) use the old path |

**Reasoning.** At 80 ms frames the 0.18 gate saw only every other eighth-note, and it could not tell 90, 120 and 180 BPM apart (see the onset-gate sweep in the before log). With sub-grid onsets the true pulse comes back. The comb plus prior picks the metrical level and stops the half-time and double-time flips. The minComb gate stops a fake 124.9 BPM on the aperiodic etude.

### Key (`score.ts` `estimateKey`, `KEY_TUNING`)
| | Old | New |
|---|---|---|
| Chroma | Level-weighted sum over every frame | Duration-weighted sum, with intro and first-section frames at **0.3** weight (fallback: first **10%**, at most **25%**) |
| Bass | none | Bass chroma at **0.5** weight |
| Tonic vs dominant | none | When the top 2 keys are a fifth apart and within **0.1**, compare the 4th against the raised 4th (in minor, the b6 against the 6) and check the bass tonic. Flip only when both agree |

**Reasoning.** The master opens on D, and plain Krumhansl gives D major and G major almost the same score (margin 0.007). The scale-degree test separates them: C natural means G, C# means D. Together these changes also fixed 5-spiralling, involuntary_spiral, racer, midnight_slow and neon-whiskers.

### Vocal (`app/src/lib/audio/vocal.ts` new, `engine.ts`, `score.ts` `chartVocalMask`)
| | Old | New |
|---|---|---|
| Gate | likelihood > **0.72** AND mix F0 in **185–560 Hz** AND mid > body·**0.28** AND percussive share < **0.42** | Per-band cues in **300–3000 Hz** on mid/side: centre (side/mid ≤ **−7 dB**), presence (≥ loud p95 **−14 dB**), at least **4** spectral peaks (within **24 dB** of the band max and **6 dB** prominent). For mono sources (side < **−35 dB**), at least **8** peaks |
| Live loud level | — | Causal LoudFollower, release **1.5 dB/s** |
| Chart mask | frames with gate && likelihood ≥ 0.7 | **7-frame** median, then runs of at least **6 frames** (480 ms) |

**Why the male lead was rejected.**
1. The F0 window started at 185 Hz, but the mix pitch tracker locks onto bass and guitar (80–100 Hz was its most common answer on the master), and a male lead sits largely below 185 Hz.
2. Sung consonants over kick and snare push the percussive share to a median of 0.45 on vocal frames, so the 0.42 gate shut.
3. A single threshold meant that loosening the gate opened it on guitars.

The new cues don't use the pitch tracker at all.

### Sections (`app/src/lib/hearing/form.ts`, `FORM_TUNING`)
| | Old | New |
|---|---|---|
| Cuts | Frame-to-frame jumps: Δchroma > **0.32**, ΔE > **0.055**, Δvocal > **0.28**; merge when shorter than **5.5 s** with sim > **0.55** | Foote checkerboard novelty on a beat-synchronous similarity matrix (chroma 1, bass 0.5, energy 1, vocal 1). Kernel **8 beats**, sections at least **16 beats**, peaks ≥ **0.4** × max (600 ms blocks without a tempo) |
| Merging | — | Repeated-pair block merge (recurrence **0.82**, segment match **0.6**) and adjacent-harmony merge (**0.7**). A merge covers at most **64 beats** |
| Labels | energy roles | harmony-cluster letters A–Z, then role names |

**Reasoning.** The old frame-jump cuts either never fired (2 sections on the master) or fired on every phrase (15 on the demo). The novelty curve peaks at real form changes, and 4 of the 5 master boundaries land within 0.02 s of a bar line. With peakFrac 0.25 the 14 songs averaged 11–25 s per section. Raising it to 0.4 keeps the master unchanged (its weakest true peak is 0.59) and lengthens the sections on the other songs.

## 2026-11-14: regressions and known weak spots

1. **Instrumental vocal false positives.** Stinky Skunk Shuffle is about 1% vocal by stem, but 33% of it is now vocal-marked (it was 0%). Racer (P 0.31) and Spiralling (P 0.44) have centred lead synths and guitars that pass all three cues. Tightening centreDb to −9 cut Stinky to 10% but halved recall on the vocal songs, so I kept −7. This matters for Taylor's instrumental variant.
2. **Recall on dense mixes.** Involuntary_spiral has R 0.07 and midnight_funky R 0.37 (presence fails against loud guitars).
3. **Sections on the other songs** went from too few (1–6) to probably too many (7–21). There is no section truth for them yet.
4. **Tempo misses.** 4-spiral_system gives 93 vs 123 and my-little-monkey gives 79.3 vs 152. Both were missed before too.
5. **Key misses.** pressure_makes gives A vs E (subdominant), step_up gives A major vs A minor, track_a gives F major vs F minor, and monkey gives A vs D. All four were wrong before too.
6. **Map size.** Saved maps grow by about 20% from per-tick flux (localStorage budget).
7. **Vocal notes** still come from the mix pitch tracker, so only 5 notes on the master are tagged vocal.

## 2026-11-14: tests and CI
- `npm run typecheck`, `npm run lint` and `npm run build` pass.
- Lab tests pass: `scripts/tempo-lab.test.mjs` (12 fixtures, including new ones for 96 BPM with eighths, a half-time trap and an aperiodic case) and the new `scripts/vocal-lab.test.mjs` (4). They are now a CI step in the app job.
- Research tests pass: `fox_ears_v0_2_binding_grammar.py --test` and `fox_ears_v0_1.py --test`.
- `npm test` gives 91/100. The 9 failures are the template's share-card/OG tests, the same as on main, and are unrelated.

## 2026-11-14: what's next
1. Score Taylor's variants: 108 BPM, A major, instrumental, added harmony, silent break. The instrumental variant will test regression 1 directly.
2. Add a vocal pitch-movement (vibrato or glide) cue to reject steady centred synths and leads.
3. Use per-band onset thresholds (BAND_ON) for tempo on songs that are heavy on bass and kick.
4. Add a proper vocal pitch tracker on the centre channel for vocal notes.
5. Fix section role naming and the split verse 2. Then get section truth for 2–3 of the 14 songs.

Data: `harness/calibration-pass1-2026-11-14.json` (metrics only) and `test-song/results/scoring-truth-master.json`. No audio or stems are committed.
