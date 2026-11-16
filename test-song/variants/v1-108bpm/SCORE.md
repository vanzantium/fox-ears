# Fox at the Gate — variant 1 (requested 108 BPM) score

Measured 14 November 2026, 3:59 PM America/Dawson_Creek, from the first "108 BPM" Suno render Taylor sent as variant 1 of the test song. Audio stays in Drive, not in this repo.

Drive copy: [Fox at the Gate - v1 108bpm.m4a](https://drive.google.com/file/d/1mS0DQqBcHnIa0D0J7upeixkzfHDK6vte/view)

Companion numbers: [`results-v1-108bpm.json`](results-v1-108bpm.json), [`ground-truth-v1-108bpm.json`](ground-truth-v1-108bpm.json), [`scoring-truth-v1-108bpm.json`](scoring-truth-v1-108bpm.json), [`fox-ears-harness-before.json`](fox-ears-harness-before.json), [`fox-ears-harness-pass1.json`](fox-ears-harness-pass1.json), [`beat-grid-v1-108bpm.json`](beat-grid-v1-108bpm.json), and the timed lyrics as [`fox-at-the-gate-v1-108bpm.srt`](fox-at-the-gate-v1-108bpm.srt).

The intended change was tempo only: 96.006 → about 108 BPM (ratio 1.125), with key, form and vocal held steady. **Suno did not make that change.** Score everything against what this file actually is, not against the prompt.

## File

| | |
|---|---|
| Title | Fox at the Gate — variant 1 (requested 108 BPM) |
| m4a sha256 | `a3079cf897284e1054c1d7c39ab1bafe2adf86cd7d86b9f92687c31d9b23fbf5` |
| wav sha256 | `0475b5b5e555ded81040772a4701123899a9329ef472e474d61b8ee1b57d22c1` |
| m4a size | 1,768,523 bytes |
| Container | MPEG-4 (`isom`/`iso2`/`mp41`), audio codec **Opus** at 127 kb/s |
| Sample rate / channels | 48 kHz, stereo |
| Duration | **108.680 s** (m4a tag); WAV decode is 108.694 s (13.5 ms of decoder padding) |
| Embedded metadata | Full lyrics (same words as the master); timed subtitle stream; comment `made with suno; created=2026-11-14T22:54:50Z; id=62d38eef-d384-4285-9a97-714f0cfe084d` |
| Suno created | 14 November 2026, 3:54 PM America/Dawson_Creek (`2026-11-14T22:54:50Z`) |
| Suno id | `62d38eef-d384-4285-9a97-714f0cfe084d` |

The WAV is a local decode only (`ffmpeg -acodec pcm_s16le`, native 48 kHz) and is not uploaded or committed.

## Requested vs measured

What we asked Suno for: the same indie folk pop arrangement as the master, still in **G major** and 4/4, but at **108 BPM**. If only tempo had moved, duration would shrink to about **96.4 s** and the lyric times would scale by 96/108.

| | Requested | Measured | vs master | Confidence |
|---|---|---|---|---|
| Tempo | 108 BPM | **96.564 BPM** (mean inter-beat interval); librosa's tempo bin is 95.703 BPM | **+0.558 BPM** (+0.58%), ratio **1.006**, not 1.125 | **high** that it is still ~96, not 108 |
| Key | G major | **G major** (7 of 9 methods); intro alone is D major | unchanged; intro is again a dominant vamp | **high** |
| Meter | 4/4 | 4/4 beat grid, 168 beats, IBI CV 4.72%, local tempo 94.17–102.76 BPM | slightly less steady than the master's 1.54% CV | **medium–high** (pulse is 96, stability is only medium) |
| Structure | same 4 / 8 / 10 / 8 / 10 / ~3.5 bar shape, times scaled | 3.98 / 7.81 / 10.24 / 7.87 / 10.26 / 3.56 bars at 96.564 BPM; lyric times almost identical to the master | form held in *wall-clock* time, which is correct only because tempo also held | **high** |
| Vocal | solo male vocal from verse 1 | Timed lyrics plus a centred vocal; htdemucs stem on-fraction **0.584** (master 0.581) | unchanged in presence and amount | **high** for *when* lines are sung (SRT / stem); **medium** for automatic VAD |
| Duration | ~96.4 s if only tempo changed | **108.680 s** | +0.280 s vs the master's 108.400 s | **high** |

Suno honoured key, form and vocal, and ignored the one change we asked for. This file is a new take of the same 96 BPM song, not a 108 BPM variant.

### Tempo methods

All four independent librosa estimates land on the same 95.703 BPM bin, including a beat tracker started with a 108 BPM prior. The beat grid is the finer measurement:

- `librosa.feature.tempo`: 95.703
- `librosa.beat.beat_track` (default, prior 96, and prior 108): 95.703, identical 168-beat grid in all three cases
- Tempogram peak: 95.703 (next peaks are the 198.77 harmonic and 184.57; 108 is not in the top eight)
- Mean inter-beat interval: **96.564 BPM**, std 4.560 BPM, CV 0.0472
- Onset-envelope autocorrelation: **+0.41 at 96 BPM**, **−0.13 at 108 BPM**
- Local 8-beat windows: **39 of 40** near 96 (±4%); **0 of 40** near 108

The first tracked beat is at 0.116 s, which is also the estimated first downbeat. The opening window is a little rushed (mean 102.8 BPM) and then the grid settles near 96. That early jitter is why the CV is medium rather than high; drop the first window and the pulse is still clearly 96, not 108.

### Key methods

Krumhansl–Kessler and Temperley templates against chroma CQT, STFT, CENS, and a harmonic-only CQT all vote **G major**, except the intro windows. The first 10 and first 20 seconds vote D major because the intro itself is again a D-major (dominant) vamp. After the intro, G major is unambiguous (harmonic CQT *r* = 0.92, runner-up D major). Chroma mass sits on G, D, and A — I, V, and II of G major, same as the master.

Treat the intro's D-major colour as the same arrangement choice as on the master, not as a key change.

## Section timestamps

Two aligned readings. **Lyric times** come from the timed subtitle track muxed into the m4a (section labels in that track are zero-duration and stamped at the first lyric of the next section, so Intro is inferred as 0 to the first verse line). **Musical bars** use the 96.564 BPM grid and the estimated first downbeat at 0.116 s.

| Section | Lyric times | Musical bars | Bars | Δ start vs master | Notes |
|---|---|---|---|---|---|
| Intro (guitar) | 0:00.000 – 0:09.903 | 0:00.000 – 0:10.058 | 3.98 | 0.000 s | Still a 4-bar intro in D major. |
| Verse 1 | 0:09.903 – 0:29.317 | 0:10.058 – 0:29.941 | 7.81 | +0.024 s | Four sung lines, slightly short of 8 bars. |
| Chorus 1 | 0:29.317 – 0:54.770 | 0:29.941 – 0:54.795 | 10.24 | −0.108 s | Same 8+2-bar shape. "Hearing everything" is held from 0:46.828 to 0:54.770. |
| Verse 2 | 0:54.770 – 1:14.339 | 0:54.795 – 1:14.678 | 7.87 | −0.103 s | Four sung lines, same length as verse 1. |
| Chorus 2 | 1:14.339 – 1:39.835 | 1:14.678 – 1:39.532 | 10.26 | −0.053 s | Same 8+2 shape as chorus 1. |
| Outro | 1:39.835 – 1:48.694 | 1:39.532 – 1:48.694 | 3.56 | −0.043 s | Last "Fox at the gate" 1:39.835–1:41.094; guitar 1:41.094–1:46.534; fade to silence. Still short of 4 bars. |

If tempo had scaled, verse 1 would start near 0:08.79, not 0:09.90. Every boundary is within 0.11 s of the master. Form matches the master in wall-clock time.

A structural-novelty check on chroma-CENS recurrence is busier here than on the master and does not land cleanly on the lyric boundaries (the nearest intro/verse peak is 9.125 s, just outside a beat of 9.903 s). Later mid-section novelty may help explain why Fox Ears also over-segments this take. Use the SRT and the bar grid as the section truth, not the novelty peaks.

### Vocal on and off

Primary sources (high confidence): the timed lyric lines, checked against an htdemucs vocal stem (on when stem RMS > −40 dBFS, the same rule as the master). Vocal is on in the verse and chorus spans above, with the last sung line in the outro at 1:39.835–1:41.094. Vocal is off during the intro (0:00–0:09.903), the outro guitar (1:41.094–1:46.534), and the fade. Stem on-fraction is 0.584 (master 0.581). The long "Hearing everything" cues almost certainly include a held word plus instrumental tag, as on the master.

A mid-band harmonic VAD was run as a check. Confidence is only medium: acoustic guitar still lives in the same bands. Use the SRT and the stem, not the VAD, when scoring.

The only true low-energy gap is the final fade (about 1:47.6–1:48.69, −84.7 dBFS in the last second). There is a 150 ms dip at 0:29.15–0:29.30, just before chorus 1; it is not a musical silence. There is no mid-song silent break.

### Loudness

ITU-R BS.1770 via `ffmpeg ebur128=peak=true`, confidence **high**.

| | This file | Master |
|---|---|---|
| Integrated | **−15.8 LUFS** | −15.3 LUFS |
| Loudness range | **3.2 LU** (low −17.3, high −14.1) | 4.8 LU |
| True peak | **−2.0 dBFS** (no clipping) | −3.1 dBFS |
| Sample peak | −2.0 dBFS | −3.1 dBFS |
| Overall RMS | −17.9 dBFS | −17.3 dBFS |
| Side/mid energy | 0.028 (very narrow, even more centred than the master) | 0.087 |
| Loudest 1 s | 1:10–1:11, −14.7 dBFS (late verse 2) | 1:32–1:33, −14.5 dBFS |
| Quietest 1 s | last 0.7 s, −84.7 dBFS (fade) | last 0.4 s, −74.6 dBFS |

The mix is a little quieter, tighter, and more mono than the master, with a hotter true peak. These are unintended mix differences, not a tempo change.

## Fox Ears readings vs this file's ground truth

Both runs used default sensitivity 0.58 on the 48 kHz WAV. The pre-tuning run is the v4 app at the `test-song/baseline-master` code (e82dd07). The pass-1 run is the `tuning/pass-1` code (7daf724). Scoring uses the same rule as the 14-song baseline: tempo is a hit within ±4% (octave and 3:2 forgiven); key must match exactly. **The answer key is 96.564 BPM and G major, not 108.**

| | Ground truth | App default, before tuning | Tuning pass 1 | Verdict |
|---|---|---|---|---|
| Tempo | 96.564 BPM | **90 BPM**, confidence 0.11, "unresolved metrical level" (candidates 180 / 90; autocorrelation suggests 120). Old 60 Hz proposal: **98 BPM**, confidence 0.46 | **96 BPM**, confidence 0.66, two-method sub-grid; rival 192 BPM at 42% | Before: **miss** (6.80% low), same miss as on the master. Pass 1: **hit** (−0.58%). It reports 96, not 108. Ratio to its own master reading is **1.00**, not 1.125 — the correct answer, because the audio did not change. |
| Key | G major | **D major (0.87)**, chroma marked reliable | **D major (0.84)**, "D vs G unresolved; kept the profile winner" | Before: miss, same intro-dominant trap as the master. Pass 1: **miss, and a false difference.** On the master, pass 1 correctly said G major (0.86) with "G over D confirmed". |
| Sections | 6 (intro, 2 verses, 2 choruses, outro) | **2** | **10**. Cuts at 9.7, 19.7, 29.7, 43.5, 54.7, 64.7, 74.7, 88.5, 99.1 s. Nearest-cut error vs lyrics 0.18 / 0.41 / 0.04 / 0.39 / 0.73 s; vs bars 0.33 / 0.21 / 0.07 / 0.05 / 0.43 s | Before: miss. Pass 1: **partial.** The five true boundaries are found, but three new mid-section cuts appear (mid verse 1, mid chorus 1, mid chorus 2) on top of the mid-verse-2 cut already seen on the master. Count goes 6 truth / 7 master reading / 10 here. The intro is labelled "verse A". |
| Vocal | solo vocal through five sections; stem on-fraction 0.584 | `vocal_gate` 2.7%, **0 vocal notes** | mask 46.2%, 33 regions, 3 vocal notes; vs stem **P 0.87 / R 0.70**; vs SRT spans P 0.95 / R 0.52 | Before: miss. Pass 1: **hit**, close to the master (P 0.92 / R 0.72). It still hears the vocal; it does not invent a "vocals vanished" change. |
| Other | — | 26 chords, 126 notes, range E2–F6, 152 objects, 281 conflicts, 1.2% silent frames | same object/conflict counts; `vocal_gate` 48.4%; silent frames 1.2% | Silent-frame rate matches the final fade. |

### Did Fox Ears detect the change, and only the change?

**No, because there was no tempo change to detect.** The honest test on this file is whether it stayed at 96 and left key, form and vocal alone.

- **Tempo:** pass 1 kept 96 BPM and did not invent a 108 reading. That is the correct behaviour.
- **Key:** it reported a change that is not there (G major on the master → D major here).
- **Sections:** it reported a change that is not there (7 → 10 sections, with new mid-phrase cuts). Timestamps were not scaled, which is correct, because tempo did not scale.
- **Vocal:** it kept hearing the vocal, with only a small P/R dip. No false vocal-off report.

So it caught the *absence* of a tempo change cleanly, and then added two false differences of its own.

### New tuning issues this take exposes

1. **The tonic-vs-dominant key check is unstable.** Two same-key, same-form Suno renders of the same song, both with a D-major intro vamp, flip the winner: "G over D confirmed" on the master, "D vs G unresolved; kept the profile winner" here. The intro still traps the profile, and the tie-break does not always save it.
2. **The section splitter over-segments more on this take** (10 vs 7 vs 6 truth), inventing mid-phrase cuts in both verses and both choruses. Role labels also start wrong ("verse" for the intro).
3. **This file is not a valid 108 BPM test.** We still need either a Suno render that actually sits at 108, or a controlled time-stretch of the master to 108 BPM, before we can say whether Fox Ears tracks a real tempo change and only that change.

## Unintended differences vs the master (complete list)

These are differences in the *audio*, independent of Fox Ears:

1. Tempo did not change (96.564 vs 96.006, ratio 1.006, not 1.125).
2. Duration stayed 108.680 s instead of shrinking to about 96.4 s.
3. Lyric and section times are essentially the same, not scaled.
4. Beat grid is less stable (IBI CV 4.72% vs 1.54%); first beat at 0.116 s vs 1.045 s.
5. Loudness: −15.8 vs −15.3 LUFS; LRA 3.2 vs 4.8 LU; true peak −2.0 vs −3.1 dBFS; RMS −17.9 vs −17.3 dBFS.
6. Stereo is narrower (side/mid 0.028 vs 0.087).
7. Structural novelty is busier and less aligned to the lyric boundaries.
8. New Suno id and a slightly lower Opus bitrate (127 vs 134 kb/s). Same lyrics and the same 6-section form.

## Research runtime

Not run on this file, and it should not be forced. Same reason as the master: the research runtime only accepts synthetic cue trials, not audio. Nothing in `research/` was touched.

## Commands used

Working copies lived at `/workspace/fox-ears/test-song/variants/v1-108bpm/`. Python is the existing Fox Ears venv (librosa 1.0.1, soundfile 0.14.0, numpy 2.5.4). The pre-tuning harness is the v4 copy at `/workspace/fox-ears/v4`. The pass-1 harness is `/workspace/fox-ears-repo/app` at commit 7daf724. Vocal-stem truth used demucs 4 (`htdemucs`, two-stem) from `/workspace/fox-ears/.venv-sep`; the stem audio is not committed.

```bash
# copy and hash
cp -n "$ATTACHMENT" /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.m4a
sha256sum /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.m4a

# inspect, including the timed lyric stream
ffprobe -v error -show_entries format=duration,size,bit_rate,format_name:stream=codec_name,sample_rate,channels,channel_layout,duration -of json \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.m4a
ffmpeg -y -i /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.m4a -map 0:s:0 \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.srt

# decode to WAV (native 48 kHz, pcm_s16le) and hash
ffmpeg -y -i /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.m4a -acodec pcm_s16le \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.wav

# loudness, ITU-R BS.1770, with true peak
ffmpeg -i /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.wav -af ebur128=peak=true -f null -

# independent tempo, key, sections, vocals, RMS (librosa; same methods as analyze_master.py)
/workspace/fox-ears/.venv/bin/python /workspace/fox-ears/test-song/analyze_v1_108bpm.py

# vocal stem (local only, not committed)
/workspace/fox-ears/.venv-sep/bin/demucs --two-stems vocals -o /workspace/fox-ears/test-song/variants/v1-108bpm/stems \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.wav

# pre-tuning default
cd /workspace/fox-ears/v4
node calibration/run.mjs --sens 0.58 --json /workspace/fox-ears/test-song/variants/v1-108bpm/fox-ears-harness-before.json \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.wav

# tuning pass 1, scored against this file's measured truth
cd /workspace/fox-ears-repo/app
node calibration/run.mjs --sens 0.58 \
  --json /workspace/fox-ears/test-song/variants/v1-108bpm/fox-ears-harness-pass1.json \
  --truth /workspace/fox-ears/test-song/variants/v1-108bpm/scoring-truth-v1-108bpm.json fox-at-the-gate-v1-108bpm.wav \
  /workspace/fox-ears/test-song/variants/v1-108bpm/fox-at-the-gate-v1-108bpm.wav
```

Audio extensions were already in the repo `.gitignore`. No audio was committed. The Cal 003 key and the research runtime were not touched.
