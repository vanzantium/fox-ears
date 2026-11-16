# Score — Taylor solo calibrations, 2026-11-16

Scored on 2026-11-16 against Taylor’s answers in `ANSWERS.md` (both songs **80 BPM**; Song A **E major**, Song B **E minor**) and the two lyric sheets. The sealed blind files (`BLIND-READINGS.md` / `.json` / `SEAL.txt`) were re-hashed before scoring and were **not edited**. Seal still matches:

- sha256(`BLIND-READINGS.md`) = `891e34af83a0bf4a7e77fe9bc2b748c44c78cf3ddee483d80e40b43664cc6755`
- sha256(`BLIND-READINGS.json`) = `38e5e92e5d4c60628bc1725e9e28cf4166ed8aa3b80b239ef71ef346832271be`

Status labels in this file are the post-answer grades. Sealed readings stay written as SOFT; a SOLID here means the *score* is now supported, dated **2026-11-16**, not that the seal was rewritten.

**Scoring rules (tempo).** Truth is 80 BPM on both recordings (the metronome click).

- **HIT (strict):** within ±4% of 80 → 76.8–83.2 BPM.
- **HIT (forgiven, double/half):** within ±4% of 40 or 160 → 38.4–41.6 or 153.6–166.4 BPM.
- Anything else is a **MISS**. Readings around 83–84 or 164–167 that sit just outside those bands are recorded as a **guitar-strum lock**: the tracker followed the strum, not the click.

**Scoring rules (key).** HIT if the tool’s primary key equals Taylor’s answer (A: E major; B: E minor). Relative-major/minor substitutions are a miss.

**Scoring rules (lyrics).** Word error rate after lowercasing, stripping stage directions (`[Verse]`, `(Chorus)`, `(screamed)`, and unmatched variants), and stripping punctuation. Apostrophes inside words are kept. WER = (S + D + I) / N_ref. Primary number is **faster-whisper medium, CPU int8, beam 5, VAD, temperature 0, on the Demucs `htdemucs_6s` vocal stem**. The mix is reported only as a usability check.

Two Suno remixes of the same songs were measured after scoring. They are **not** scored against 80 / E — they may differ — and live in `REMIX-COMPARE.md`.

---

## Tempo scorecard

| Tool | Song A (truth 80) | Grade A | Song B (truth 80) | Grade B |
| --- | ---: | --- | ---: | --- |
| Click / downbeat fit (Demucs drums stem) | **80.00** (LS 80.0013, median err 2.27 ms; downbeats 0.0015–306.0027, 3.000 s bars) | **HIT — SOLID 2026-11-16** | **80.00** (LS 80.0014, median err 0.73 ms; 0.0015–249.0006) | **HIT — SOLID 2026-11-16** |
| Fox Ears P0 (60 Hz, sens 0.58) | 84 (conf 0.32; rival 165.5 at 87%) | **MISS** (+5.0%, outside ±4%; not a forgiven octave). Remains SOFT. Guitar-strum lock. | **79.9** (conf 0.40; rival 160 at 54%) | **HIT — SOLID 2026-11-16** |
| librosa 1.0.1 `tempo` / beat-track | 166.709 (median IBI 166.709) | **MISS** (167 is 0.3 BPM past the forgiven-double ceiling of 166.4). Guitar-strum lock, not the click. | **79.507** (median IBI 79.507) | **HIT — SOLID 2026-11-16** |
| Essentia RhythmExtractor2013 | 164.16 (conf 1.47) | **HIT (forgiven, double) — SOLID 2026-11-16**, with the caveat that the pulse it doubled is the strum, not the click. | **79.571** (conf 3.35) | **HIT — SOLID 2026-11-16** |
| Essentia PercivalBpmEstimator | 83.35 | **MISS** (just outside 83.2). Guitar-strum lock. Remains SOFT. | 159.01 | **HIT (forgiven, double) — SOLID 2026-11-16** |
| madmom RNN+DBN beats | median 83.333, mean 82.64 | **MISS** (83.333 just outside 83.2). Guitar-strum lock. Remains SOFT. First beats 0.03 / 0.74 / 1.50 sit near the click *and* a slightly sharp strum grid. | **median 80.0**, mean 79.59; first beats 0.02 / 0.75 / 1.50 / 2.25 / 3.00 on the click grid | **HIT — SOLID 2026-11-16** |

---

## Key scorecard

| Tool | Song A (truth E major) | Grade A | Song B (truth E minor) | Grade B |
| --- | --- | --- | --- | --- |
| Fox Ears (duration-weighted chroma + bass, intro discounted) | E major (0.93) | **HIT — SOLID 2026-11-16** | E minor (0.75) | **HIT — SOLID 2026-11-16** |
| librosa KK / Temperley vote | E major (3 of 4; CQT-KK r = 0.87, runner-up E minor) | **HIT — SOLID 2026-11-16** | E minor (4 of 4; CQT-KK r = 0.75, runner-up G major) | **HIT — SOLID 2026-11-16** |
| Essentia KeyExtractor | E major (0.90) | **HIT — SOLID 2026-11-16** | **G major (0.87)** — the relative major | **MISS.** Remains SOFT. |
| madmom CNN+CRF chords (not a key voter) | A major 27.9%, E major 26.9%, C#m, Em, F#m, G#m | Diag only (A slightly edges E; still in the E-major diatonic set) | G major 24.8%, E minor 21.1%, C, E, A, D | Diag only (same relative-major lean Essentia made a key call on) |

**Headline:** Fox Ears beat Essentia on Song B’s relative-key call. Fox Ears and librosa both said E minor; Essentia (and madmom’s most-common chord) preferred G major.

---

## Lyrics — faster-whisper WER

Reference tokens: Song A 346, Song B 304, after the normalization above. Sheets include typographical quirks (`They'l`, `Your can dream`, `Don’t want to them to know`, `has a debt`, `we’ve had to crime`); those tokens are scored as written.

| Song | Source | N_ref | N_hyp | C / S / D / I | WER |
| --- | --- | ---: | ---: | --- | ---: |
| A | vocal stem | 346 | 289 | 202 / 77 / 67 / 10 | **44.5%** |
| A | mix | 346 | 126 | 97 / 26 / 223 / 3 | 72.8% (not very usable) |
| B | vocal stem | 304 | 199 | 140 / 57 / 107 / 2 | **54.6%** |
| B | mix | 304 | 36 | 25 / 11 / 268 / 0 | 91.8% (unusable) |

The mix is a poor lyric source on both songs. All commentary below is vocal-stem ASR.

### Song A — notable mishears

- Opening “fantasy” → “pair of seat” (the mix said “currency”).
- Missed couplet “really old / maybe there’s more than this we could live in endless bliss” collapsed to “really evil.”
- “So take it away on yourself” → “Don’t take it all on yourself” (polarity flip).
- Chorus “you can **go** faster than they’ll ever know” (both choruses; truth is **go**, not grow) → “go/grow faster than the wind.”
- “So put your heart into yourself” → “Don’t put your heart into yourself” (another negation flip).
- “They’ll tell you how it used to be” → “This is the show that you used to be.”
- “You got the wheel kid” → “You’ve got the whip.”
- Post-chorus “Baby let your garden grow” almost entirely dropped → “Don’t grow, baby.”
- “scared acting like” → “scared fears”; “delirious / series” → “hysteria.”
- “turn all damn scene” → “change the whole dancing.”
- “Baby we’ve had to crime / Now it is the good time” → “It’s crack now, it is the fill of time.”
- Close: sheet “has a debt” vs ASR “as a debt.”

**go vs grow.** The sheet uses **go** in both choruses (“you can go faster…”, “baby you can really go”) and **grow** only in the post-chorus / outro (“Baby let your garden grow”). The ASR often blended those.

### Song B — notable mishears

- “fools” → “rules.”
- “pull off the patch” → “pull off your mask.”
- “Pull out guard” → “pull out your car.” The sealed guess that “car” might be cards / core / **guard** was right to be uncertain; truth is **guard**.
- The screamed chorus is the main damage: “Tired of feeding the lie / I’m gonna fucking die…” heard as “You can die, but play it still / Might as well learn to kill, play the game.” Whole chorus passes are deleted (107 deletions; hyp is 105 words short).
- “make your own line” → “life.”
- “bleed till your dry” skipped or → “try.”
- “scream” → “sing.”

Chorus misses dominate B’s WER. The verses are merely messy; the screamed hook is mostly gone.

---

## Sections

There is no independent annotated map from Taylor beyond the lyric-sheet headings. Remix caption timestamps (Suno’s lyric track, not a performance proof) line up closely with measured voice onsets and are used only as a timing cross-check.

| Check | Truth-ish timing | Fox Ears | Grade |
| --- | --- | --- | --- |
| A intro / voice enter | Voice energy 24.38 s; remix captions start Verse 1 at 24.314 s | Intro 0.0–24.8 s, then verse | **HIT — SOLID 2026-11-16** for the intro boundary |
| A first chorus | Captions: (Chorus) at 70.671 s | Labeled “chorus” at 41.1–69.7 s (late Verse 1) and then “verse C” at 69.7–99.7 s, which is where the chorus actually starts | **MISS** on chorus label / end of Verse 1. Remains SOFT. |
| A post-chorus “garden grow” | On the sheet after the first chorus | Not identified as a post-chorus; wording also dropped in ASR | **MISS** / SOFT |
| B intro / voice enter | Voice energy 27.68 s; captions Verse 1 at 27.632 s | Intro only 0.0–15.8 s (too short), then a long “verse” | **MISS.** Remains SOFT. |
| B screamed chorus | Captions: first chorus 75.548 s | A “chorus” at 62.9–99.0 s starts early and was never tied to the screamed hook (which ASR also missed) | **MISS** / SOFT |

Other section cuts stay SOFT — no tighter answer key, and several labels follow the lyric mishears.

---

## Stems, vocal notes, range (still mostly SOFT)

No annotated stem truth or sung-range answer, so these stay **SOFT** except as qualitative lessons.

- Demucs `htdemucs_6s` put the metronome on the **drums** stem (A drums first 15 s −42.7 dBFS vs bass/piano/other around −55). Vocal stem intro is a clean mute: A −57.2 dBFS, B −66.1 dBFS.
- Guitar still leaks into the vocal stem. When vocals are dominant, residual guitar is about **−21.8 dBFS** (A) and **−25.3 dBFS** (B). Song B is the harder mix: guitar is actually a touch louder than vocals overall (−18.5 vs −19.0 dBFS), and vocal-dominant frames are only 14%.
- torchcrepe on the vocal stem (full, 16 kHz, 10 ms, periodicity ≥ 0.4), **SOFT**:
  - A: median G♯3 (211 Hz), p5–p95 C3–G4, 67% voiced.
  - B: median G♯3 (207 Hz), p5–p95 D♯3–A♯4, 63% voiced.
- Fox Ears vocal-note counts vs that melody: **A 33 notes** (G3–G♯4, median B3) is sparse but in-range; **B only 7 notes** (G3–B3, median A3) is a clear under-detect — torchcrepe still sees a D♯3–A♯4 sung range under the same guitar.

---

## SOLID / SOFT changes (dated 2026-11-16)

Promoted to **SOLID** (supported by Taylor’s answers):

- Click-fitted tempo **80.00 BPM** on both songs.
- Fox Ears tempo on **Song B** (79.9).
- librosa / Essentia rhythm / madmom tempo on **Song B**; Percival B as a forgiven double (159).
- Essentia rhythm on **Song A** as a forgiven double (164), with the strum-vs-click caveat above.
- Key: Fox Ears, librosa, and Essentia on **Song A (E major)**; Fox Ears and librosa on **Song B (E minor)**.
- Song A intro boundary (0–24.8 s).

Left **SOFT** (miss, or no answer key):

- Fox Ears, Percival, madmom, and librosa tempo on **Song A** (guitar-strum lock ~83–84 / ~167, not the 80 click).
- Essentia key on **Song B** (G major).
- Fox Ears section labels other than the A intro; B intro (too short); both choruses.
- Vocal-note counts, ranges, stem leakage figures.
- All WER / mishear commentary (the sheets are the lyric truth; the *metric* is a measurement, not a promoted musical reading).

---

## Lessons

1. **Mix tempo tools lock onto the guitar strum (~166 / ~83–84) instead of the 80 click**, especially on Song A, where the strum is loud and slightly sharp of a clean 80 grid. A dedicated click / downbeat fit on the drums stem recovered 80.00 BPM with millisecond error; the general-purpose trackers did not. Fox Ears’ A reading (84, rival 165.5 at 87%) is the same failure mode. Song B’s strum is less confusing, and almost every tool hit 80 (or a forgiven 160).
2. **Fox Ears under-detects vocal notes when guitar sits underneath.** Song B is the exhibit: 7 notes vs torchcrepe’s D♯3–A♯4 on the same vocal stem. Any “sung range” from the P0 note list on a guitar-plus-voice take will be too small until the vocal gate is less trigger-shy, or until it can read a separated stem.
3. **Fox Ears beat Essentia on the Song B relative-key call** (E minor vs G major). librosa agreed with Fox Ears. madmom’s chord histogram leaned the same way Essentia did (G > Em). The key voter should keep discounting the intro and should not promote a relative major just because G is the most common triad.
4. **faster-whisper on the vocal stem is usable; on the mix it is not.** WER 44.5% (A) / 54.6% (B) is already high for scoring lines, and polarity flips plus a dropped screamed chorus would break a hook finder. Negation errors (“So take it away” → “Don’t take it all”) and go/grow confusion are the dangerous ones, not just phonetic near-misses.
5. **Section labels follow lyric mistakes.** Ending A’s first chorus early and calling “This is the show…” a hook was a mishear of the rest of the chorus. B never found the screamed hook because ASR never heard it.

---

## Next tuning targets

1. Teach the tempo path to prefer a sparse, extremely regular pulse (metronome / drum-stem click) over a dense mid-tempo guitar grid when both are present — or to report both levels and say which is the click.
2. Tighten the ±84 / ±167 attractor on songs that also contain an 80 click; do not let 83.3–84 sneak in as “close enough” if the click is measurable.
3. Vocal-note detection on mixed guitar+voice: raise recall on Song B–like takes (target: closer to torchcrepe’s voiced regions than to 7 notes). Consider an optional vocal-stem input to the note tracker after Demucs.
4. Relative-key tie-break: keep the Fox Ears behavior that preferred E minor over G major on B; add a test so Essentia-style relative major promotions are flagged, not trusted.
5. Lyric / section path: do not cut a chorus at a mid-hook mishear; special-case screamed or shouted hooks (Song B) so they are not dropped from both ASR and the sectioner.
6. When a click is present, use it as a bar grid for section boundaries (3.000 s on these takes) rather than novelty alone.

Remix findings, including whether a produced remake is “cleaner” for these tools, are in `REMIX-COMPARE.md`.
