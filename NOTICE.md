# Notice

Fox Ears is a private project. All rights reserved by Taylor Van Zant, except for the third-party material named below. See also [PROVENANCE.md](PROVENANCE.md).

## Max Konyi / SonoField

`app/src/lib/hearing/sonofield.ts` includes a degree “feeling” table (`DEGREE_MAP` and related interpretive labels: strings such as “home · rest · ground”, “bitter · urgent · biting”, “alien · electric · polar void”). That table is believed to derive from Max Konyi’s SonoField material. It is included here for provenance, not as a claim of ownership or licence. Credit: Max Konyi, SonoField. Do not treat those feeling strings as measurements; the file already labels them interpretive.

Krumhansl–Kessler major and minor key profiles also appear in that file as `MAJOR_PROFILE` / `MINOR_PROFILE`. Those are standard published profiles, distinct from the SonoField feeling table.

## Methods reimplemented in P4 (2026-11-21)

No code was copied for these; they are native reimplementations from the published descriptions. They are named here for credit.

- **Spiral array:** Elaine Chew, "Towards a Mathematical Model of Tonality" (MIT PhD thesis, 2000) and *Mathematical and Computational Modeling of Tonality* (Springer, 2014).
- **Tension ribbons** (cloud diameter, cloud momentum, tensile strain): Dorien Herremans and Elaine Chew, "Tension ribbons: Quantifying and visualising tonal tension" (TENOR 2016). Used in `app/src/lib/hearing/spiral.ts`.
- **Path enhancement** of self-similarity matrices: Meinard Müller, *Fundamentals of Music Processing* (Springer, 2015/2021), ch. 4. Used in `app/src/lib/hearing/sonar.ts`.
- **Arc diagrams** of repetition: Martin Wattenberg, "The Shape of Song" (2001) and "Arc Diagrams" (IEEE InfoVis 2002). Used in `app/src/lib/viz/sonar.ts`.

## Optional research tools (not bundled)

`harness/score_answer_key.py` uses **mir_eval** (MIT). `harness/candidates.py` can call **beat-this** (MIT code and published weights, per the CPJKU README), **allin1** (MIT code; weights on Hugging Face, licence to confirm at the source), and **audio-separator** (MIT; model licences vary per checkpoint). None of them is a dependency of the app. **SongFormer** is not wrapped because it loads MuQ weights under CC BY-NC 4.0.
