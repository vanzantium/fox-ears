# Fox Ears

A shared listening tool for the garden's assistants: to parse and digest songs, and to hear them as close as we can to Taylor's own metabolized perception.

This repository is **private**. All rights reserved by Taylor Van Zant. See [PROVENANCE.md](PROVENANCE.md).

## How we work (Taylor's rulings, 2026-11-14)

- **Research and app proceed together.** The old "research first, no real audio until Calibration 003" order is superseded.
- **No blind-test ceremony.** We play and calibrate together. Calibration 003 is a **challenge fixture** (a calibration game), not a blind test: its manipulation map is visible in the generator source, so nobody should call its results blind.
- **SOFT / SOLID.** Every reading is **SOFT** until it is checked against an answer key or a second independent method. It becomes **SOLID** once supported. Label it; don't hide it.
- **Taylor's own BPM/key answer key is coming.** Until it lands, every accuracy number here is **provisional** and measured against a librosa stand-in, which is a cross-check, not ground truth.

The canonical research runtime is [`research/fox_ears_v0_2_binding_grammar.py`](research/fox_ears_v0_2_binding_grammar.py) (fox-ears-0.2). The v4 web app in `app/` is the practice instrument: play a song, it paints, then it seals a hearing map.

## Layout

| Path | What it is |
|---|---|
| `research/` | Canonical v0.2 binding grammar, v0.1 history, related `music_mode.py` scaffold, and the Calibration 003 challenge-fixture prompt |
| `app/` | v4 web app, from `fox-ears-review-v4.zip` (`node_modules` and build output omitted) |
| `harness/` | Offline calibration harness (tracked copy; `app/calibration/` is its gitignored working copy) and metric JSONs. No audio. |
| `test-song/` | "Fox at the Gate" test-song baseline and variant scores |
| `docs/` | Dated logs, the browser/phone check, and a summary of Vela's START-HERE note |

Taylor's songs stay in Drive, not in this repo. The working Drive folder is:

https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf

## How to run

### Research (Python 3.13, stdlib only)

```bash
python research/fox_ears_v0_2_binding_grammar.py --test   # 17 tests (8 original + 9 P0 behavioral)
python research/fox_ears_v0_1.py --test                   # 8 tests
```

The P0 runtime (2026-11-15) builds **SAME / SPLIT / UNRESOLVED** from local **break events**: each has a time, cue, strength, persistence, recovery, supporting and conflicting cues, and availability. It no longer uses whole-trial cue means, so one noisy frame is logged as a BLIP and cannot decide a trial. Silent frames make spectral continuity **UNAVAILABLE**. Spatial continuity uses ILD in dB and ITD as separate measures. Inspector output now carries `break_events` and a `resolution` (always labelled SOFT).

To regenerate the Calibration 003 artifacts:

```bash
python research/fox_ears_v0_2_binding_grammar.py --outdir research/out
```

That writes the challenge prompt and measurement-only pack, plus the locked key and inspector JSON. Do not commit those last two; they are gitignored. The pack is pinned by sha256 in the tests, so a cue-extractor change can't silently alter it.

`research/music_mode.py` is a related scaffold. It is not the canonical runtime and expects an `OrganismRuntime` that is not in this repo.

### App (Node 24, npm 11 required)

npm 10's `npm ci` rejects the lockfile; Node 24 ships npm 11.

```bash
cd app
npm ci
npm run dev          # http://0.0.0.0:8080
npm run typecheck
npm test             # 96/96, fully green, runs in CI
npm run build
```

`npm test` covers the tempo, vocal and timing labs plus the app's script tests. The 9 leftover Grok "Wild Race" share-card template tests, which were red on every run, were removed on 2026-11-15. CI (`.github/workflows/tests.yml`) runs the research tests, typecheck, `npm test` and the build.

**Timing (P0, 2026-11-15).** The app reads its analysers on every display frame (60, 90 or 120 Hz, irregular, paused in background tabs). Readings are now stamped with AudioContext time, interpolated between audio callbacks with `getOutputTimestamp()` and mapped onto the file timeline. The tempo path then resamples them onto a fixed 10 ms grid (`resampleTicks` in `app/src/lib/hearing/tempo.ts`). The offline harness goes through the same path. `scripts/timing-lab.test.mjs` checks 96/108/120 BPM at 60/90/120 Hz, with jitter and a 3 s background gap, to within ±1%.

**Browser and phone.** See [`docs/browser-phone-check.md`](docs/browser-phone-check.md). `node scripts/browser-pass.mjs <audio> --url <dev url>` runs the desktop pass headless.

### Harness

See [`harness/README.md`](harness/README.md). Needs ffmpeg and the app's `npm ci`. Point it at local audio; do not add those files to git. New in P0:
- `--tick-hz 60|90|120 --jitter-ms N --gap from:to` simulates display rates;
- `--compare previous.json` reports **appraisal-input flips**, i.e. songs whose key mode changed, because the first-listen feeling is picked from mode alone.

## Current numbers (2026-11-15, all SOFT)

Measured against the librosa stand-in, pending Taylor's answer key. Tempo is reported two ways:

- **STRICT**: the BPM the app displays is within ±4% of the reference.
- **FORGIVEN**: half, double, 2:3 or 3:2 of the reference also counts (metrically equivalent, not "correct").

| 14 guard songs | STRICT tempo | FORGIVEN tempo | Key exact |
|---|---|---|---|
| Pre-pass-1 baseline (2026-11-14) | 0/14 | 1/14 | 5/14 |
| Tuning pass 1 (2026-11-14) | 9/14 | 12/14 | 10/14 |
| P0 timing (2026-11-15) | 10/14 | 12/14 | 10/14 |

The P0 strict gain is one song, `music_midnight_funky`. It was a near-tie between 68 and 136 BPM: the 136 rival scored 98% of the winner before, and the order has now flipped, with 68 at 96%. Read it as a coin landing the other way, not as an improvement.

Test song "Fox at the Gate" in the harness:
- **Master:** 96 BPM, G major, 7 sections.
- **108 BPM stretch:** 108 BPM, G major, 8 sections against 6 in truth.
- **Headless desktop Chrome:** 96 BPM, G major, but 9 sections on the master. See the P0 log.

Known weak spots:
- **Key and sections depend on the analyser read rate.** This is the analyser's per-read smoothing, not the clock: the stretch reads D major at 120 Hz in the harness. Not fixed in P0.
- **Sections over-split** off the master.
- **Vocal false positives** on centred instruments.
- **Research:** the four single-cue Cal 003 events all come out UNRESOLVED leaning SAME, at the same split confidence. Only multi-cue breaks reach a preferred SPLIT.

Full details: [`docs/p0-log-2026-11-15.md`](docs/p0-log-2026-11-15.md). Older write-ups: [`docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md`](docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md), [`docs/tuning-log-2026-11-14.md`](docs/tuning-log-2026-11-14.md).

## Next steps

1. **Taylor's BPM/key answer key** for the master and the 14 songs. Re-score, and relabel SOFT to SOLID where supported.
2. **Phone pass** by Taylor ([`docs/browser-phone-check.md`](docs/browser-phone-check.md)), compared with the desktop pass.
3. **Make the analyser read-rate-independent for key and sections** too, for example by computing spectra on the 10 ms grid or with an AudioWorklet.
4. **On hold until 1–3:** tuning pass 2 (key stability, section over-splitting, vocal false positives), and the Ear Organ refactor (factory profile, candidates, appraisal out of the shared engine).

## Vela's START-HERE

A short summary is in [`docs/vela-start-here-summary.md`](docs/vela-start-here-summary.md). The full note lives in the [Fox Ears Drive folder](https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf).
