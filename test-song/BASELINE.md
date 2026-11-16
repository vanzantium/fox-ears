# Fox at the Gate — master v1 baseline

Measured 14 November 2026, 2:35 PM America/Dawson_Creek, from the first Suno render Taylor sent as the main master. Audio stays in Drive, not in this repo.

Drive copy: [Fox at the Gate - master v1.m4a](https://drive.google.com/file/d/1DUBmrl13EM-MNAP7Ldg9f5cJgSALYMSE/view)

Companion numbers: [`results/ground-truth-master.json`](results/ground-truth-master.json), [`results/fox-ears-harness-master.json`](results/fox-ears-harness-master.json), [`results/beat-grid-master.json`](results/beat-grid-master.json), and the timed lyrics as [`results/fox-at-the-gate-master.srt`](results/fox-at-the-gate-master.srt).

## File

| | |
|---|---|
| Title | Fox at the Gate — master v1 |
| m4a sha256 | `b1eb4a8532574afcdfee1c70ea6a7ef608fc1f8c0b3be82db23e3b9a18ecdeed` |
| wav sha256 | `19671e056afbc0e0322220ca38965ee1d50c0cd0e8aa43c0e134d71adcd34e8f` |
| m4a size | 1,859,770 bytes |
| Container | MPEG-4 (`isom`/`iso2`/`mp41`), audio codec **Opus** at 134 kb/s |
| Sample rate / channels | 48 kHz, stereo |
| Duration | **108.400 s** (m4a tag); WAV decode is 108.414 s (13.5 ms of decoder padding) |
| Embedded metadata | Full lyrics; timed subtitle stream; comment `made with suno; created=2026-11-14T21:30:22Z; id=8a932f9b-f9ba-4254-98ad-9683cdce680b` |
| Suno created | 14 November 2026, 2:30 PM America/Dawson_Creek (`2026-11-14T21:30:22Z`) |
| Suno id | `8a932f9b-f9ba-4254-98ad-9683cdce680b` |

The WAV is a local decode only (`ffmpeg -acodec pcm_s16le`, native 48 kHz) and is not uploaded or committed.

## Requested vs measured

What we asked Suno for: indie folk pop, **96 BPM**, **G major**, 4/4, acoustic guitar, light kick and snare, warm bass, clear solo male vocal. Structure: 4-bar intro, verse 1, chorus, verse 2, chorus, outro (guitar, 4 bars).

| | Requested | Measured | Drift | Confidence |
|---|---|---|---|---|
| Tempo | 96 BPM | **96.006 BPM** (mean inter-beat interval); librosa's tempo bin is 95.703 BPM | **+0.006 BPM** (+0.01%) | **high** |
| Key | G major | **G major** (7 of 8 methods); intro alone is D major | none overall; intro is on the dominant | **high** |
| Meter | 4/4 | Stable 4/4 beat grid, 166 beats, IBI CV 1.54%, local tempo 95.28–96.62 BPM | none | **high** |
| Structure | 4-bar intro, V, C, V, C, 4-bar outro | 4-bar intro, 8-bar verse, 10-bar chorus (8+2-bar tag), 8-bar verse, 10-bar chorus, ~3.45-bar outro then fade | choruses are 2 bars long; outro is short of 4 bars | **high** |
| Vocal | solo male vocal from verse 1 | Timed lyrics plus a clearly mixed centred vocal; see vocal section | — | **high** for *when* lines are sung (SRT); **medium** for automatic VAD |

Suno barely drifted on the two things we most needed to lock: tempo and key. The arrangement drift is in form, not in tuning or pulse.

### Tempo methods

All four independent librosa estimates land on the same 95.703 BPM bin (the analyser cannot resolve 96.006 exactly). The beat grid is the finer measurement:

- `librosa.feature.tempo`: 95.703
- `librosa.beat.beat_track` (default and with a 96 BPM prior): 95.703, identical 166-beat grid
- Tempogram peak: 95.703 (next peaks are the half-time 47.85 and a 198.77 harmonic)
- Mean inter-beat interval: **96.006 BPM**, std 1.483 BPM, CV 0.0154

The first tracked beat is at 1.045 s. Counting two beat-periods back puts the first downbeat 0.205 s before the file starts, after which every later section downbeat lines up with the lyric cues. The track begins just after a downbeat.

### Key methods

Krumhansl–Kessler and Temperley templates against chroma CQT, STFT, CENS, and a harmonic-only CQT all vote **G major**. The one dissenting window is the first 20 seconds, which votes D major because the intro itself is a D-major (dominant) vamp. After the intro, G major is unambiguous (harmonic CQT *r* = 0.93, runner-up D major). Chroma mass sits on G, D, and A — I, V, and II of G major.

Treat the intro's D-major colour as a real arrangement choice, not as Suno being in the wrong key.

## Section timestamps

Two aligned readings. **Lyric times** come from the timed subtitle track muxed into the m4a (section labels in that track are zero-duration and stamped at the first lyric of the next section, so Intro is inferred as 0 to the first verse line). **Musical bars** use the 96.006 BPM grid and the estimated first downbeat at −0.205 s. Chorus lyric tags start about 0.37 s early: "Hold still, hold still" is a one-beat pickup.

| Section | Lyric times | Musical bars | Bars | Notes |
|---|---|---|---|---|
| Intro (guitar) | 0:00.000 – 0:09.879 | 0:00.000 – 0:09.794 | 4 | Requested 4 bars. Lands almost exactly. In D major. |
| Verse 1 | 0:09.879 – 0:29.425 | 0:09.794 – 0:29.793 | 8 | Four sung lines. Novelty peak at 9.752 s. |
| Chorus 1 | 0:29.425 – 0:54.873 | 0:29.793 – 0:54.792 | 10 | 8-bar chorus plus a 2-bar tag. "Hearing everything" is held from 0:46.928 to 0:54.873. |
| Verse 2 | 0:54.873 – 1:14.392 | 0:54.792 – 1:14.790 | 8 | Four sung lines, same length as verse 1. |
| Chorus 2 | 1:14.392 – 1:39.878 | 1:14.790 – 1:39.789 | 10 | Same 8+2 shape as chorus 1. |
| Outro | 1:39.878 – 1:48.400 | 1:39.789 – 1:48.414 | ~3.45 | Last "Fox at the gate" 1:39.878–1:41.196; guitar 1:41.196–1:46.636; fade to silence. Not a clean 4 bars. |

A structural-novelty check on chroma-CENS recurrence agrees at the verse 1 and chorus 1 boundaries (peaks at 9.752 s and 30.070 s). Later boundaries are still clear in the lyric and bar grid, just less sharp in the recurrence matrix.

### Vocal on and off

Primary source (high confidence): the timed lyric lines. Vocal is on in the verse and chorus spans above, with the last sung line in the outro at 1:39.878–1:41.196. Vocal is off during the intro (0:00–0:09.879), the outro guitar (1:41.196–1:46.636), and the fade (1:46.636–1:48.414). The long "Hearing everything" cues (0:46.928–0:54.873 and 1:31.902–1:39.878) almost certainly include a held word plus instrumental tag, not eight seconds of continuous singing.

A mid-band harmonic VAD was run as a check. Confidence is only medium: acoustic guitar lives in the same bands, so the intro is full of false positives, and the choruses look under-detected. Use the SRT, not the VAD, when scoring later variants.

The only true low-energy gap in the master is the final fade (about 1:47.55–1:48.40, −74 dBFS in the last second). There is no silence before chorus 2.

### Loudness

ITU-R BS.1770 via `ffmpeg ebur128=peak=true`, confidence **high**.

| | |
|---|---|
| Integrated | **−15.3 LUFS** |
| Loudness range | **4.8 LU** (low −18.6, high −13.8) — tight, even |
| True peak | **−3.1 dBFS** (no clipping) |
| Sample peak | −3.1 dBFS |
| Overall RMS | −17.3 dBFS |
| Side/mid energy | 0.087 (narrow, vocal-centred stereo) |
| Loudest 1 s | 1:32–1:33, −14.5 dBFS (late chorus 2 tag) |
| Quietest 1 s | last 0.4 s, −74.6 dBFS (fade) |

Energy lifts where the voice enters (0:09–0:10 jumps from about −24 to −16 dBFS) and at each chorus downbeat.

## Fox Ears readings vs ground truth

The v4 app pipeline was run through the 14 November 2026 calibration harness at default sensitivity 0.58, on the 48 kHz WAV. The same run also reports the harness-only 60 Hz sub-grid tempo proposal from that day (not in the app itself). Scoring uses the same rule as the 14-song baseline: tempo is a hit within ±4% (octave and 3:2 forgiven); key must match exactly.

| | Ground truth | App default (80 ms frames) | 60 Hz sub-grid proposal | Verdict |
|---|---|---|---|---|
| Tempo | 96.006 BPM | **90 BPM**, confidence 0.11, "unresolved metrical level" (candidates 180 / 90; autocorrelation suggests 60) | **94 BPM**, confidence 0.52, two-method agreement | Default **miss** (6.3% low). Sub-grid **hit** under the ±4% rule (2.1% low, and much more confident). |
| Key | G major | **D major (0.88)**, chroma marked reliable | — | **Miss.** It locked onto the intro's dominant, the same trap as a first-20-seconds window. |
| Sections | 6 (intro, 2 verses, 2 choruses, outro) | **2** (harness reports a count only, no timestamps) | — | Miss. |
| Vocal notes | a full solo vocal through five sections | `vocal_gate` 4.1%, **0 vocal notes**, `vocal_range` none | — | Miss. Pitch is voiced on 71.6% of frames (guitar plus voice), but the vocal gate almost never opens. |
| Other | — | 24 chords, 142 notes, range D♯2–F5, 161 sound objects, 291 binding conflicts, 0.8% silent frames | 313 adaptive onsets | Silent-frame rate matches the final fade. |

Default onset-gate sweep never finds 96 BPM either: gates 0.10 and 0.14 report 120 BPM, gates 0.18–0.30 report 90 BPM. The 80 ms frame clock is still the weak point.

### Research runtime

Not run on this file, and it should not be forced. `research/fox_ears_v0_2_binding_grammar.py` only accepts synthetic `EarFrame` trials (Calibration 003 style). It has no audio decoder and no file input, only `--test` and `--outdir`. `research/music_mode.py` is a scaffold that expects pre-extracted features and an `OrganismRuntime` that is not in this repo. When the 2-beat silence variant arrives, that is the right time to *hand-build* a cue sequence that reproduces the known silent-gap misread — still without pretending the runtime can ingest the WAV.

## What the five variants should change

Score each variant against this baseline, not against the original 96 / G prompt. Measure what Suno actually emits, the same way as here.

1. **Faster (108 BPM).** Ground-truth tempo should move from 96.006 to about 108 (a 12.5% lift). If the arrangement is otherwise identical, duration would shrink to roughly 96 s. The default app already confuses 90 / 120 / 180 on a steady 96; this variant tests whether the sub-grid reading moves with the true tempo (it should go to ~108, not stay at 94 or jump to 120).

2. **New key (A major).** Ground-truth key should move from G major to A major. The intro here is a D-major dominant vamp; an A-major render may well open on E major. Fox Ears just called this G-major master D major, so the risk is that it will call the A-major variant E major. Watch the runner-up, and check whether the intro is again on the dominant.

3. **Instrumental (no vocals).** Timed-lyric vocal regions should go empty, and the mid-band VAD should quiet down (allowing for guitar false positives). **Warning:** the app already reports 0 vocal notes and only 4.1% `vocal_gate` on this *with-vocal* master, so a contrast may not show up until the vocal gate is fixed. Still run it; a drop in voiced frames or in mid-band energy during the old verse/chorus spans would be a useful secondary signal.

4. **Harmony (female chorus harmony).** The change should be confined to chorus 1 (0:29.4–0:54.9) and chorus 2 (1:14.4–1:39.9): a second voice, not a new key or tempo. The app currently extracts 0 vocal notes on the solo take, so it may not hear a second voice either. This is also the variant that would most want a future research-runtime path (split vs one-history binding), once one exists for real audio.

5. **Silent break (2 beats before the last chorus).** At 96.006 BPM, two beats are **1.250 s**. The gap belongs just before musical chorus 2, i.e. about **1:13.54–1:14.79**, replacing what is now continuous energy at −16.7 dBFS. The master has no mid-song silence at all, so a new low-energy region of ~1.25 s is the thing to detect. This is the live-audio version of the known v0.2 bug (a silent gap misread as a spectral break). The app should also show a rise in silent frames and, ideally, a section or object boundary at the gap.

Do not change more than one of these at a time. If Suno drifts on an unasked axis (tempo drifting on the A-major take, for example), measure that drift and say so before scoring.

## Commands used

Working copies lived at `/workspace/fox-ears/test-song/master/`. Python is the existing Fox Ears venv (librosa 1.0.1, soundfile 0.14.0, numpy 2.5.4). The harness is the copy already in the v4 app at `/workspace/fox-ears/v4`.

```bash
# copy and hash
cp -n "$ATTACHMENT" /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a
sha256sum /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a

# inspect, including the timed lyric stream
ffprobe -v error -show_entries format=duration,size,bit_rate,format_name:stream=codec_name,sample_rate,channels,channel_layout,duration -of json \
  /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a
ffprobe -v error -show_entries format_tags -of json \
  /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a
ffmpeg -y -i /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a -map 0:s:0 \
  /workspace/fox-ears/test-song/results/fox-at-the-gate-master.srt

# decode to WAV (native 48 kHz, pcm_s16le) and hash
ffmpeg -y -i /workspace/fox-ears/test-song/master/fox-at-the-gate-master.m4a -acodec pcm_s16le \
  /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav
sha256sum /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav
ffprobe -v error -show_entries format=duration,size:stream=codec_name,sample_rate,channels -of json \
  /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav

# loudness, ITU-R BS.1770, with true peak
ffmpeg -i /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav -af ebur128=peak=true -f null -

# independent tempo, key, sections, vocals, RMS (librosa; see analyze_master.py on the box)
/workspace/fox-ears/.venv/bin/python /workspace/fox-ears/test-song/analyze_master.py

# fox-ears v4 harness, default sensitivity 0.58, plus the 60 Hz sub-grid proposal
cd /workspace/fox-ears/v4
node calibration/run.mjs --json /workspace/fox-ears/test-song/results/fox-ears-harness-master.json \
  /workspace/fox-ears/test-song/master/fox-at-the-gate-master.wav
```

Audio extensions were already in the repo `.gitignore`. No audio was committed.
