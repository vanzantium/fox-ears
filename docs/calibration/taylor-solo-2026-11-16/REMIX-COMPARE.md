# Remix comparison — Suno remakes of Taylor’s two solos, 2026-11-16

Measured 2026-11-16, 2:51 PM MST (America/Dawson_Creek), after the sealed blinds and the original score in `SCORE.md`. The sealed files were not edited. Audio and stems were not committed.

These are two Suno remixes of the same songs. Taylor noted that Suno also got much of his uploads wrong. They are **not** scored against 80 BPM / E — a remake may differ, and these ones do (Song A’s remake is not 80). Numbers below are what the same pipeline actually measured.

| Remix file | Duration | sha256 (m4a) | Matched to | How |
| --- | ---: | --- | --- | --- |
| `d08cbe99…b82ada.m4a` (Suno id `739f76b3-…`, created 2026-11-16 2:32 PM MST) | 278.69 s (4:38.69) | `f5d9a870e5b0c63826d6afaf7319f7292537e749bb123461ef9e9e90bdb644f8` | **Song A** | Caption track and vocal both open “They’ve been selling you a fantasy.” Shorter than the original (306.33 s). |
| `d3e61918…c0426b.m4a` (Suno id `64074f8c-…`, created 2026-11-16 2:32 PM MST) | 258.77 s (4:18.77) | `64682d4776c057f6f8d9d4a6c8ccbbc36f1cc5ee5fbfe5a2e037ce17fbe28ed1` | **Song B** | Caption track and mix ASR both open “I can show you the game.” Slightly longer than the original (251.50 s). |

Both files are Opus-in-m4a at 48 kHz stereo with a `mov_text` lyric track. Those captions are **prompt / text-track lyrics, not proof of what was sung**. faster-whisper (medium, CPU int8, beam 5, temperature 0, language=en) on the Demucs vocal stem — and on the mix — is what is compared to Taylor’s sheets. A first pass with VAD and `condition_on_previous_text=True` looped and drifted (especially Song B). The **primary** lyric numbers use a second pass: **no VAD, no previous-text conditioning**.

Same tool stack as the originals: Fox Ears P0 (60 Hz, sens 0.58), librosa 1.0.1, Essentia KeyExtractor / RhythmExtractor2013 / Percival, madmom RNN+DBN beats + CNN+CRF chords, Demucs `htdemucs_6s`, torchcrepe full (16 kHz, 10 ms, periodicity ≥ 0.4), faster-whisper medium.

---

## Measured tempo and key (do not force 80 / E)

### Song A remake — actually ~83.35 BPM, E major

There is no isolated metronome. The produced drums lock at **~83.3–83.8 BPM**, not 80. Onset autocorrelation on the Demucs drums stem peaks at 83.354 (strength 0.945) and the double 166.709 (0.889). A lock test against an 80 grid is essentially zero (vector strength 0.019). Suno followed the original’s guitar-strum pulse, not the click.

| Tool | Tempo | Key |
| --- | ---: | --- |
| Fox Ears | 83.8 (conf 0.37; rival 165.5 at 72%) | **E major (0.95)** |
| Drums-stem librosa beat-track | **83.354** (median IBI 83.354, std 2.14) | — |
| librosa on the mix | 166.709 (double of 83.35) | **E major** (4/4 vote, CQT-KK r = 0.85) |
| Essentia RhythmExtractor2013 / Percival | 83.35 / **83.35** | **E major (0.93)** (intro and body both E major) |
| madmom beats / chords | median **83.333**, mean 83.30, CV 0.023 | E major 30%, A major 28%, C#m, F#m, G#m |

**Report: 83.3–83.8 BPM, E major.** The 80 click from the original is gone.

### Song B remake — actually ~80 BPM, E minor

Tools split on octave, but the slow-level pulse is 80, not 83.

| Tool | Tempo | Key |
| --- | ---: | --- |
| Fox Ears | **79.9** (conf 0.53, up from 0.40 on the original; rival 160 at 69%) | **E minor (0.78)** |
| Drums-stem onset AC | **79.507** (strongest peak, AC = 1.0); 161.499 at 0.97 | — |
| librosa on the mix | 161.499 (median IBI 161.499; mean 160.2) | **E minor** (3/4 vote, CQT-KK r = 0.83, runner-up G major) |
| Essentia RhythmExtractor2013 / Percival | 161.61 / **80.12** | **E minor (0.85)** — intro and body both E minor |
| madmom beats / chords | median **160.0**, mean 159.96 | E major 26.5%, G major 25.6%, Em only 8.5% (chord histogram leans major; the key voters still say E minor) |

**Report: ~80 BPM (or 160 at the subdivision), E minor.** Essentia, which called the *original* G major, gets E minor on the remake.

---

## Lyrics vs Taylor’s sheets

Normalization matches `SCORE.md`: lowercase, strip stage directions, strip punctuation, keep apostrophes. Token counts: Song A 334 after tags (the 346 in `SCORE.md` counted a few leftover unmatched `[Chorus)` / post-chorus headers). Song B 304 either way. Remix WER below uses the 334/304 tokenizer; original vocal WER recomputed the same way is 43.4% (A) and 54.6% (B). The published SCORE.md figures were 44.5% / 54.6%.

Suno caption track vs the sheets (text only, not audio):

- Song A remake: **3.6%** caption WER (S 0 / D 0 / I 12). The captions copy the sheet almost exactly, but the post-chorus second line uses the *outro* wording (“And show the world what you know”) instead of “baby let the world know.”
- Song B remake: **0.0%** caption WER — a perfect token copy of the sheet, typographical quirks included (`Your can dream`, `(screame)`).

So the text tracks are not where Suno “got the uploads wrong.” The deviations are in the audio.

### WER (primary = no-VAD pass)

| Song | Source | vs sheet | C / S / D / I | vs Suno captions | Original (same tokenizer) |
| --- | --- | ---: | --- | ---: | ---: |
| A remake | **vocal stem (primary)** | **28.1%** (351 hyp) | 285 / 21 / 28 / 45 | 25.4% | vocal **43.4%** (SCORE.md 44.5%) |
| A remake | mix | 73.4% | 93 / 39 / 202 / 4 | 74.3% | mix 73.1% (SCORE.md 72.8%) |
| B remake | vocal stem | 52.6% (221 hyp) | 153 / 59 / 92 / 9 | 52.6% | vocal **54.6%** |
| B remake | **mix (better transcript)** | **32.6%** (283 hyp) | 230 / 28 / 46 / 25 | 32.6% | mix 91.8% (unusable) |

The first (VAD + previous-text) pass is **not** used for scoring: A vocal 55.4% with a “you can take the cards” loop; B vocal 94.1% with multilingual garbage; B mix 100% empty. Those were ASR setup failures, not Suno.

### Suno changes vs ASR mishears

Captions ≈ sheets, so a word is tagged **Suno** only when the *sung* audio (and usually both stem and mix ASR) disagrees with the sheet *and* the captions in a musically coherent way. A disagreement that looks like a typical phonetic slip, or where mix and stem disagree, is tagged **ASR**.

**Song A remake**

- Opening and the “debt / regret / don’t want to show you” block come through on the vocal stem, including “has a debt” (the original ASR said “as a debt”). **Cleaner ASR**, not a lyric change.
- “we could **have been** endless bliss” vs sheet “**live in**.” Captions say “live in.” **ASR** (or a soft sung swap; captions contradict it).
- First-chorus “So take it away on yourself” / “thrive” dropped or compressed. **ASR deletions**, not a caption change.
- “Into your cell” / “your-sale” vs “yourself.” Mix is closer to the sheet. **ASR.**
- “You got no real care” vs “You got the wheel kid.” The mix heard “You got the real kid,” which is the same line, slightly clearer. Captions still say “wheel kid.” **ASR**, not a Suno rewrite.
- Post-chorus: vocal ASR heard **“Baby let your garden grow, baby let the world know”** — the *sheet* wording — even though the caption track used the outro’s “And show the world what you know.” Treat that as a **caption-track** difference, not evidence the vocal changed.
- “we've had **rhyme**” vs “we've had to **crime**”; “they **kick** down” vs “they **let you** down.” **ASR.**
- The first-pass “you can take the cards” loop was **ASR repetition** (`condition_on_previous_text`). The no-VAD pass has the sheet’s “take the cards now / play it hard now” once. Not a Suno loop.
- Mix ASR leaked Portuguese / Vietnamese fragments (“nào pode sonar um,” “o que significa ser vivo”). **ASR language drift on a dense mix**, not a bilingual Suno lyric.

**Song B remake**

- Mix opening is almost letter-perfect, including “teach you the **rules**” (which *is* on the sheet) and “play with the **fools**” (which the original ASR turned into “rules”). That original “fools → rules” was **ASR**; the remake mix gets it right.
- “They're selling **your** dreams / **your** lies” vs sheet “selling **you**.” **Possible soft Suno change** or ASR; small.
- “It's the same old game in a new disguise” heard **three times** in the mix. It appears once on the sheet and once in the captions. **Likely a Suno performance loop** (arrangement, not a caption rewrite).
- **“Pull off the pitch, pull out the gun”** vs sheet/captions “pull off the **patch** / Pull out **guard**.” “Pitch” ≈ patch is **ASR**. “**Gun**” was heard on *both* the vocal stem and the mix, against captions that still say “guard.” The original solo ASR had said “car.” **Probable Suno sung change** (caption unchanged). Could still be a consistent ASR substitution; it is the one line where two remix transcripts agree on a real word the page does not have.
- Screamed hook: the mix *does* get “Tired of feeding the lie / Tired of playing still / I'm gonna fucking die / might as well learn to kill” on the first chorus — the hook the original ASR almost entirely missed. Later passes often become “**fading the light**” / “feed in the light.” Captions still say “feeding the lie.” **ASR on the processed / screamed delivery**, not a Suno rewrite.
- “Fall at the flaws” vs “Point out the flaws”; last-chorus “roar” dropped; “Ich might.” **ASR.**
- Vocal-stem ASR is much worse than the mix here: it skips the opening verse, hallucinates “I MICHAEL STOCKER,” and dissolves into “fading the light.” The B vocal stem is not a reliable lyric source on this remake (screams / effects after Demucs). Use the mix.

---

## Is the remake cleaner? Does WER or vocal-note detection improve?

**Stems: yes, cleaner isolation.** The remakes are full arrangements (real bass and drums, not a solo guitar-plus-click), and Demucs benefits.

| Check | Orig A | Remix A | Orig B | Remix B |
| --- | ---: | ---: | ---: | ---: |
| Bass / drums whole, dBFS | −54.8 / −47.3 | **−25.9 / −21.9** | −59.3 / −44.3 | **−25.2 / −22.7** |
| Vocal stem, first 15 s | −57.2 | **−82.4** | −66.1 | **−89.5** |
| Guitar leaking into vocal-dominant frames, median dBFS | −21.8 | **−36.5** | −25.3 | **−35.9** |
| Vocal-minus-guitar margin in those frames | 9.5 dB | **13.5 dB** | 8.9 dB | **11.4 dB** |
| Fraction of frames both vocal and guitar active | 62.6% | **36.9%** | 57.6% | **41.1%** |
| Vocal-dominant frames | 31.5% | **47.9%** | 14.3% | **43.1%** |
| Voice energy onset (s) | 24.38 | 24.20 | 27.68 | 20.53 (earlier than the 27.63 s caption verse; possible pickup / ad-lib) |

Guitar-into-vocal leakage is about 10–15 dB lower. Intros are genuinely mute.

**WER: yes, improved — a lot on A’s vocal stem and on B’s mix.**

- Song A vocal: **28.1% vs 43.4%** (about 15 points). Opening, debt/regret, verse 2, and the “garden grow” post-chorus/outro all come through much more completely. The mix is still not usable (~73%).
- Song B mix: **32.6% vs 91.8%** on the original mix, and also better than the original *vocal* 54.6%. The screamed hook is at least partly recoverable. The remix vocal stem (52.6%) is only a hair better than the original vocal and misses the first verse — do not prefer it.

**Fox Ears vocal-note detection on the mix: no, it got worse.** A produced band is a harder mix for the P0 vocal gate than voice-plus-guitar.

| | Orig A | Remix A | Orig B | Remix B |
| --- | ---: | ---: | ---: | ---: |
| Fox Ears vocal notes | 33 (G3–G♯4, median B3) | **9** (G♯3–G♯4, median C♯4) | 7 (G3–B3, median A3) | **4** (F♯4–E5, median E5) |
| Fox Ears vocal mask | 52.2% | 50.3% | — (under-detect) | 54.6% |
| torchcrepe vocal-stem voiced fraction | 67.1% | **70.0%** | 63.3% | **54.1%** (down) |
| torchcrepe vocal-stem p5–p95 | C3–G4, median G♯3 | C3–G♯4, median B3 | D♯3–A♯4, median G♯3 | E3–B4, median G3 |

torchcrepe on the A vocal stem is slightly more voiced, similar range, median a bit higher (Suno’s voice sits higher). On B the stem is *less* voiced (54% vs 63%) — processed / screamed tones hurt periodicity. Fox Ears, which still looks at the *mix*, under-detects even more than on the solos. A vocal-stem input to the note tracker (already a SCORE.md target) is more, not less, necessary on remakes.

**Key path:** slightly friendlier on B. Essentia KeyExtractor flips from the original’s G-major miss to **E minor (0.85)** on the remake. Fox Ears and librosa already had E minor and stay there. madmom’s chord histogram still leans E/G major.

**Sections:** not better. Fox Ears still fails to reserve a real intro (A: 0–6 s “verse” then 6–29 s “chorus,” even though voice enters at 24.2 s; B: 0–6.6 s “verse,” 6.6–26.9 s “chorus,” voice around 20–27 s). Caption chorus times are 70.67 s (A) and 75.55 s (B), same neighborhood as the originals.

**Tempo path:** the A remake is a clean exhibit of the guitar-strum lesson in `SCORE.md`. With the 80 click removed, every tool agrees the produced groove is ~83.35 (or 167). That is what Suno kept.

---

## Takeaways

1. Match: `d08cbe99` = Song A remake; `d3e61918` = Song B remake.
2. Report measured values: **A remake 83.3–83.8 BPM, E major**; **B remake ~80 BPM, E minor**. Do not write 80 / E for A.
3. Stems are cleaner (bass/drums present, much less guitar bleed, mute intros). WER improves when ASR is allowed to see that: A vocal 28% vs 43%; B mix 33% vs an unusable original mix and a 55% original vocal.
4. Fox Ears mix-level vocal notes get worse (9 and 4). torchcrepe on the A stem is slightly better; on the B stem it is not. Next tuning target #3 in `SCORE.md` (note tracker on a vocal stem) still stands, and remakes make it more urgent.
5. Suno’s lyric *captions* are nearly Taylor’s sheets. The obvious audio mistakes are a **tempo follow of the A guitar pulse (83.35, not 80)**, a probable sung “**gun**” for “guard,” and a looped “same old game” line on B. Most other odd words (“your cell,” “fading the light,” “real kid,” the first-pass cards loop) are ASR.
6. For screamed / produced takes, prefer mix ASR if the vocal stem falls apart, and never enable previous-text conditioning on these files — it hallucinates loops and other languages.

Further remake versions from Taylor, if they arrive, should be run through the same pipeline and compared to this table rather than forced to 80 / E.
