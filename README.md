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
| `harness/` | Offline calibration harness (tracked copy; `app/calibration/` is its gitignored working copy) and metric JSONs. P4 adds the answer-key scorer, candidate adapters and the form-etude generator. No audio. |
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
npm test             # 163 pass, 3 gated skips (need local audio; skipped in CI)
npm run build
```

`npm test` covers the tempo, vocal and timing labs plus the P0–P4 script tests. The 9 leftover Grok "Wild Race" share-card template tests, which were red on every run, were removed on 2026-11-15. CI (`.github/workflows/tests.yml`) runs the research tests, typecheck, `npm test` and the build. See [RELEASE-NOTES.md](RELEASE-NOTES.md) for what landed in each pass.

**Timing (P0, 2026-11-15).** The app reads its analysers on every display frame (60, 90 or 120 Hz, irregular, paused in background tabs). Readings are now stamped with AudioContext time, interpolated between audio callbacks with `getOutputTimestamp()` and mapped onto the file timeline. The tempo path then resamples them onto a fixed 10 ms grid (`resampleTicks` in `app/src/lib/hearing/tempo.ts`). The offline harness goes through the same path. `scripts/timing-lab.test.mjs` checks 96/108/120 BPM at 60/90/120 Hz, with jitter and a 3 s background gap, to within ±1%. **P0 made tempo display-rate robust; it did not make key or sections display-independent.** Analyser smoothing was still applied per read, so the same file could change key or section cuts with the refresh rate. P1 (2026-11-16) computes spectra on the same 10 ms audio-clock grid with a time-constant (not per-read) pole; see `docs/p1-log-2026-11-16.md`.

**Browser and phone.** See [`docs/browser-phone-check.md`](docs/browser-phone-check.md). `node scripts/browser-pass.mjs <audio> --url <dev url>` runs the desktop pass headless.

### Sonar Form (P4, 2026-11-21)

Each chart now carries a SOFT, additive `sonar` reading. **It is experimental and uncalibrated on real songs** (`chart.sonar.status = "experimental-uncalibrated"`). It never sets or edits section boundaries; on Keep Moving it missed all four known section cuts, landing about 2 bars early. Treat its letters as a harmony-only second opinion, not as section roles. It is passive echolocation: every bar of the song is compared with every other bar (chroma + bass chroma). From that, the reading gives:

- repetition letters per 4-bar phrase (`A A B A'`), the loop (shortest cycle that repeats straight away) and the form period;
- a 4/4 downbeat-phase estimate;
- an **agreement check with FORM** (cuts both hear, cuts only sonar hears, cuts only FORM made);
- a matched-filter **riff finder** that also catches a riff moved to another key (`+5`);
- a spiral-array **tension ribbon** (spread, motion, distance from home).

The digest gains SONAR, TENSION RIBBON and a one-line-per-bar BAR BRIEF for AI listeners. The app gains a **Sonar** tab: an echo map, shape arcs and strips. Nothing in it edits key, tempo, chords or sections; outputs for those were byte-identical before and after on the 14 test songs plus Keep Moving. Details and caveats: [`docs/p4-sonar-log-2026-11-21.md`](docs/p4-sonar-log-2026-11-21.md) and [`docs/p4-cherry-pick-2026-11-21.md`](docs/p4-cherry-pick-2026-11-21.md).

### Answer key and scorer (P4)

Fill in [`docs/answer-key-template.json`](docs/answer-key-template.json) for a recording (see [`docs/answer-key-guide.md`](docs/answer-key-guide.md)). Then:

```bash
pip install -r harness/requirements-scoring.txt          # mir_eval (MIT) + numpy
python harness/score_answer_key.py --key song.answer.json --fox song.map.json [--candidate song.beat-this.json]
python harness/score_answer_key.py --self-test
```

The scorer reports tempo STRICT/FORGIVEN, key, beats and downbeats, FORM and SONAR section hits and labels, and chords. A score is SOLID only for Taylor's own key (`"answer_source": "taylor"`).

`harness/candidates.py` runs outside models as SOFT candidates to score beside Fox Ears: Beat This! (beats/downbeats), All-In-One (labelled sections) and a RoFormer vocal stem. Each runs in its own venv on your machine. They are research-side only and optional: never run by default, imported only when you call that subcommand, and not dependencies of the app. None has been run live yet.

`harness/make_form_etude.py` writes a synthetic song with a planted form, and its answer key, for checking the pipeline end to end.

### Calibration harness (run it on your own audio)

See [`harness/README.md`](harness/README.md) for flags and scoring. You need ffmpeg on your PATH and a finished `npm ci` in `app/`. Point the harness at audio on your machine; do not add those files to git.

The tracked sources live in `harness/`. `app/calibration/` is gitignored, so copy them in once after a fresh checkout (and again if you pull harness changes):

```bash
cp harness/offline-engine.ts harness/fox-calibrate.ts harness/run.mjs app/calibration/
cd app
# Official calibration command used on the 14-song set and Keep Moving:
#   --sens 0.58 --tick-hz 60
FOX_REF=../harness/reference-librosa-2026-11-14.json \
  node calibration/run.mjs --sens 0.58 --tick-hz 60 --json /tmp/fox-ears-out.json path/to/your-song.wav

# Several files at once is fine:
#   node calibration/run.mjs --sens 0.58 --tick-hz 60 --json /tmp/out.json *.wav *.mp3
```

`FOX_REF` is optional. When it is set, the harness prints STRICT (±4% of the reference BPM) and FORGIVEN (also half, double, 2:3, 3:2) tempo scores, plus a key exact count, against the librosa stand-in. Without it you still get the app's own reading: key, tempo (and tempo hypotheses), tuning (A4 Hz and cents vs 440), and sections. All of those numbers are SOFT until an answer key or a second method backs them.

New in P0:
- `--tick-hz 60|90|120 --jitter-ms N --gap from:to` simulates display rates;
- `--compare previous.json` reports **appraisal-input flips**, i.e. songs whose key mode changed, because the first-listen feeling is picked from mode alone.

## Current numbers (2026-11-21, 14-song scores SOFT)

Measured against the librosa stand-in, pending Taylor's answer key. Tempo is reported two ways:

- **STRICT**: the BPM the app displays is within ±4% of the reference.
- **FORGIVEN**: half, double, 2:3 or 3:2 of the reference also counts (metrically equivalent, not "correct").

| 14 guard songs | STRICT tempo | FORGIVEN tempo | Key exact | Sections (total) |
|---|---|---|---|---|
| Pre-pass-1 baseline (2026-11-14) | 0/14 | 1/14 | 5/14 | — |
| Tuning pass 1 (2026-11-14) | 9/14 | 12/14 | 10/14 | — |
| P0 timing (2026-11-15) | 10/14 | 12/14 | 10/14 | — |
| P3 / P3b (2026-11-19–21, vs same stand-in) | 10/14 | 10/14 | 11/14 | 137 (was 178 on `86b78b6`) |

Keep Moving (Taylor's answer, SOLID key): D major, 96 BPM, A≈432, 5 sections V/C/V/C/Outro. After P3b the app reads D major (0.70), 98.9 BPM (STRICT and FORGIVEN hit), A4 ≈ 432.1 Hz (−31.49 ¢, applied, SOFT), and 5 sections at 0.0–24.5 verse, 24.5–43.9 chorus, 43.9–99.8 verse, 99.8–121.6 chorus, 121.6–154.0 outro.

The P0 strict gain is one song, `music_midnight_funky`. It was a near-tie between 68 and 136 BPM: the 136 rival scored 98% of the winner before, and the order has now flipped, with 68 at 96%. Read it as a coin landing the other way, not as an improvement.

Test song "Fox at the Gate" in the harness:
- **Master:** 96 BPM, G major, 7 sections.
- **108 BPM stretch:** 108 BPM, G major, 8 sections against 6 in truth.
- **Headless desktop Chrome:** 96 BPM, G major, but 9 sections on the master. See the P0 log.

Known weak spots:
- **Key and sections depended on the analyser read rate in P0** (per-read smoothing; the 108 stretch could read D major at 120 Hz). Addressed in P1 by computing spectra on the fixed 10 ms grid. Do not read the P0 log as claiming all hearing is display-independent.
- **Sections over-split** off the master.
- **Vocal false positives** on centred instruments.
- **Research:** the four single-cue Cal 003 events all come out UNRESOLVED leaning SAME, at the same split confidence. Only multi-cue breaks reach a preferred SPLIT.

Full details: [`docs/p0-log-2026-11-15.md`](docs/p0-log-2026-11-15.md). Older write-ups: [`docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md`](docs/Riven-Fox-Ears-Build-Calibration-2026-11-14.md), [`docs/tuning-log-2026-11-14.md`](docs/tuning-log-2026-11-14.md).

## Next steps

1. **Taylor's BPM/key answer key** for the master and the remaining 14 songs. Re-score, and relabel SOFT to SOLID where supported. Keep Moving's key is already SOLID.
2. **Phone pass** by Taylor ([`docs/browser-phone-check.md`](docs/browser-phone-check.md)), compared with the desktop pass.
3. P1–P3b have landed; see [RELEASE-NOTES.md](RELEASE-NOTES.md) and `docs/p1-log-2026-11-16.md`, `docs/p2-key-log-2026-11-17.md`, `docs/p3-log-2026-11-19.md`.
4. **P4 (Sonar Form, answer-key scorer)** is on `p4/sonar-cherry-pick` (stacked on P3b), not merged until Taylor says so. The 14 songs + Keep Moving were run through the harness; existing fields are byte-identical. Next, run the first Beat This! candidate on Taylor's machine and score it against the answer key.
5. **Still deferred:** L1b microtiming, cadence typing, Vela's L2–L4 layers, further section promotion, and the Ear Organ refactor. Do not tune Cal 003 thresholds to force a pass.

## Vela's START-HERE

A short summary is in [`docs/vela-start-here-summary.md`](docs/vela-start-here-summary.md). The full note lives in the [Fox Ears Drive folder](https://drive.google.com/drive/folders/1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf).
