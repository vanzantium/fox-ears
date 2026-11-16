# Fox Ears calibration harness (Riven, 2026-11-14)

Drop-in for the v4 app in `../app/`. The harness itself changes nothing in `app/src/`.

**Update 2026-11-14 (tuning pass 1, America/Dawson_Creek):** the fixes the harness proposed now live in the app (sub-grid tempo in `hearing/tempo.ts`, vocal cues in `audio/vocal.ts`, whole-song key in `hearing/score.ts`, novelty sections in `hearing/form.ts`). The harness imports those modules, so harness and app stay in step. `app/calibration/` is gitignored, so copy the files again after any change here. See `../docs/tuning-log-2026-11-14.md`.

## App line (fox-ears-review-v4)

```bash
cp offline-engine.ts fox-calibrate.ts run.mjs ../app/calibration/
cd ../app && npm ci
node calibration/run.mjs --demo path/to/*.mp3 --sens 0.58 --json out.json
FOX_REF=../harness/reference-librosa-2026-11-14.json node calibration/run.mjs path/to/*.mp3
# score the master against independent truth (tempo, bars, lyric cues, demucs vocal regions)
node calibration/run.mjs --truth ../test-song/results/scoring-truth-master.json fox-at-the-gate-master.wav path/to/master.wav
```

`--truth <json> <name>` scores the named file against the truth JSON: tempo error, section boundary error in seconds, and vocal frame precision and recall. `--demo` also scores the 36 s etude's grains.

**Update 2026-11-15 (P0):**
- **Display-rate simulation:** `--tick-hz 60|90|120`, `--jitter-ms N` and `--gap fromMs:toMs` (no analyser reads, like a background tab).
- **Tempo vs `FOX_REF`:** reported **STRICT** (displayed BPM within ±4%) and **FORGIVEN** (half, double, 2:3 or 3:2 also accepted) separately.
- **Feeling flag:** `--compare previous.json` lists songs whose key mode flipped, since key mode alone sets the first-listen feeling.
- **Same timing path as the app:** ticks are resampled onto the 10 ms grid inside `chartTempo`.
- All numbers are SOFT until Taylor's answer key lands.

Needs ffmpeg on PATH. `offline-engine.ts` mirrors the Web Audio AnalyserNode (Blackman window, smoothing 0.62, byte dB mapping) and the engine's snapshot math, then feeds the real HearingSampler + assembleMap. It is a replica, so confirm headline numbers with one browser pass.

Do not commit audio. Taylor's songs stay in Drive.

## Reference

`reference_librosa.py` gives an independent BPM/key for the cross-check (`pip install librosa soundfile`). It is NOT ground truth; Taylor's own BPM/key for his songs is the real answer key.

`calibration-baseline-2026-11-14.json` and `reference-librosa-2026-11-14.json` are the first 14-song baseline (metrics only).

## Research line (fox-ears-0.2)

The Cal 003 self-check script compares the runtime with the locked key and is kept on the box at `/workspace/fox-ears/cal003-key/cal003_selfcheck.py`. Per Arch's 2026-11-15 review and Taylor's ruling, Cal 003 is a **challenge fixture**, not a blind test: its manipulation map is already visible in the generator source. The script stays off the repo only because it isn't needed there.
