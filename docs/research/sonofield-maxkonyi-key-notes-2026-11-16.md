# Sonofield / Max Konyi notes for Fox Ears key precision

**Date:** Monday 2026-11-16, America/Dawson_Creek (UTC-7)
**Brief:** Public pages only. No login walls, no scraping of private or account-only material, no copying of app or course code. YouTube timedtext/captions were requested and were not publicly accessible (empty lists or request limits), so video techniques below come from **titles, public descriptions, and the author’s written posts**. Publicly indexed caption excerpts from web search are quoted only where noted, and are not a claim that the videos were watched. Sonofield Ear Trainer is a commercial app; no public source repository or license to reuse its code was found.

**Sources consulted**
- App page: https://sonofield.com/apps/ear-trainer
- Method: https://sonofield.com/blog/sonofield-ear-trainer-method (Max Konyi, updated 2026-03-16)
- Key-finding post: https://sonofield.com/blog/find-the-key-of-any-song-in-30-seconds (Max Konyi, 2026-01-26, updated 2026-02-19)
- Related posts: https://sonofield.com/blog/benefits-of-ear-training, https://sonofield.com/blog/the-perfect-ear-training-routine
- Channel: https://youtube.com/@maxkonyi (channel id `UCUzHYuS7EdFSQvOJBZNet6g`)
- Key Seeker 64 is described on the blog as a free practice tool, also inside the Ear Trainer. It was not opened behind a login.

---

## What Sonofield Ear Trainer is

Sonofield is Max Konyi’s drone-based ear-training app (free on the App Store and Google Play, with a Pro tier). It teaches relative pitch by asking the listener to recognize **scale degrees against a steady tonic drone**, as a feeling, not as interval math.

From the app page and the method post:

- **Set the key** with a constant drone (the tonic / “home base”).
- **Degrees mode:** identify a single scale degree over the drone.
- **Melodies mode:** short phrases, closer to real music.
- **Voice mode:** sing the degree into the microphone.
- **Pocket / Free Play:** hands-free or exploratory work on the “harmonic rainbow” / Sonofield Circle (a colour-coded circle of fifths). A guided Path introduces degrees one by one, including chromatic ones (b2, #4, etc.).
- Intervals are treated as a **supporting** skill. The foundation is the relationship of each degree to the tonic.

There is no public algorithm, source tree, or license to copy. Nothing from the app binary or a private repo was used. The mappings below are from the published method, not from reverse engineering.

---

## Techniques (each with a source and a Fox Ears mapping)

| # | Technique | Source | Fox Ears cue | In the 2026-11-16 key fix? |
|---|---|---|---|---|
| 1 | The tonic is the note that feels like **home, rest, resolution, completion**. A key is tonic + major/minor tonality. | https://sonofield.com/blog/find-the-key-of-any-song-in-30-seconds ; https://sonofield.com/blog/sonofield-ear-trainer-method ; https://www.youtube.com/watch?v=lYtZxy-bqNY (title/description); https://www.youtube.com/watch?v=u0P7gh789RI (title/description: “THE TONIC — the most fundamental and important sound/feeling in music”) | `global_key` is the preferred home pitch class + mode, not merely the most common chroma bin. | **Yes** — cadence/home evidence can overturn a dominant-heavy profile. |
| 2 | Pause the music, imagine the track **collapsing into one final note**, sing or play the note you can stop on. | https://sonofield.com/blog/find-the-key-of-any-song-in-30-seconds ; video https://www.youtube.com/watch?v=lYtZxy-bqNY (description: “feeling-based process” to find tonic and tonality). A web-search caption excerpt of the same video (not a watched viewing) describes pausing and imagining the song coming to a close on one home note. | Last-window chroma and bass (`cadence_key`, last 4 s) as a computational stand-in for “where can this end?” | **Yes** — `cadence_key` hypothesis and cadence bass+chroma votes. Singing itself is not implemented. |
| 3 | Look at the **last note of the main melody**, and the **bass note of the chord that feels like home**. Clues, not guarantees. | Same blog, “Technique 2”; same video title/description and indexed caption excerpt. | Ending bass pitch class; bass motion V→I; leading-tone (degree 7) resolving to 1 in bass or voiced pitch. | **Yes** — cadence bass, `bassMotionCount`, `leadingToneResolutions`. Melody-last-note is only used when a voiced MIDI pitch is present in the frame stream. |
| 4 | **Do not trust the first chord or the last chord alone.** They are good places to look; the question is still “does it feel like home?” | Same blog, “Common mistakes” §2. | Intro / first section stays discounted (`introWeight` 0.3) and is reported separately as `intro_key`. A last chord can vote, but a single cue cannot lock the key by itself. Whole-song bass on the dominant (a pedal) is not a veto of a G cadence. | **Yes** — this is the stretch fix: a D intro and D-heavy bass no longer lock D when scale-degree and cadence agree on G. |
| 5 | If you can name a **scale degree** against the music (e.g. this note feels like 5), compute the tonic from it (if C is 5, the tonic is F). Unique degrees of a candidate key matter. | Same blog, “Technique 3: Use other scale degrees.” Degree vocabulary: https://sonofield.com/blog/sonofield-ear-trainer-method and https://www.youtube.com/watch?v=EU4bV0zE4pk (User Guide chapters on scale degrees and feeling-states). | For a fifth-pair (G vs D), the pitch class only the lower key owns minus the one only the upper key owns (major: 4 vs #4, i.e. C vs C# for G/D; minor: b6 vs 6). | **Yes** — existing unique-degree test, now allowed to confirm a tonic even when whole-song bass follows the dominant. |
| 6 | **Test the third** to decide major vs minor: sound the minor third and the major third above the tonic and ask which fits more often. Also: feel major/minor in the tonic itself. | Same blog, “Determining the tonality.” | Fox Ears already compares Krumhansl major/minor profiles. A sounding “probe tone” test is not in the engine. | **Partial** — profile comparison only. Not newly implemented as a probe. |
| 7 | **Relative major and minor** can both be heard as home when there is no strong cadence. Try both tonics; go with the one that feels more resolved. Key Seeker 64 “will accept either answer in these cases.” | Same blog, “Common mistakes” §1. | A `relative` hypothesis is always listed (e.g. E minor beside G major). We do not auto-accept both as a hit, and we do not flip mode from this rule alone (see 14-song mode misses). | **Listed, not used as a decider.** |
| 8 | Tonic-vs-dominant (and “5 feels open / 1 feels like rest”) is a special case of degree meaning. Degree 5 is expansive, not home. | Method post; https://www.youtube.com/watch?v=AARDtj6wL3U (“A Guided Tour of Musical Feeling,” all 12 degree feeling-states); https://www.youtube.com/watch?v=Y6BPB3Cso00 (“Feeling the Major Scale”). | When the top two keys are a fifth apart and close in correlation, treat them as a **tonic-vs-dominant** pair. If evidence splits, mark `key_status: UNRESOLVED` and keep both `global_key` and `dominant_rival`. | **Yes** — this is the main resolver change. |
| 9 | Contextual training over interval drills: notes get their meaning from the **drone / tonal centre**, not from isolated distances. | https://sonofield.com/apps/ear-trainer ; https://sonofield.com/blog/benefits-of-ear-training ; https://www.youtube.com/watch?v=x5S5MYKAvBY (Part 2: Scale Degrees and Intervals); https://www.youtube.com/watch?v=XLut-Ckq8hw (major-scale degrees against a changing drone). | Keep key as a tonal centre with degrees, not a raw pitch histogram. Already the shape of `degreeOf` / `sonofield.ts`. | Already present; not changed in this fix. |
| 10 | Modes are distinct from “major vs minor of the same pitch set.” One melody in the parallel modes sounds different; Dorian is its own centre, not just a relative minor colour. | https://www.youtube.com/watch?v=4n-O95j05WM (“What the Modes Really Sound Like,” description lists Ionian, Aeolian, Lydian, Dorian, Mixolydian, …); https://www.youtube.com/watch?v=54QL0eewdOE (Dorian wind-chime ear training); https://www.youtube.com/watch?v=fIQ9ykjV0Qg (follow-up explanation, title truncated in the public listing). | Fox Ears still reports major/minor only. Modal labels are a later track. | **No.** |
| 11 | Transfer to **real music**: app skills fail if they stay on isolated drones. Practice on loops of real songs (Key Seeker 64 / “From Ear Training Apps to Real Music”). | https://www.youtube.com/watch?v=QejyY6SBICU ; Key Seeker mentioned on the blog and in https://www.youtube.com/watch?v=lYtZxy-bqNY. | Regression tests on the master, the 108 stretch, Songs A/B, and the 14-song guard set — real recordings, not a synthetic-only claim. | **Yes** as evaluation, not as a product feature. |
| 12 | Chords by ear: feel the home chord, then use theory to fill the progression. Leading-tone and bass motion are part of that craft. | https://www.youtube.com/watch?v=9aM3JbcPNAk (“Chords by Ear: The Real Process”). | Bass V→I and 7→1 counts as votes in the fifth-ambiguity resolver. Full chord-progress parsing is not new here. | **Partial** — motion counts only. |

---

## Relevant Max Konyi videos (public listings)

All of the following are on https://youtube.com/@maxkonyi (author verified from the public watch page). Descriptions were read from the public page; **captions/timedtext were not available**.

Key-finding and tonic:

- https://www.youtube.com/watch?v=lYtZxy-bqNY — *Find the Key of Any Song in 30 Seconds (By Ear)*. Description: feeling-based process for tonic and tonality; Key Seeker 64 as a practice loop tool. Written counterpart: the 30-second blog post above.
- https://www.youtube.com/watch?v=u0P7gh789RI — *The Secret of Ear Training*. Description: feeling-states; practical method for recognizing the tonic as the fundamental home sound.
- https://www.youtube.com/watch?v=wADUSact3B8 — *Answering Your Ear Training Questions (Part 1) \| Essential Fundamentals*. Roadmap.

Degrees, intervals, melody:

- https://www.youtube.com/watch?v=-gH4sfZ7ALg — *How to Play Any Melody by Ear - Step by Step Guide*.
- https://www.youtube.com/watch?v=x5S5MYKAvBY — *Part 2 \| Scale Degrees and Intervals*.
- https://www.youtube.com/watch?v=AARDtj6wL3U — *A Guided Tour of Musical Feeling* (all 12 degree feeling-states).
- https://www.youtube.com/watch?v=Y6BPB3Cso00 — *Essential Ear Training - Feeling the Major Scale*.
- https://www.youtube.com/watch?v=XLut-Ckq8hw — *Immersive Ear Training: Major Scale (1-Hour)* (degree against a drone; key changes periodically).
- https://www.youtube.com/watch?v=QejyY6SBICU — *From Ear Training Apps to Real Music*.

Modes and harmony:

- https://www.youtube.com/watch?v=4n-O95j05WM — *What the Modes Really Sound Like* (parallel modes of C; chapter list in the description).
- https://www.youtube.com/watch?v=54QL0eewdOE — *Meditative Ear Training - Dorian Mode* (Windtone: https://windtone.sonofield.com/).
- https://www.youtube.com/watch?v=9aM3JbcPNAk — *Chords by Ear: The Real Process*.

App walkthroughs (no code; public feature descriptions):

- https://www.youtube.com/watch?v=EU4bV0zE4pk — *Sonofield Ear Trainer - User Guide & Walkthrough* (chapters: feeling-states, scale-degree numbers, the circle, the drone, learning new degrees).
- https://www.youtube.com/watch?v=5OQTuaEopwE — *Sonofield Ear Trainer is Here! - Essential Info & Tips*.
- https://www.youtube.com/watch?v=eKOjhlyf9Jk — *Sonofield is Easy Now! (new update)*.

The channel’s public Atom feed (https://www.youtube.com/feeds/videos.xml?channel_id=UCUzHYuS7EdFSQvOJBZNet6g) only returns recent uploads, mostly Weekly Production Challenges, which were not used as key-finding sources.

---

## What was implemented in the key fix (step 1)

Code: `app/src/lib/hearing/keyResolve.ts`, wired through `buildChart`. Regression tests: `app/scripts/p1-key-resolve.test.mjs`.

Implemented from the table: **1, 2 (computational stand-in), 3, 4, 5, 8, 11 (as evaluation)**. Partial: **6, 12**. Listed only: **7**. Not implemented: **10**, and any singing / probe-tone UI.

Root cause this was aimed at: the 108 stretch’s Krumhansl profile preferred D (the dominant, and the intro vamp), while the unique-degree test (C vs C#) and the last 4 s (G bass and G chroma) already pointed at G. The old rule required *whole-song bass* to agree before overturning D; the body bass is a D pedal, so the stretch stayed D and was marked “unresolved; kept the profile winner.” That is first-chord / dominant-pedal over-trust (technique 4), not a read-rate or Cal 003 threshold issue.
