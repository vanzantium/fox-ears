# Fox Ears: Build + Calibration Log

**From:** Riven (forge)
**Date:** 2026-11-14 (built and run on the box 13:25–13:40, America/Dawson_Creek, UTC-7)
**Folder:** https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf
**Start from:** Vela's `START-HERE-Fox-Ears-Builders-2026-11-14.md` (the index). This log adds build status and the first calibration numbers. It doesn't replace it.

**Repo copy note:** event-level Calibration 003 key material from finding 5 has been held back in this copy so Vela can take the calibration blind. The full log remains on the box at `/workspace/fox-ears/Riven-Fox-Ears-Build-Calibration-2026-11-14.md`.


## Two build lines, two canonical versions

| Line | Canonical | What it is |
|---|---|---|
| App (practice instrument) | `fox-ears-review-v4.zip` (2026-09-19) | Web app (TanStack Start + React 19 + Vite). You play a song, it paints, then it seals a "hearing map": song model, sealed listening receipts and appraisal. Jukebox, 36-second demo etude. |
| Research (binding grammar) | `fox_ears_v0_2_binding_grammar.py` (fox-ears-0.2) | Pure-Python simulator. Sorts ear measurements into competing "same sound-thing / new sound-thing" histories and generates the blind Calibration 003 prompt. |

Version order for the app: `fox-ears-review.zip` (v1, flat tree) → `-v2` (2026-08-22) → `-v3` (2026-08-22; affect/digest/score/types changes) → **v4** (2026-09-19: tempo.ts rebuilt, audit report). `fox-ears-review-v3 (1).zip` has the same sha256 as v3 (0a46342a…), so it's a duplicate.
Research line: `fox_ears_v0_1.py` → **`fox_ears_v0_2_binding_grammar.py`**. `fox_ears_calibration_003_prompt.txt` is the older pre-0.2 draft. **`fox_ears_v0_2_calibration_003_prompt.txt`** is the current one: running the runtime regenerated it byte for byte.

## Build status: both lines build and run, no fixes needed

App (v4), Node 24.22 / npm 11.21:
```
npm ci                 -> 422 packages, ok
npm run typecheck      -> tsc --noEmit, exit 0 (clean)
npm test               -> 96 tests: 87 pass, 9 fail
                          tempo lab 9/9 pass; the 9 failures are all the pre-existing
                          grok-pwa-plugin share-card tests (expect "Wild Race"/og:title "x",
                          app is titled "Fox Ears"). Same as the v4 audit report. Scaffold only; not hearing code.
npm run build          -> vite build ok; db:migrate skips (no DATABASE_URL, PGLite self-migrates)
npm run dev            -> http://0.0.0.0:8080 ; GET / 200, GET /jukebox 200
```
Research (v0.2), Python 3.13 stdlib only:
```
python3 fox_ears_v0_2_binding_grammar.py --test      -> 8/8 OK
python3 fox_ears_v0_2_binding_grammar.py --outdir out -> blind / inspector / LOCKED_KEY / prompt
   prompt is byte-identical to the Drive copy (deterministic)
python3 fox_ears_v0_1.py --test                       -> 8/8 OK
python3 music_mode.py                                 -> mock scaffold test (OrganismRuntime not present)
```
**Fixes made: none.** I changed nothing under `src/` and edited none of the Python. The 9 PWA test failures were left alone because they don't block the build.

## What "calibrate" means here

**App knobs (v4)**
- `engine.sensitivity` 0.58 (UI slider): gain = 0.35+1.45·s, analyser minDecibels = −92+38·(1−s), maxDecibels −18, smoothing 0.62, FFT 2048
- `SAMPLE_INTERVAL_MS` 80 (sampler.ts): the frame clock every chart is built on
- onset gate 0.18 on max(onset, flux) (score.ts `buildChart`); onsetHold decay 0.82/tick; flux scale /18
- tempo.ts: MIN/MAX_BPM 60/200, BIN_BPM 2, confidence caps 0.75 on agreement
- bind.ts: `BAND_ON` 0.16 (band counts as occupied), `SPATIAL_JUMP` 0.42
- band windows: center ×0.78 … ×1.28 (analyse.ts `bandEnergy`); bands 500/1000/2000/4000 Hz
- pitch.ts: NSDF threshold 0.72, rms floor 0.008, search range 80–1400 Hz; note min 110 ms / conf 0.28 / frame conf 0.22
- vocal gate: likelihood > 0.72, 185–560 Hz, mid > 0.28·body, perc < 0.42
- chroma: 90–1800 Hz (bass 55–180 Hz), reliability = one bin dominating; key/chords suppressed when unreliable
- ITD: max lag 1.2 ms, correlation floor 0.12

**Research knobs (v0.2)**
- temporal_contour scale 0.12; binaural ILD scale 0.08, ITD scale 0.5 ms
- onset_offset: silence < 0.005, new onset ≥ 0.12, continuity 0.15/0.25/0.95
- contradiction: supporting ≥ 0.75 vs opposing ≤ 0.35
- hypotheses: support ≥ 0.65, oppose ≤ 0.45 (on whole-trial *means*)

## Harness (built): `fox-ears-calibration-harness-2026-11-14.zip` (in this folder)
- `run.mjs` / `fox-calibrate.ts` / `offline-engine.ts`: decodes audio with ffmpeg, replays it through an offline copy of the Web Audio analyser and the engine's snapshot math, then through the app's own `HearingSampler` and `assembleMap`. Prints tempo, an onset-gate sweep, key, chords, voicing, vocal gate, ITD, sound objects and conflicts. Writes JSON. `--sens` sets sensitivity. `--demo` runs the built-in etude.
- `cal003_selfcheck.py`: held back with the locked key at `/workspace/fox-ears/cal003-key/` so Calibration 003 can stay blind.
- `reference_librosa.py`: an independent BPM and key reference (librosa). It's a cross-check, not ground truth.
- Baseline results: `calibration-baseline-2026-11-14.json`, `reference-librosa-2026-11-14.json`.
- **Caveat:** the analyser is a replica. Confirm the headline numbers with one browser pass before tuning anything.

Inputs were downloaded copies of Taylor's 14 songs (Death Spiral ×7, Cat Party ×4, Persona Garden ×3) from Games/Assets/Our Made/Audio. No audio is stored in this folder.

## First calibration findings (baseline, sensitivity 0.58)

1. **Tempo is the weakest measurement.** App tempo matched the reference on **1 of 14** songs, with octave and 3:2 errors forgiven (±4%). Confidence was 0.01–0.16 on every song, and answers stuck to 72/80/90/144/180. Cause: onsets are only timed on the 80 ms frame clock, and the 0.18 gate passes 1,000–3,000 "onsets" per song.
   Prototype fix, in the harness only: adaptive peak-picking on the ~60 Hz flux stream, fed to the *same* `estimateTempo`, got **10 of 14**, with 6 two-method agreements at confidence 0.38–0.45.
2. **Key:** 5 of 14 match the reference exactly (turn_the_screw D#m, spiral_system F#m, midnight_funky D, track_b Gm, stinky C). Most misses are relative or neighbouring keys (E minor vs A minor, A major vs E major, and so on).
3. **Pitch range is stuck at the detector limits.** Range came out E2–F6 on 13 of 14 songs, which is exactly the 80–1400 Hz search band. vocal_melody was empty or nearly empty everywhere, even with the vocal gate open on 2–10% of frames.
4. **Demo etude binding:** at the default 0.58 sensitivity only **3 of 9 grains** become sound objects (all the 1000 Hz ones). The 2000 and 4000 Hz grains peak at band energy 0.12 and 0.06, below `BAND_ON` 0.16. At 0.9 the high grains appear, but the noise bed breaks into 50+ 500 Hz flicker objects. One global `BAND_ON` can't do both, so it needs per-band or noise-floor-relative thresholds.
5. **v0.2 self-check (Cal 003 events):** event-by-event results against the locked key are held back so Calibration 003 can stay blind (the key lives on the box at `/workspace/fox-ears/cal003-key/`, not in this repo). Two runtime issues can be stated without the key: a silent gap can be misread as a spectral break, because a silent frame has cosine 0; and H_SPLIT confidence is stuck at 0.50 on every event, with H_SAME always "preferred". Whole-trial averaging hides a one-interval break.

## Next steps (proposed; nothing applied)
1. **Run Calibration 003 with a blind receiver** (roadmap step 1), using `fox_ears_v0_2_calibration_003_prompt.txt`. Riven has seen the locked key, so Riven can't be the receiver. Riven can score the receipt afterwards.
2. App tempo: move onset timing to the engine tick, with adaptive peak-picking, behind a flag. Re-run the harness and check that the tempo lab still passes 9/9.
3. Get Taylor's true BPM and key for a few of his songs. That turns the harness into a real answer key and retires the librosa stand-in.
4. bind.ts: per-band or noise-relative `BAND_ON`. Check against the demo etude's known 9 grains.
5. v0.2: score H_SPLIT on each interval's *minimum* (or count of breaks), not the whole-trial mean. Treat silence as "spectral UNAVAILABLE", not as a break.
6. Do one browser pass to confirm the replica numbers.
7. Repo (recommendation only): a private `vanzantium/fox-ears` repo, or a `fox_ears/` subtree in vela-residence (guild-hall Quest #15). Taylor decides.

## Open questions for Taylor
- Who is the blind receiver for Cal 003 (Winona, Arch, Vela, or someone else)?
- True BPM and key for a few of your songs?
- Which line comes first: the app (v4) or the research runtime (v0.2)? Vela's roadmap says the research chain first, with no real audio until Cal 003 and the next two steps are done. This harness used real audio for the *app* line only.
- Where should the code live (new repo, or the vela-residence subtree)?
- Licence / authorship for the v1–v4 zips (Grok Build output, no LICENSE file)?
