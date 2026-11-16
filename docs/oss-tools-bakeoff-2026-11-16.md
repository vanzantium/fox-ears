# OSS tools bakeoff for Fox Ears candidate measurements

**Date:** Monday 2026-11-16, about 1:03–1:39 AM MST (America/Dawson_Creek, UTC-7)
**Branch:** `research/oss-tools-bakeoff`, stacked on `p0/binding-timing-cleanup` (PR #5), which sits on #4, #3, #2 and #1. Leave this PR unmerged.
**Label:** every number in this note is **SOFT**. Taylor's BPM/key answer key and his own tab/MIDI files have not landed yet. Stand-in truth is the librosa + timed-lyric baseline already in `test-song/` (master 96.006 BPM, G major, D-major intro, 6 lyric sections, 108.4 s; stretch 108.007 BPM, same key and form, 96.37 s).

**What this is.** A bakeoff of public, installable open-source audio tools as *research-side candidate generators* for the shared measurement layer: tempo, key, section boundaries, vocal pitch/notes, and stem separation (especially whether a lead instrument can be kept out of the vocal candidate). Architecture rule, unchanged: **no second independent Python sensory engine in the app**. Feeling stays out of the shared engine. These tools may feed candidates into the research runtime; they are not a new ear inside the TypeScript app.

**What this is not.** This is not a reverse-engineer of BandLab, Cakewalk, or Sonos, and it does not call their undocumented APIs or use a BandLab login. The useful parts of those products for Fox Ears are already available as standalone open tools (stem separation, pitch-to-MIDI, key/BPM, chord tracking). We measured those.

Audio stays in Drive and in local scratch. Nothing from `cal003-key/` went into this repo or this note. Raw bakeoff JSON and the local runner scripts live on the box under `/workspace/fox-ears-bakeoff/` and are not committed (they point at local WAV paths).

---

## 1. Test material and Fox Ears P0 (SOFT)

| | Master v1 | 108 stretch (variant 1b) |
|---|---|---|
| File | Fox at the Gate — master v1, 48 kHz stereo WAV decode of Drive [1DUBmrl13EM-MNAP7Ldg9f5cJgSALYMSE](https://drive.google.com/file/d/1DUBmrl13EM-MNAP7Ldg9f5cJgSALYMSE/view) | rubberband time-stretch of that master, Drive WAV [1D7WvGeB-sHT7uTFV0yCLgkGifkYPvGyS](https://drive.google.com/file/d/1D7WvGeB-sHT7uTFV0yCLgkGifkYPvGyS/view) |
| Duration | 108.400 s (WAV decode 108.414 s) | 96.374 s |
| Stand-in tempo | **96.006 BPM** (mean inter-beat interval) | **108.007 BPM** (mean IBI; librosa's tempo bin is 107.666) |
| Stand-in key | **G major**; intro (0–9.879 s) is **D major** | Same, intro ends 8.782 s |
| Stand-in form | 6 sections, 5 interior lyric boundaries | Same, times scaled by 96.006/108 |
| Fox Ears P0 (60 Hz harness) | 96 BPM, conf 0.89, **G major**, **7 sections**, vocal P **0.92** R **0.72** | 108 BPM, conf 0.53 (rival 72 at 64%), **G major**, **8 sections**, vocal P **0.90** R **0.72** |

P0 numbers are from `docs/p0-log-2026-11-15.md`. Key and section counts on the stretch still move with analyser refresh rate (D major and 8–9 sections at 120 Hz). That bug is not addressed here.

Vocal P/R for the bakeoff tools is reported two ways, both SOFT: against the timed-lyric "vocal on" spans (SRT), and against the tighter Demucs 2-stem RMS regions already in `scoring-truth-*.json`. Those are not identical to the Fox Ears harness scorer, so treat comparisons to 0.92/0.72 as directional, not a head-to-head on the same frames.

---

## 2. Environment

- Box: 8-core Intel Xeon, 15 GiB RAM, **CPU only** (no GPU).
- Python: 3.13 system; 3.12, 3.11, 3.10 and 3.14 installed with `uv` as needed for wheels.
- Existing local tools reused: librosa 1.0.1 (`.venv`), demucs 4.1.0 + torch 2.15 CPU (`.venv-sep`).
- New venvs, all outside the repo: Essentia on CPython 3.14; madmom 0.17.dev0 from git on 3.10; Basic Pitch 0.4.0 + CREPE 0.0.16 + TensorFlow 2.14 on 3.11 with `numpy==1.26.4` and `setuptools<82`.
- Demucs segment length had to be **7 s**, not 8: htdemucs refuses a segment longer than 7.8 s.

---

## 3. Results at a glance (SOFT)

Tempo and key are the clean wins. Automatic sections are not. Vocal pitch/notes get much better once a Demucs vocal stem is the input, and on this song the intro guitar does **not** leak into the vocal stem.

### Tempo (BPM)

| Tool | Master | Stretch | Error vs stand-in (master / stretch) | CPU time (master, this box) |
|---|---:|---:|---|---:|
| Stand-in (librosa mean IBI) | **96.006** | **108.007** | — | — |
| librosa `feature.tempo` / tempogram / beat_track bin | 95.703 | 107.666 | bin quantization, same as the 2026-11-14 baseline | 9.1 s (with beats) |
| librosa mean IBI (prior at target) | 96.006 | 108.007 | 0 / 0 (defines the stand-in) | included above |
| Essentia RhythmExtractor2013 (multifeature) | 96.116 | 107.873 | +0.110 / −0.134 | 1.1 s |
| Essentia PercivalBpmEstimator | 95.703 | 108.230 | −0.303 / +0.223 | 0.4 s |
| madmom RNN+DBN beats, mean IBI | 95.871 | 107.608 | −0.135 / −0.399 | 10.1 s (beats only) |
| Fox Ears P0, 60 Hz | 96 | 108 | correct integer; stretch confidence 0.53 with a 72 BPM rival | (harness) |

All of the research tools land inside about 0.4 BPM of the stand-in. Essentia RhythmExtractor2013 is the tightest *independent* estimate (librosa IBI is not independent of the stand-in). madmom is close and also returns a stable 4/4 downbeat grid (42 downbeats; first downbeat 2.28 s on the master, which matches the baseline's "first downbeat just after a missing one at −0.205 s").

### Key

| Tool | Master whole | Master intro ~10 s | Stretch whole | Stretch intro | Notes |
|---|---|---|---|---|---|
| Stand-in | G major | D major | G major | D major | |
| librosa KK + Temperley, 6 whole-track votes | **G major** (6/6) | **D major** | **G major** (6/6) | **D major** | Same method as the baseline |
| Essentia KeyExtractor | **G major** (strength 0.94) | **D major** (0.80) | **G major** (0.94) | **D major** (0.88) | Best single-call key tool in the set |
| Essentia TonalExtractor `key` | G major (0.85) | — | G major (0.85) | — | `chords_key` votes **D major** (V of G plus the intro) |
| madmom CNN+CRF chords | G:maj and D:maj dominate | G:maj / D:maj alternation | same body | mixed G/C/D | Plausible I–V–vi–IV palette; not a single key label |
| Fox Ears P0, 60 Hz | G major | (no intro split in the P0 table) | G major | — | Stretch flips to **D major** at 120 Hz (known P0 issue) |

### Sections / boundaries

Stand-in form is 6 sections, 5 interior lyric boundaries. Fox Ears P0 reports **7** (master) and **8** (stretch). None of the bakeoff segmenters beat that, and most are worse.

| Tool | Master interior bounds | Hits at 2 s vs 5 lyric bounds | Stretch |
|---|---|---|---|
| Fox Ears P0 | 7 sections | (over-segments by 1) | 8 sections |
| librosa chroma-CENS novelty peaks | **22** peaks | 4/5 hit, but precision 0.18 (many extras); outro 99.9 s missed | 19 peaks, 3/5, misses intro and outro |
| librosa agglomerative, k=6 | 5 interiors | 2/5 | 2/5 |
| librosa agglomerative, k=9 | 8 interiors | 3/5 | 3/5 |
| Essentia SBic on MFCC (default-ish) | **0** interiors (one whole-song segment) | 0/5 | 0/5 |
| madmom | bar grid only (not sections) | n/a | n/a |

Novelty *does* see the verse-1 and chorus-1 changes (peaks at 9.75 s and 30.07 s on the master, as in the baseline), then keeps firing inside phrases. Automatic form is still an open problem. Do not take a "sections" number from these tools as truth.

### Vocal pitch / notes (Demucs vocal stem unless noted)

Fox Ears P0 vocal P/R: master 0.92 / 0.72, stretch 0.90 / 0.72.

| Tool, input, threshold | Master vs SRT P/R | Master vs stem-RMS P/R | Intro voiced/active fraction (stem) | Median F0 / MIDI | CPU (one file, this box) |
|---|---|---|---:|---|---:|
| librosa pYIN on **mix** | 0.82 / 0.60 | 0.57 / 0.61 | **0.69** (guitar) | **83 Hz** (wrong, guitar range) | 6.1 s |
| librosa pYIN on **vocal stem** | **0.94 / 0.62** | 0.71 / 0.68 | 0.26 | **197 Hz** (G3-ish, voice) | 4.4 s |
| torchcrepe full, mix, thr 0.3 | 0.82 / 0.58 | 0.61 / 0.62 | 0.67 | **220 Hz** (finds the voice even in the mix) | 90 s |
| torchcrepe full, stem, thr 0.3 | **0.93 / 0.68** | 0.74 / 0.79 | 0.35 | 223 Hz (A3) | 87 s |
| torchcrepe full, stem, thr 0.5 | 0.95 / 0.56 | 0.79 / 0.68 | 0.19 | 224 Hz | included |
| Basic Pitch notes on **mix** | 0.85 / 0.95 | 0.58 / 0.94 | intro active **0.96**, 90 notes in the intro | median MIDI 55 (G3), 1089 notes (polyphony: guitar+bass+voice) | 2.9 s inference |
| Basic Pitch notes on **vocal stem** | 0.91 / 0.55 | **0.88 / 0.76** | intro active 0.34, only 16 intro notes | median MIDI 59 (B3), 373 notes | 2.1 s |
| CREPE full+viterbi, **mix**, thr 0.5 | 0.81 / 0.58 | 0.59 / 0.62 | intro 0.77 | 217 Hz | 238 s |
| CREPE full+viterbi, **stem**, thr 0.5 | **0.92 / 0.62** | 0.76 / 0.74 | 0.24 | 222 Hz | 223 s |

Stretch figures tell the same story (pYIN on the new 2-stem vocals: vs SRT 0.96 / 0.61, intro voiced 0.25, median 197 Hz). On the mix, pYIN latches onto the guitar; torchcrepe latches onto the voice. Once the input is a Demucs vocal stem, pYIN, torchcrepe and Basic Pitch all become usable vocal candidates. Basic Pitch on the mix is a *polyphonic transcription*, not a vocal detector — which is what we want later against Taylor's tab files, not for "is the voice on."

---

## 4. Demucs stems and the centered-lead-as-vocal question (SOFT)

Models run: `htdemucs` 4-stem (drums, bass, other, vocals), `htdemucs` 2-stem (vocals / no_vocals; master already existed from 2026-11-14), and `htdemucs_6s` (adds **guitar** and piano). All on CPU, `--segment 7 -j 1`.

| Job | Wall time | Peak RSS (Linux `ru_maxrss`) |
|---|---:|---:|
| master 4-stem | 34.0 s | 1.61 GiB |
| stretch 4-stem | 32.1 s | 1.56 GiB |
| master 6-stem | 32.7 s | 1.84 GiB |
| stretch 6-stem | 27.9 s | 1.80 GiB |
| stretch 2-stem | 33.6 s | 1.56 GiB |

Intro vs verse energy, master (RMS dBFS; stretch is the same pattern):

| Stem | Intro (guitar vamp, no lyric) | Verse 1 | Intro − verse |
|---|---:|---:|---:|
| 2-stem / 4-stem / 6-stem **vocals** | **−78.5 to −79.7** | −21.8 | about **−57 dB** |
| 4-stem **other** | −22.9 | −25.6 | (the guitar lives here) |
| 6-stem **guitar** | −22.9 | −25.5 | (the guitar lives here) |
| 6-stem piano / other | below −90 | below −87 | empty, as they should be |

The vocals stem is effectively silent in the intro (well under the −40 dBFS "on" threshold used in the scoring truth). The intro guitar is cleanly routed to `other` (4-stem) or `guitar` (6-stem), about 55 dB hotter than vocals in that window.

**So on this song, Demucs already fixes the "centered guitar marked as vocal" failure mode for the intro vamp.** We did *not* reproduce a mid-song lead-guitar-as-voice error here: Fox at the Gate does not have a mixed-center guitar solo sitting in the vocal band the way some of the 14 calibration songs do. The result still matters: `htdemucs_6s` gives Fox Ears a **guitar candidate** and a **vocal candidate** that we can score separately, which is the right hook for that regression once Taylor's classic-solo tabs and the 14-song set are run through the same pipeline.

License: **MIT**. Research-side only (Python + PyTorch, ~30 s and ~2 GiB per track on this CPU). Do not put Demucs inside the browser app.

---

## 5. Per-tool notes

### librosa 1.0.1 — ISC (permissive)

Already the research baseline. Re-run confirmed the published stand-in: IBI 96.006 / 108.007, unanimous G major, D-major intro. Section novelty over-segments; agglomerative under-helps. pYIN is a solid monophonic pitch tracker **on a vocal stem** and a poor one on this mix (median 83 Hz). Fast. Fine to keep as the default research measurement and as the source of any key/tempo idea we later port to TypeScript. Safe license for the research repo and, if reimplemented, for the app.

### Essentia 2.1-beta6-dev (2.1b6.dev1438) — AGPL-3.0

Install: no cp312/cp313 manylinux wheels on PyPI at the time of this run. A **cp314** wheel installed cleanly in a CPython 3.14 venv. KeyExtractor is the star: G major vs D-major intro, high strength, a few hundred milliseconds. RhythmExtractor2013 is a close independent tempo. TonalExtractor / ChordsDetection give a useful I / IV / V / vi vocabulary (G, D, C, Bm) but `chords_key` says D major, and beat-synchronous first chords are jittery. SBic did not segment this song at all with the MFCC settings used here.

**License verdict:** AGPL is a strong copyleft. Essentia may be used as an *external* research comparator. It must not be imported into the Fox Ears app, bundled into a distributed binary, or exposed as a network service without AGPL compliance (source offer to users of that service). Linking it from tracked research modules in this repo would also put copyleft pressure on those modules. Keep it in a separate venv and treat outputs as candidate numbers, not as a new engine.

### madmom 0.17.dev0 (git `@27f032e`) — BSD-3-Clause code, **CC BY-NC-SA 4.0 models**

PyPI 0.16.1 does not import on Python 3.10+ (`collections.MutableSequence`). The git tree built with Cython after pinning `setuptools<82` (for `pkg_resources`). Beats and downbeats are good; 4/4 is inferred correctly; chord sequences look more musical than Essentia's beat chords (intro alternates G:maj and D:maj; body is G, D, Em, C). No section detector.

**License verdict:** the weights that make beat/downbeat/chord tracking work are **non-commercial (CC BY-NC-SA 4.0)**. Do not ship the models in the app, and do not use them in anything that could become a commercial product without a separate arrangement with the authors. Fine as a private, non-commercial research comparison only.

### Demucs 4.1.0 (`htdemucs`, `htdemucs_6s`) — MIT

See §4. The 6-stem guitar output is the new candidate we did not have before. Two-stem vocals is already what the scoring truth used; 4-stem and 6-stem vocals match it on this song (intro ~−79 dBFS).

### Spotify Basic Pitch 0.4.0 — Apache-2.0

Install pain: 0.4.0 pins `tensorflow>=2.4.1,<2.15.1`, which has no wheels for Python 3.12+. Installed on **3.11** with TensorFlow 2.14.0; NumPy had to be pinned to 1.26.4 (NumPy 2.x breaks TF 2.14); `setuptools<82` was needed for resampy's `pkg_resources` import. After that, inference is **very fast** (~2–3 s/file plus a one-time model load).

On the mix it transcribes everything (1089 notes, 95% of frames active, bass MIDI 38, guitar and voice). On the vocal stem it becomes a credible vocal MIDI (373 notes, P/R 0.88 / 0.76 vs stem-RMS regions, median B3). This is the most natural bridge to Taylor's coming Guitar Pro / Power Tab / MusicXML answer keys: same representation (notes with start, end, MIDI, confidence).

**License verdict:** Apache-2.0, research-side yes. Do not pull TensorFlow into the app. An ONNX/TFLite backend exists in the package extras and might be worth a later research experiment; it still would not be a second engine in the browser app.

### torchcrepe 0.0.24 — MIT

Installed in the existing Demucs/torch venv. `full` model, 16 kHz, 10 ms hop, fmax 800 Hz. About 80–90 s per file on this CPU (four files, ~5.7 min). On the mix it already prefers the voice (~220 Hz) rather than the guitar. On the stem, periodicity 0.3 gives SRT P/R 0.93 / 0.68, close in spirit to Fox Ears' 0.92 / 0.72, with intro voicing 0.35 (0.19 at threshold 0.5). Prefer this over original CREPE: same family, MIT, PyTorch already present, no TensorFlow pin.

### CREPE 0.0.16 (TensorFlow) — MIT

Installed in the 3.11 TF venv with `--no-build-isolation`. Same license as torchcrepe, much heavier install and runtime (237 s and 223 s for master mix and stem, vs ~90 s and ~87 s for torchcrepe). Quality is not better (stem, thr 0.5: SRT P/R 0.92 / 0.62). Recommendation: keep torchcrepe, do not also depend on this stack. Details in §8.

### librosa pYIN — ISC (implementation)

See librosa row. Already available, fast, good on stems, confused by this mix. A reasonable default monophonic tracker after Demucs, with torchcrepe as the stronger-but-slower check.

---

## 6. License and "can it ship?" matrix

| Tool | License | Research-side candidate generator | In the browser / TypeScript app |
|---|---|---|---|
| librosa, pYIN | ISC | Yes (already there) | Not as Python. Key profiles and a pYIN-like idea can be *reimplemented* in TS if we ever want that; that is a port, not a second engine. |
| Demucs | MIT | **Yes — recommended** | No (PyTorch, seconds-to-tens-of-seconds, gigabytes). |
| Basic Pitch | Apache-2.0 | **Yes — recommended** | No TensorFlow in the app. Maybe a later ONNX experiment, still research-side. |
| torchcrepe | MIT | **Yes — recommended** as the monophonic f0 check | No. |
| CREPE (TF) | MIT | Redundant with torchcrepe | No. |
| Essentia | **AGPL-3.0** | External comparator only; do not import into this repo's packages or run it as a service without AGPL compliance | **No.** |
| madmom models | **CC BY-NC-SA 4.0** (code is BSD) | Private non-commercial comparison only | **No.** |

The architecture rule is the binding constraint even for permissive licenses: **measure once, hear many times**, one shared engine, research-side candidates are allowed, a second Python ear in the app is not.

---

## 7. Recommendations (top three to integrate, research-side)

1. **Demucs `htdemucs_6s` as the stem candidate generator.** About 30 s/track on this CPU, MIT, and it already emits a clean vocal stem plus a guitar stem. Feed those two candidates into Fox Ears scoring so a centered lead can be bound as an instrument instead of a voice. Next measurement, once this PR is in, is the 14-song set and Taylor's solo tabs — that is where the lead-as-vocal regression will actually show up. 2-stem remains enough when we only need vocals.

2. **Basic Pitch on those stems, as the note/MIDI candidate generator.** Apache-2.0, a few seconds, and the output is already MIDI — the same shape as the Guitar Pro / Power Tab / MusicXML truth pipeline we sketched earlier. Run it on vocals and on the guitar stem, not only on the mix.

3. **torchcrepe (and/or librosa pYIN) on the vocal stem, as the monophonic f0 candidate.** MIT (torchcrepe) / ISC (pYIN). pYIN is fast and already in the toolchain; torchcrepe is slower and better on the mix. Use stem + pYIN as the default, stem + torchcrepe as the check. Do not add original-CREPE/TensorFlow unless torchcrepe disagrees in a way we cannot explain.

**Keep librosa** as the research tempo/key baseline. **Essentia KeyExtractor** is the best *independent* key/BPM vote in this set, but because of AGPL it should stay in a side venv and not become a repo dependency. **madmom** is a good downbeat/chord comparator under the same non-commercial caution.

Nothing here should be wired into the live app or used to retune pass 2 until Taylor's answer key is in and the labels can move from SOFT to SOLID.

---

## 8. CREPE numbers (SOFT)

CREPE `full` + Viterbi, 10 ms step size, ran in the same Python 3.11 TensorFlow 2.14 venv as Basic Pitch. Wall time: master mix 237.5 s, master vocal stem 223.1 s (462 s for the pair); stretch mix 211.2 s, stretch stem 209.3 s (421 s). That is about **2.6× slower** than torchcrepe `full` on the same files.

Quality is in the same class as torchcrepe, not better. On the vocal stem at confidence 0.5, master SRT P/R is 0.92 / 0.62, stem-RMS P/R 0.76 / 0.74, intro voiced fraction 0.24, median 222 Hz (A3). At 0.3, recall rises and precision falls (SRT 0.89 / 0.78; intro 0.52). On the mix, 0.3 is too loose (intro voiced 0.91); 0.5 is closer to torchcrepe's mix numbers and the median F0 is already in the voice (217 Hz), not the guitar (pYIN's 83 Hz mistake). Stretch repeats the pattern.

**Verdict:** MIT, but the TensorFlow 2.14 / Python 3.11 / NumPy 1.x pin is painful, and we already have torchcrepe. Do not add original CREPE as a dependency. Use torchcrepe when we want a CREPE-family f0.


---

## 9. What was skipped or left rough

- No BandLab, Cakewalk, or Sonos API work, documented or otherwise.
- Essentia SBic was a single default-ish MFCC setting, not a parameter sweep. A better window might segment; the default did not.
- Basic Pitch note lists were not onset-aligned to a score (no Taylor MIDI yet). Metrics are frame activity vs vocal-on spans.
- Fox Ears vocal P/R uses the harness scorer; bakeoff P/R uses SRT spans and stem-RMS regions. Directional only.
- The 14-song lead-as-vocal regression was not re-run. This bakeoff used only the master and the 108 stretch.
- Remaining Suno variants, Taylor's phone pass, and the refresh-rate key/section bug are unchanged and still open.

---

## 10. Next, when Taylor's files land

- Drop his BPM/key list in as the answer key, re-score Fox Ears and these tools, and flip SOFT to SOLID in place, dated.
- For each Power Tab / Guitar Pro / MIDI file: truth JSON, stems + mix, then score Fox Ears, Demucs 6-stem (lead vs vocal), and Basic Pitch note error against that truth.
- Run `htdemucs_6s` on the 14-song set and measure how often a guitar stem would have prevented a vocal false positive.
