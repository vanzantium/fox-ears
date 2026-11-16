# Fox Ears sealed blind readings — Taylor solo, 2026-11-16

**SOFT.** Sealed before Taylor's BPM / lyrics answer key. Nothing here is SOLID.

Taylor recorded two songs with just his voice, guitar, and a backing metronome, and held the answers back on purpose. These are the readings from the current Fox Ears P0 engine (headless Node harness, 60 Hz, sensitivity 0.58 — the same path as PR #5) plus the research-side open-source tools from the PR #6 bakeoff (Demucs `htdemucs_6s`, torchcrepe, librosa, Essentia, madmom, and faster-whisper).

Audio is not in this repo. The two m4a files are identified below by sha256.

| Song | Duration | Original m4a sha256 |
| --- | --- | --- |
| **A** | 5:06.33 (306.33 s; container listed 5:06.36) | `0dbe52ee9a2049c6b36e719545e96e79e49ae62d5d838b19d81f205755d8c839` |
| **B** | 4:11.50 (251.50 s; container listed 4:11.54) | `2394f9ed79b74d52bdf01c801574d74c93470cceb67e34fe61da81a75a9398b8` |

Song A came from attachment `24bdd7d77507f78890ab8d313e3c2bcfc65bac35f12082861f56d8c13111192b.m4a`. Song B came from `3915eeda75f44043e50e40ca1c2ff184e183796e382d7debae38f7fda7d25453.m4a`. Both are AAC-LC stereo 48 kHz.

A machine-readable copy of every number below is in `BLIND-READINGS.json`. The sha256 of this markdown file is in `SEAL.txt`.

---

## Song A

### Tempo

**Metronome click: 80.00 BPM, 4/4, stable for the whole take. SOFT.**

The click is a tight 3.0000-second downbeat grid starting at t ≈ 0 (about 2 ms of encoder delay, not a musical offset). Demucs put those downbeats in the `drums` stem, which made them easy to measure: 79.9999 BPM, mean grid error 2.03 ms, first downbeat 0.0015 s, last 306.0027 s. Window BPM on those isolated downbeats stays 79.996–80.007. So the quarter-note metronome is 80.00, with a stronger accent every four beats.

Beat trackers that listen to the mix (guitar strums plus click) come in *higher* and do not sit on that grid:

| Tool | BPM | Notes |
| --- | --- | --- |
| **Click (drums stem)** | **80.00** | 2.03 ms mean error, stable |
| Fox Ears P0, 60 Hz | 84 (conf 0.32) | Rival 165.5 BPM at 87% — almost as strong |
| librosa (feature tempo + beat_track) | 166.709 | Double of ~83.35 |
| Essentia RhythmExtractor2013 | 164.16 (conf 1.47) | PercivalBpmEstimator: 83.35 |
| madmom RNN+DBN | median 83.333, mean 82.64 | 4/4; first beats start near the 80 grid then drift |

So: the metronome is 80.00; the mix-based tempo estimators are hearing the guitar and reporting ~83–84 or its double ~164–167. Fox Ears picked 84 with a very close rival at 165.5.

### Key and chords

**Key: E major. SOFT**, but the tools agree.

- Fox Ears: E major (0.93), chroma marked reliable
- Essentia KeyExtractor: E major (0.90), same in the first 15 s and after
- librosa vote: E major, 3 of 4 profiles (CQT Krumhansl–Kessler r = 0.87, high confidence). STFT Krumhansl is the odd one out (G♯ minor, low confidence).

Chords (madmom CNN+CRF, preferred for a readable timeline) live in the E-major family: **A major (28%)**, **E major (27%)**, C♯ minor, E minor, F♯ minor, G♯ minor. Essentia's frame counts say the same family, with E first (38%) then A, G♯m, C♯m. The take opens on E, moves to A around 7–12 s, and keeps cycling E / A with relative-minor colour.

### Sections (SOFT)

Voice enters at **24.38 s** (vocal-stem energy). Fox Ears' intro (0.0–24.8 s) matches that almost exactly. From there, section labels come from lyric repetition first, audio second. Librosa novelty over-cut (34 peaks); Essentia SBic under-cut (one boundary at 297 s).

| Time | Role | Why |
| --- | --- | --- |
| 0.0–24.4 | intro | guitar + metronome only |
| 24.4–62.5 | verse | opening lyric |
| 62.5–70.5 | pre-chorus | “show them what it means to be alive / Baby, you can thrive” |
| 71.1–88.9 | chorus | “Don't take it all on yourself…” |
| 91.5–112.5 | hook / post-chorus | “This is the show that you used to be…” |
| 112.5–124.5 | instrumental | lyric gap |
| 124.5–186.4 | verse | second verse; ASR weaker |
| 186.4–204.3 | chorus | same chorus, repeated |
| 208.4–220.5 | hook | hook repeat, partial wording |
| 220.5–301.4 | verse / outro vocal | later verse; wording shakier |
| 301.4–306.3 | outro | short instrumental tail |

Fox Ears drew 13 sections and labelled 41–70 s as a chorus; the repeated lyric actually starts at 71 s. Its intro and the late outro cut are the parts that line up best with the audio and the words.

### Vocal melody and stems

Demucs `htdemucs_6s` split is **clean in the intro** (vocal stem −57 dBFS for the first 15 s, guitar present at −24 dBFS) and usable after the voice enters. Guitar still leaks into the vocal stem at about −22 dBFS during sung frames. Bass, piano and “other” are empty. The metronome went into the drums stem.

torchcrepe on the vocal stem (periodicity ≥ 0.4), **SOFT**:

- Median **G♯3** (211 Hz)
- 5th–95th percentile **C3–G4** (19.4 semitones)
- Min–max E2–F5 is wider and probably includes false voicing; prefer C3–G4

Fox Ears kept 33 vocal-melody notes, range **G3–G♯4**, median **B3** — a tighter band around the same centre. Overall (voice+guitar) range was E2–A5.

### Lyrics (SOFT — automatic transcript, not a human listen)

faster-whisper `medium` on the vocal stem, CPU int8, beam 5, VAD, temperature 0. 43 segments, mean avg_logprob −0.32. First line starts at 24.5 s, in agreement with the energy onset. The mix transcript is a weaker second opinion and misses the later choruses.

**First lines (vocal stem):**

> They've been selling you a pair of seat / Can't you see? / Everything that you've been told was written by them when they were really evil / Every dream with a scene that they sold you as a debt / As a regret / They don't want to show you / You can dream a bigger dream / You can show them what it means to be alive / Baby, you can thrive

The opening line is disputed: the mix heard “selling you currency, can't you see?” and “written by the wind.” Both versions are uncertain. The first seven vocal segments were also flagged `high_no_speech` even though they are clearly sung.

**Chorus, heard twice (71.1 s and 186.4 s):**

> Don't take it all on yourself / You can go (second time: grow) faster than the wind / Don't put your heart into yourself

**Hook, heard twice (91.5 s and 208.4 s):**

> This is the show that you used to be

The middle verse (~124–186 s) and the last minute are the shakiest stretches (“Don't grow, baby,” “scared fears,” “let your down grow,” “It's crack now, it is the fill of time”). Two segments are unusually long (126–147 s and 244–259 s) and may cover a held note or a short guitar break. Full line-by-line timestamps are in the JSON.

---

## Song B

### Tempo

**Metronome click: 80.00 BPM, 4/4, stable for the whole take. SOFT.**

Same construction as Song A, even tighter: 80.0000 BPM, mean grid error **0.75 ms**, first downbeat 0.0015 s, last 249.0006 s, bar period 3.0000 s. Again isolated from the Demucs drums stem.

This time the mix-based tools agree with the click:

| Tool | BPM | Notes |
| --- | --- | --- |
| **Click (drums stem)** | **80.00** | 0.75 ms mean error, stable |
| Fox Ears P0, 60 Hz | 79.9 (conf 0.40) | Rival 160 BPM at 54% |
| librosa | 79.507 | IBI mean 79.86, cv 0.037 |
| Essentia RhythmExtractor2013 | 79.571 (conf 3.35) | Much more confident than on Song A. Percival jumped to 159.0 (double) |
| madmom RNN+DBN | median **80.0**, mean 79.59 | First eight beats: 0.02, 0.75, 1.50, 2.25, 3.00 — on the click grid. Downbeats every 3 s |

### Key and chords

**Key: UNRESOLVED between E minor and G major. SOFT.** They are relative keys.

- Fox Ears: E minor (0.75)
- librosa vote: E minor, 4 of 4, but CQT's runner-up is G major
- Essentia KeyExtractor: G major (0.87), same in the intro and after

Chords (madmom): **G major (25%)**, **E minor (21%)**, C major, E major, A major, D major. Essentia's frame counts put Em first (26%) then G, C, E, D. That palette fits either key. This stays unresolved until Taylor's key list.

### Sections (SOFT)

Voice enters at **27.68 s**. Fox Ears' intro (0.0–15.8 s) is too short.

| Time | Role | Why |
| --- | --- | --- |
| 0.0–27.8 | intro | guitar + metronome only |
| 27.8–51.5 | verse | “I can show you the game…” |
| 51.5–75.5 | chorus | “sell dreams / same old game / pull off your mask…” |
| 75.5–101.5 | hook | “You can die, but play it still…” |
| 101.5–115.5 | instrumental | lyric gap |
| 115.5–132.4 | verse | “You can try to escape…” |
| 132.4–141.0 | chorus | chorus repeat |
| 141.0–183.5 | instrumental (probable) | ASR stamped one chorus line across 42 s — treat as a break |
| 183.9–209.6 | verse | later verse; ASR weaker |
| 209.6–234.5 | hook | hook repeat |
| 234.5–251.5 | outro | vocal energy ends ~246 s |

### Vocal melody and stems

Intro mute is even cleaner than Song A (vocal stem −66 dBFS for the first 15 s). After the voice enters, the vocal stem is less dominant (only 14% of frames vocal-dominant); there is more guitar under the singing, and more guitar leakage into the vocal stem (−25 dBFS median during vocal-dominant frames). Metronome again landed in drums. Bass/other empty.

torchcrepe on the vocal stem, **SOFT**:

- Median **G♯3** (207 Hz)
- 5th–95th percentile **D♯3–A♯4** (19.2 semitones)
- Min–max D♯2–C♯5 is wider and probably includes false voicing; prefer D♯3–A♯4

Fox Ears only kept **7** vocal-melody notes, range G3–B3, median A3. That is too narrow next to torchcrepe. The engine is under-detecting the sung melody on this take. Overall (voice+guitar) range was E2–E6.

### Lyrics (SOFT — automatic transcript, not a human listen)

faster-whisper `medium` on the vocal stem. 23 segments, mean avg_logprob −0.27, no segments flagged. First line starts at 27.8 s, in agreement with the energy onset. The mix transcript collapsed to three low-confidence segments and is not a usable second text, though it does agree on the opening line.

**First lines (vocal stem):**

> I can show you the game, I can teach you the rules / You just do the same, learn to play with the rules / You can sing your own notes, you can make your own life / Get caught in your throat if you can't do the time / Where they sell dreams, and they're selling lies / It's the same old game in a new disguise / So pull off your mask, pull out your car / And just live your life like you've got a heart

**Chorus, heard twice (57.3 s and 132.4 s):**

> It's the same old game in a new disguise / So pull off your mask, pull out your car

“Pull out your car” may be a mishear.

**Hook, heard twice (75.5 s and 209.6 s):**

> You can die, but play it still / Might as well learn to kill, play the game

Wording on the hook is repeated clearly enough to report, but it may still be off.

A 42-second stamp at 141.0–183.5 s (“So pull off your mask…”) is almost certainly an instrumental stretch with a bad timestamp, not a held lyric. The late verse (183.9–209.6 s) is the weakest stretch and includes profanity in the ASR; it is reported as transcribed, not verified. Full line-by-line timestamps are in the JSON.

---

## Fox Ears vs the other tools (quick read)

- **Tempo.** On Song B, Fox Ears (79.9) is with the 80.00 click and with librosa / Essentia / madmom. On Song A, Fox Ears (84, with a 165.5 rival) is with the *guitar-based* estimators, not with the 80.00 click. The click is the thing to score against once Taylor confirms the metronome markings.
- **Key.** Song A is a clean E-major agreement, including Fox Ears at 0.93. Song B is the classic relative-key split (Fox Ears and librosa E minor, Essentia G major).
- **Sections.** Fox Ears nailed Song A's intro length (24.8 s vs voice at 24.4 s) and missed Song B's intro (15.8 s vs voice at 27.7 s). Chorus labels on A start earlier than the repeated lyric does.
- **Vocal melody.** Fox Ears' Song A range (G3–G♯4) is close to torchcrepe's central band. On Song B it only kept seven notes. Lead-guitar-as-voice is less of an issue here than on a full mix with a solo, but the silent intros show Fox Ears still marks a lot of overall voicing (80–85%) from the guitar.

## Method notes

- Fox Ears was run with `node calibration/run.mjs --tick-hz 60 --sens 0.58` on 44.1 kHz wav decodes of the two m4a files.
- Click BPM is a least-squares fit of 4/4 downbeats isolated from the Demucs `htdemucs_6s` drums stem, not a general beat tracker.
- Essentia is AGPL and was used only as an outside cross-check. madmom's model files are CC BY-NC-SA 4.0.
- Lyrics are faster-whisper `medium` (MIT) on CPU, int8, because openai-whisper `medium` was not reasonably fast on this machine (~30 minutes per song). Audio was loaded with soundfile/librosa to avoid a PyAV mismatch. The vocal stem is the primary transcript; the mix is a check only.
- No audio, stems, or raw frame dumps are in this commit.
