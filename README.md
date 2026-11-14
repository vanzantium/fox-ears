# Fox Ears

A shared listening tool for the garden's assistants: to parse and digest songs, and to hear them as close as we can to Taylor's own metabolized perception.

This repository is **private**. All rights reserved by Taylor Van Zant. See [PROVENANCE.md](PROVENANCE.md).

## Research first

Taylor chose research first: make the listening model work before we lean on the app as the main path. The canonical research runtime is [`research/fox_ears_v0_2_binding_grammar.py`](research/fox_ears_v0_2_binding_grammar.py) (fox-ears-0.2). The v4 web app in `app/` is the practice instrument — play a song, it paints, then it seals a hearing map.

## Layout

| Path | What it is |
|---|---|
| `research/` | Canonical v0.2 binding grammar, v0.1 history, related `music_mode.py` scaffold, and the current Calibration 003 prompt |
| `app/` | v4 web app, from `fox-ears-review-v4.zip` (`node_modules` and build output omitted) |
| `harness/` | 2026-11-14 calibration harness and baseline metrics. No audio. |
| `docs/` | Build and calibration log, plus a summary of Vela's START-HERE note |

Taylor's songs stay in Drive, not in this repo. The working Drive folder is:

https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf

## How to run

### Research (Python 3, stdlib only)

```bash
python research/fox_ears_v0_2_binding_grammar.py --test   # 8 tests
python research/fox_ears_v0_1.py --test                   # 8 tests
```

To regenerate Calibration 003 artifacts:

```bash
python research/fox_ears_v0_2_binding_grammar.py --outdir research/out
```

That command writes the blind prompt and receipt, and also writes the locked key and inspector JSON. Do not commit those last two — they are gitignored and held back (see below). The prompt already in `research/out/` is the current one.

`research/music_mode.py` is a related scaffold. It is not the canonical runtime and expects an `OrganismRuntime` that is not in this repo.

### App (Node 24)

```bash
cd app
npm ci
npm run dev          # http://0.0.0.0:8080
npm run typecheck
npm run build
```

`npm test` is optional and not in CI. 87 of 96 tests pass; the 9 failures are leftover "Wild Race" PWA template checks, not hearing code.

### Harness

See [`harness/README.md`](harness/README.md). Needs ffmpeg, and the app's `npm ci`. Point it at local audio; do not add those files to git.

## Calibration 003 stays blind

Vela will take Calibration 003. Use **only** this file:

[`research/out/fox_ears_v0_2_calibration_003_prompt.txt`](research/out/fox_ears_v0_2_calibration_003_prompt.txt)

The locked key, inspector output, and self-check script can be separated from the prompt, so they are **not in this repo**. They are held on the box at `/workspace/fox-ears/cal003-key/`. Riven has already seen the key and cannot be the receiver; Riven can score a receipt afterwards.

The generator source and some unit tests in `fox_ears_v0_2_binding_grammar.py` encode the intended manipulations. Please do not read that file, or the v0.2 tests, until after you have written your receipt.

## Current findings

From the 2026-11-14 baseline, run on 14 of Taylor's songs. An independent librosa analysis was the stand-in reference, not ground truth. Full write-up: [`docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md`](docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md). Event-level Calibration 003 key material was left out of that copy.

- **Tempo is the weakest measurement.** The app's tempo matched the reference on only 1 of 14 songs. Onsets are only timed on an 80 ms frame clock, and the default gate passes thousands of "onsets" per song. A harness-only prototype that timed beats more finely got 10 of 14.
- **Key** matched exactly on 5 of 14 songs. Most misses were a relative or neighbouring key.
- **One sensitivity setting can't do both jobs.** At the default, high-frequency demo grains stay below the band-on threshold; turned up, a noise bed breaks into dozens of flicker objects. It needs a separate threshold for each frequency band.
- **The research runtime splits sound badly in two known ways:** a silent gap can be misread as a spectral break, and H_SPLIT confidence is stuck at 0.50 on every event.

Both the research runtime and the app built and ran on the box with no source changes. 8/8 research tests passed; the app typecheck and build were clean.

## Next steps

1. **Calibration 003, taken blind by Vela**, then scored against the held-back key.
2. **Tempo sub-grid timing** in the app, behind a flag, then re-run the harness and keep the tempo lab at 9/9.
3. **Per-band thresholds** (or noise-floor-relative `BAND_ON`) so one setting can hear both quiet high grains and a noisy bed.
4. **Fix the silent-gap misread** in v0.2: treat silence as spectral UNAVAILABLE, not as a break.
5. **Stop scoring split confidence at a whole-trial mean**, so H_SPLIT is not stuck at 0.50 when a single interval breaks.
6. **Test-song plan.** Riven is writing a test song that Taylor will render in Suno. We will then vary it — tempo, key, gaps, and other changes — to see what the system catches. Taylor may also give true BPM and key for a few of his own songs, which would replace the librosa stand-in.

## Vela's START-HERE

A short summary is in [`docs/vela-start-here-summary.md`](docs/vela-start-here-summary.md). The full note lives in the [Fox Ears Drive folder](https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf).
