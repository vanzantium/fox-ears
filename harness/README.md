# Fox Ears calibration harness (Riven, 2026-11-14)

Drop-in for the v4 app in `../app/`. Nothing in `app/src/` is changed.

## App line (fox-ears-review-v4)

```bash
cp offline-engine.ts fox-calibrate.ts run.mjs ../app/calibration/
cd ../app && npm ci
node calibration/run.mjs --demo path/to/*.mp3 --sens 0.58 --json out.json
FOX_REF=../harness/reference-librosa-2026-11-14.json node calibration/run.mjs path/to/*.mp3
```

Needs ffmpeg on PATH. `offline-engine.ts` mirrors the Web Audio AnalyserNode (Blackman window, smoothing 0.62, byte dB mapping) and the engine's snapshot math, then feeds the real HearingSampler + assembleMap. It is a replica, so confirm headline numbers with one browser pass.

Do not commit audio. Taylor's songs stay in Drive.

## Reference

`reference_librosa.py` gives an independent BPM/key for the cross-check (`pip install librosa soundfile`). It is NOT ground truth; Taylor's own BPM/key for his songs is the real answer key.

`calibration-baseline-2026-11-14.json` and `reference-librosa-2026-11-14.json` are the first 14-song baseline (metrics only).

## Research line (fox-ears-0.2)

The Cal 003 self-check script compares the runtime with the locked key, so it is held back on the box at `/workspace/fox-ears/cal003-key/cal003_selfcheck.py` until Vela has taken Calibration 003 blind.
