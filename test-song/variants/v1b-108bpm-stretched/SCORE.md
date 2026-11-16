# Fox at the Gate — variant 1b (108 BPM time-stretch of the master) score

Measured 14 November 2026, 5:38 PM America/Dawson_Creek. This is a pitch-preserving time-stretch of Taylor's master v1, made on this computer, not a new Suno take. Audio stays in Drive, not in this repo.

The intended change is tempo only: 96.006 → **108.0 BPM** (ratio **1.12493**), with key, form and vocal held steady. Unlike the Suno "108 BPM" render scored in [variant 1](../v1-108bpm/SCORE.md), **this file actually is 108 BPM**.

Companion numbers: [`results-v1b-108-stretched.json`](results-v1b-108-stretched.json), [`scoring-truth-v1b-108-stretched.json`](scoring-truth-v1b-108-stretched.json), [`fox-ears-harness-before.json`](fox-ears-harness-before.json), [`fox-ears-harness-pass1.json`](fox-ears-harness-pass1.json), [`fox-ears-score-v1b-108-stretched.json`](fox-ears-score-v1b-108-stretched.json), [`beat-grid-v1b-108-stretched.json`](beat-grid-v1b-108-stretched.json), the scaled lyrics as [`fox-at-the-gate-v1b-108bpm-stretched.srt`](fox-at-the-gate-v1b-108bpm-stretched.srt), and the script [`analyze_v1b_108_stretched.py`](analyze_v1b_108_stretched.py).

Drive copies (copy only, nothing moved or deleted): [Fox at the Gate - v1b 108bpm stretched.m4a](https://drive.google.com/file/d/10vQoW19GsUChjI55p29l7pDkEAsd8Aal/view) (`10vQoW19GsUChjI55p29l7pDkEAsd8Aal`), [WAV](https://drive.google.com/file/d/1D7WvGeB-sHT7uTFV0yCLgkGifkYPvGyS/view) (`1D7WvGeB-sHT7uTFV0yCLgkGifkYPvGyS`), and [this SCORE.md](https://drive.google.com/file/d/1Ou_F5OX9WyoLd3lV26w91gb644Z2r98I/view) (`1Ou_F5OX9WyoLd3lV26w91gb644Z2r98I`), all in folder `1oS7Banq5khgC3_rWiePi2Q0LKbxRWAmf`.

## File

| | |
|---|---|
| Title | Fox at the Gate — variant 1b (108 BPM time-stretch of master v1) |
| Source | Master v1 WAV (`sha256 19671e056afbc0e0322220ca38965ee1d50c0cd0e8aa43c0e134d71adcd34e8f`), itself the decode of [Fox at the Gate - master v1.m4a](https://drive.google.com/file/d/1DUBmrl13EM-MNAP7Ldg9f5cJgSALYMSE/view) |
| wav sha256 | `4b824fc63b4c3901f6f2dc7feeda9fe50c546479c2b8e478c5f279f6b2189cf5` |
| m4a sha256 | `83ec65e7c21f90b96a0408546a6e681bf2d695bd4bc952a1a29e7ede0936344b` |
| wav size | 18,503,900 bytes |
| m4a size | 2,382,826 bytes |
| Stretch engine | **ffmpeg 7.1.5 `rubberband` filter**, linked against **librubberband 3.3.0**. The rubberband CLI package was not installed, so this is not the `rubberband` binary and not a librosa phase-vocoder fallback. |
| Stretch settings | `tempo=108/96.006` (1.124929691894), `pitch=1`, `formant=preserved`, `pitchq=quality`, `transients=crisp`, `detector=compound`, `phase=laminar`, `window=standard`, `channels=together` |
| Sample rate / channels | 48 kHz, stereo |
| Duration | **96.373583 s** (WAV). Expected from the master's 108.4135 s WAV × 96.006/108 is **96.373579 s** (4 µs). The AAC m4a tag is 96.373 s. |
| m4a container | MPEG-4, AAC-LC at 192 kb/s, plus the master subtitle track with times scaled by 96.006/108 |

The m4a is a local encode only, for listening and Drive; scoring used the WAV.

## Requested vs measured

What we asked for: the same recording as the master, still in **G major** and 4/4, but at **exactly 108 BPM**. If only tempo moves, duration shrinks to about **96.36 s** and every lyric and section time scales by 96.006/108.

| | Requested | Measured | vs master | Confidence |
|---|---|---|---|---|
| Tempo | 108 BPM | **108.007 BPM** (mean inter-beat interval); librosa's tempo bin is 107.666 BPM | **+12.001 BPM** (+12.50%), ratio **1.1250**, as asked | **high** |
| Key | G major | **G major** (7 of 7 whole-song methods); intro alone is D major | unchanged; intro is still the same dominant vamp, just shorter | **high** |
| Meter | 4/4 | 4/4 beat grid, 168 beats, IBI CV 1.29%, local tempo 103.36–112.35 BPM | slightly steadier than the master's 1.54% CV (166 beats) | **high** |
| Structure | same 4 / 8 / 10 / 8 / 10 / ~3.5 bar shape, times scaled | 4 / 8 / 10 / 8 / 10 / ~3.45 bars at 108.007 BPM; lyric times are the master times × 96.006/108 | form held in *musical* time; wall-clock times shrank as expected | **high** (by construction of the stretch, confirmed by duration and key) |
| Vocal | solo male vocal from verse 1 | Scaled master stem regions and scaled SRT; on-fraction still **0.581** | unchanged in presence and amount; only the clock changed | **high** |
| Duration | ~96.36 s | **96.373583 s** | −12.0399 s vs the master's 108.4135 s WAV | **high** |

This is the controlled tempo-only variant that variant 1 (the Suno take) failed to be.

### Tempo methods

All four independent librosa estimates land on the same **107.666 BPM** bin, including a beat tracker started with a 96 BPM prior (it does not stick to 96). The beat grid is the finer measurement:

- `librosa.feature.tempo`: 107.666
- `librosa.beat.beat_track` (default, prior 96, and prior 108): 107.666, identical 168-beat grid in all three cases
- Tempogram: first real peak 107.666 (next are the 215.33 harmonic and the 53.83 half-time). A 0-lag artifact was dropped.
- Mean inter-beat interval (prior-108 grid): **108.007 BPM**, std 1.394 BPM, CV 0.0129
- Onset-envelope autocorrelation: **+0.82 at 108 BPM**, **+0.16 at 96 BPM**
- Local beat windows: **151 of 167** near 108 (±4%); **0 of 167** near 96

The first tracked beat is at 0.395 s. The master's first beat at 1.045 s would scale to 0.929 s; the tracker also picked up an earlier pulse, which is why the beat count is 168 rather than 166. The mean pulse is still clearly 108, not 96.

### Key methods

Krumhansl–Kessler and Temperley templates against chroma CQT, STFT, CENS, and a harmonic-only CQT all vote **G major**. The first 10 and first 20 seconds of *stretched* time (the same musical intro) still vote D major, because the intro is still a D-major (dominant) vamp. After the intro, G major is unambiguous (harmonic CQT *r* = 0.90, runner-up D major). Chroma mass is unchanged in pitch; only time was scaled.

Treat the intro's D-major colour as the same arrangement choice as on the master, not as a key change. Pitch was preserved.

## Section timestamps

Ground truth is the master truth scaled by **96.006/108**, not a new lyric or novelty read. **Lyric times** come from the master subtitle track, scaled. **Musical bars** use the master's 96.006 BPM grid, scaled (equivalent to 108 BPM on this file).

| Section | Lyric times (scaled) | Musical bars (scaled) | Bars | Notes |
|---|---|---|---|---|
| Intro (guitar) | 0:00.000 – 0:08.782 | 0:00.000 – 0:08.706 | 4 | Same 4-bar intro in D major, 1.10 s shorter. |
| Verse 1 | 0:08.782 – 0:26.157 | 0:08.706 – 0:26.484 | 8 | Four sung lines, same 8 bars. |
| Chorus 1 | 0:26.157 – 0:48.779 | 0:26.484 – 0:48.707 | 10 | Same 8+2-bar shape. |
| Verse 2 | 0:48.779 – 1:06.130 | 0:48.707 – 1:06.484 | 8 | Four sung lines, same length as verse 1. |
| Chorus 2 | 1:06.130 – 1:28.786 | 1:06.484 – 1:28.707 | 10 | Same 8+2 shape as chorus 1. |
| Outro | 1:28.786 – 1:36.362 | 1:28.707 – 1:36.374 | ~3.45 | Last "Fox at the gate" 1:28.786–1:29.958; guitar 1:29.958–1:34.793; fade to silence. Still short of 4 bars. |

If tempo had *not* scaled, verse 1 would still start near 0:09.88. It now starts at 0:08.78, exactly the master cue × 96.006/108. Form matches the master in musical time.

### Vocal on and off

Primary sources (high confidence): the master timed lyric lines and the master htdemucs stem regions, both scaled by 96.006/108. The stem was not re-separated; a time-stretch should not move vocal presence, only the clock. Vocal is on in the verse and chorus spans above, with the last sung line in the outro at 1:28.786–1:29.958. Vocal is off during the intro (0:00–0:08.782), the outro guitar (1:29.958–1:34.793), and the fade. Stem on-fraction remains **0.581**.

The only true low-energy gap is the final fade (last 0.4 s at **−74.1 dBFS**, vs **−74.6 dBFS** on the master). There is no mid-song silent break.

### Loudness

ITU-R BS.1770 via `ffmpeg ebur128=peak=true`, confidence **high**.

| | This file | Master |
|---|---|---|
| Integrated | **−16.4 LUFS** | −15.3 LUFS |
| Loudness range | **4.6 LU** | 4.8 LU |
| True peak | **−3.1 dBFS** (no clipping) | −3.1 dBFS |
| Sample peak | −3.1 dBFS | −3.1 dBFS |
| Overall RMS | −18.3 dBFS | −17.3 dBFS |
| Side/mid energy | 0.086 (same narrow, vocal-centred stereo) | 0.087 |
| Loudest 1 s | 1:22–1:23, −15.5 dBFS | 1:32–1:33, −14.5 dBFS (that region scales to ~1:22) |
| Quietest tail | last 0.4 s, −74.1 dBFS (fade) | last 0.4 s, −74.6 dBFS |

The stretch dropped integrated loudness by about 1.1 LU and RMS by 1.0 dB, with true peak and stereo image unchanged. That is a small processing side-effect of rubberband, not a musical change, and nothing like the mix drift on the Suno take (hotter peak, much narrower stereo, tighter LRA).

## Fox Ears readings vs this file's ground truth

Both runs used default sensitivity 0.58 on the 48 kHz WAV. The pre-tuning run is the v4 app at the `test-song/baseline-master` code (e82dd07), same copy as the earlier scores (`/workspace/fox-ears/v4`). The pass-1 run is the `tuning/pass-1` code (7daf724) in `/workspace/fox-ears-repo/app`. Scoring uses the same rule as the 14-song baseline: tempo is a hit within ±4% (octave and 3:2 forgiven); key must match exactly. **The answer key is 108.0 BPM and G major.** Section and vocal times are the master times × 96.006/108.

| | Ground truth | App default, before tuning | Tuning pass 1 | Verdict |
|---|---|---|---|---|
| Tempo | 108.0 BPM | **120 BPM**, confidence 0.40, two-method agreement at 120. Old 60 Hz proposal: **110 BPM**, confidence 0.44 | **108 BPM**, confidence 0.51, two-method sub-grid; rival 72 BPM at 72% | Before: **miss** (11.11% high). On the master it said 90, so it *did* move, just not to 108. Pass 1: **hit** (0.00%). Ratio to its own master reading (96) is **1.125** — the change we asked for. |
| Key | G major | **D major (0.87)**, chroma marked reliable | **G major (0.87)**, "G over D confirmed by the scale-degree test" | Before: miss, same intro-dominant trap as the master. Pass 1: **hit**. It kept G, the same call as on the master. The G→D flip seen on the Suno take **did not happen** here. |
| Sections | 6 (intro, 2 verses, 2 choruses, outro) | **2** | **8**. Cuts at 13.2, 26.0, 43.7, 57.6, 69.3, 78.7, 90.4 s. Nearest-cut error vs lyrics 4.40 / 0.20 / 5.05 / 3.16 / 1.61 s; vs bars 4.47 / 0.53 / 4.98 / 2.80 / 1.69 s | Before: miss, same as the master. Pass 1: **partial.** Chorus 1's start is close (26.0 vs 26.16). The intro/verse cut is 4.4 s late, chorus 1's end is 5 s early, and an extra mid-chorus-2 cut appears at 78.7 s. Count goes 6 truth / 7 master reading / 8 here. The intro is labelled "verse A". The Suno take's 10-section split **did not fully recur**, but the splitter still did not scale its master cuts cleanly. |
| Vocal | solo vocal through five sections; stem on-fraction 0.581 | `vocal_gate` 4.0%, **0 vocal notes** | mask 46.3%, 24 regions, 3 vocal notes; vs scaled stem **P 0.90 / R 0.72**; vs scaled SRT spans P 0.98 / R 0.54 | Before: miss, same as the master (gate 4.1%, 0 notes). Pass 1: **hit**, essentially the same as the master (P 0.92 / R 0.72). It still hears the vocal; it does not invent a "vocals vanished" change. |
| Other | — | 23 chords, 106 notes, range E2–F5, 130 objects, 225 conflicts, 0.9% silent frames | 28 chords; same object/conflict counts; `vocal_gate` 39.7%; silent frames 0.9% | Silent-frame rate matches the final fade. Object counts are lower than on the longer master, as expected. |

### Did Fox Ears detect the change, and only the change?

**Mostly, on pass 1. Tempo moved, key and vocal held, form is the weak spot.**

- **Tempo:** pass 1 moved from 96 BPM on the master to **108 BPM** here, ratio 1.125. That is the correct behaviour, and the first clean evidence that the sub-grid tracker follows a real tempo change. Confidence is lower than on the master (0.51 vs 0.84), with a 72 BPM (2:3) rival at 72%. The default app moved 90 → 120 and missed both files.
- **Key:** pass 1 stayed on **G major** (0.87) with "G over D confirmed". No false key change. The G-vs-D flip on the Suno 108 take is therefore a property of that *new performance*, not of tempo itself.
- **Sections:** it reported a small change that is not in the audio (7 → 8 sections) and its cuts did not all scale with the stretch. Over-splitting is milder than the Suno take's 10 sections, but the splitter is still not stable under a pure time-stretch.
- **Vocal:** it kept hearing the vocal, with P/R essentially unchanged. No false vocal-off report.

So pass 1 caught the tempo change cleanly and left key and vocal alone. It did not leave structure entirely alone.

### What this take says about the issues raised on the Suno 108 render

1. **The tonic-vs-dominant key check is stable on a true time-stretch of the same recording.** Same intro vamp, same key, only the clock changed, and pass 1 again says "G over D confirmed". The flip to D on variant 1 is tied to Suno's new take (different mix, narrower stereo, busier novelty), not to tempo.
2. **Section over-splitting is milder here than on the Suno take** (8 vs 10 vs 7 on the master vs 6 truth), but it is not gone. Pass 1 still invents a mid-chorus-2 cut and misses the intro and chorus-1-end boundaries by 4–5 s. A second tuning pass on the splitter is still warranted; this file just shows that the 10-cut reading was inflated by the new performance.
3. **This file is a valid 108 BPM test.** Fox Ears pass 1 *does* track a real tempo change. The remaining false difference is form, not tempo or key.

## Unintended differences vs the master (complete list)

These are differences in the *audio*, independent of Fox Ears:

1. Tempo changed as requested (108.007 vs 96.006, ratio 1.1250).
2. Duration shrank to 96.373583 s, as requested.
3. Lyric and section times scaled by 96.006/108, as requested.
4. Integrated loudness dropped ~1.1 LU (−16.4 vs −15.3 LUFS); RMS −18.3 vs −17.3 dBFS. True peak stayed −3.1 dBFS; LRA 4.6 vs 4.8 LU; side/mid 0.086 vs 0.087.
5. Beat count is 168 vs 166; first tracked beat is 0.395 s vs a scaled 0.929 s. Mean pulse and CV stay on target.
6. Same Suno id and the same 6-section form, because this is the same recording, stretched. No new mix, no new performance.

## Research runtime

Not run on this file, and it should not be forced. Same reason as the master: the research runtime only accepts synthetic cue trials, not audio. Nothing in `research/` was touched.

## Commands used

Working copies lived at `/workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/`. Python is the existing Fox Ears venv (librosa 1.0.1, soundfile 0.14.0, numpy 2.5.4). The pre-tuning harness is the v4 copy at `/workspace/fox-ears/v4`. The pass-1 harness is `/workspace/fox-ears-repo/app` at commit 7daf724. Scoring truth is the master truth with all times × 96.006/108; the vocal stem was not re-separated.

```bash
# time-stretch, pitch preserved (ffmpeg rubberband / librubberband 3.3.0)
RATIO=$(python3 -c "print(f'{108/96.006:.12f}')")
ffmpeg -y -i /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav \
  -af "rubberband=tempo=${RATIO}:pitch=1:formant=preserved:pitchq=quality:transients=crisp:detector=compound:phase=laminar:window=standard:channels=together" \
  -acodec pcm_s16le \
  /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav

# scale the master SRT by 96.006/108, encode a listening m4a, hash, loudness
# (see analyze_v1b_108_stretched.py for the SRT scaling)
ffmpeg -y -i /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav \
  -i /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.srt \
  -c:a aac -b:a 192k -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart \
  /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.m4a
sha256sum /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav \
  /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.m4a
ffmpeg -i /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav \
  -af ebur128=peak=true -f null -

# verify tempo / key / duration, write scaled scoring truth
/workspace/fox-ears/.venv/bin/python /workspace/fox-ears/test-song/analyze_v1b_108_stretched.py

# pre-tuning default
cd /workspace/fox-ears/v4
node calibration/run.mjs --sens 0.58 \
  --json /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-ears-harness-before.json \
  /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav

# tuning pass 1, scored against the scaled master truth
cd /workspace/fox-ears-repo/app
node calibration/run.mjs --sens 0.58 \
  --json /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-ears-harness-pass1.json \
  --truth /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/scoring-truth-v1b-108-stretched.json \
  fox-at-the-gate-v1b-108bpm-stretched.wav \
  /workspace/fox-ears/test-song/variants/v1b-108bpm-stretched/fox-at-the-gate-v1b-108bpm-stretched.wav

# score both harness dumps against the scaled truth (same script, second pass)
/workspace/fox-ears/.venv/bin/python /workspace/fox-ears/test-song/analyze_v1b_108_stretched.py
```

Audio extensions were already in the repo `.gitignore`. No audio was committed. The Cal 003 key and the research runtime were not touched.
