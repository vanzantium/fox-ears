# P4 cherry-pick (2026-11-21)

**Date:** Saturday 2026-11-21, America/Dawson_Creek (UTC-7)
**Branch:** `p4/sonar-cherry-pick`, cut from `p3b/click-picker-tuning` at `6ad231c` (PR #11). It stacks on PR #11.
**Source:** the P4 "Sonar Form" pack (`fox-ears-p4-vs-6ad231c.diff`, unsigned notes, uploaded by Taylor). It applied cleanly to `6ad231c` with `patch -p2`.
**Status:** not merged. Merging waits for Taylor's explicit go-ahead.

## Taken

| Piece | Files | Notes |
|---|---|---|
| `/maps` Outlet fix | `app/src/routes/maps.tsx` | Fixes a real bug: `/maps/$id` kept showing the list, so a saved map never opened. |
| Answer-key scorer and template | `harness/score_answer_key.py`, `harness/requirements-scoring.txt`, `docs/answer-key-template.json`, `docs/answer-key-guide.md` | Uses mir_eval (MIT) and gives STRICT/FORGIVEN scores. A score is SOLID only when `"answer_source": "taylor"`. Its self-test runs in CI. |
| Licence labels and credits | `app/src/lib/research/capabilities.ts` (`license_class`), `NOTICE.md`, `PROVENANCE.md` | The Chew, Herremans & Chew, Müller and Wattenberg methods are credited. `sonofield.ts` and its Max Konyi / SonoField credit are unchanged, and the feeling table stays out of anything sold. |
| Lydian/Phrygian mode tags | `app/src/lib/hearing/keyResolve.ts` | Taken because they leave existing results unchanged. They never fired on the 14 songs or Keep Moving, and `key`, `key_note` and the mode tags are byte-identical. They are SOFT text and never change the major/minor call. |
| Sonar layer | `sonar.ts`, `motif.ts`, `spiral.ts`, `barBrief.ts`, `vec.ts`, `viz/sonar.ts`, `SonarView.tsx`, `digest.ts`, `MapPanel.tsx`, `score.ts`, `types.ts` | Writes the additive `chart.sonar` field (self-similarity letters, riff finder, tension ribbon, bar brief). **Labelled SOFT, EXPERIMENTAL and UNCALIBRATED.** The label appears in the code header, in the chart output (`status: "experimental-uncalibrated"` plus a `caveat` string), in the digest heading and in the Sonar tab. It runs after FORM and never feeds section boundaries. |
| Beat This! / All-In-One / vocal-separator adapters | `harness/candidates.py` | Taken because they are inert and optional. Each model is imported lazily, only when its subcommand is called. They are never run by default, add no app dependency and add nothing to `package.json`. Only the normaliser self-test (no models) runs in CI. No model has been run live yet. |
| Form-etude generator | `harness/make_form_etude.py`, `harness/requirements-etude.txt` | Optional and research-side only. |
| Tests | `app/scripts/p4-sonar.test.mjs` | Now asserts the experimental status and caveat. |

## Changed from the incoming pack

- Added `status: "experimental-uncalibrated"` and `caveat` to `chart.sonar`, plus a status block in the `sonar.ts` header.
- The digest heading now reads `SONAR (SOFT · EXPERIMENTAL · UNCALIBRATED)` and prints the caveat. The Sonar tab text says the same.
- README and RELEASE-NOTES now point to this branch, record the 15-song check and the Keep Moving miss, and describe the adapters as optional.
- `docs/p4-sonar-log-2026-11-21.md` is kept as received (it still names the suggested branch `p4/sonar-form`).

## Left out

- **SongFormer.** Not wrapped, because it loads MuQ weights under CC BY-NC 4.0. It is listed in the capability registry only as `license_class: "noncommercial"`, for private research use.
- **`docs/img/` screenshots** from the zip. They were not in the diff and aren't needed.
- **No model weights, no audio, and no app fetches to Hugging Face.**

## Checks (2026-11-21)

- `npm test`: **163 pass, 0 fail, 3 skipped** (166 total). `npm run typecheck` and `npm run build` are clean.
- `python3 harness/candidates.py self-test` OK. `harness/score_answer_key.py --self-test` OK (mir_eval venv).
- Harness: `calibration/run.mjs --sens 0.58 --tick-hz 60` with `FOX_REF=harness/reference-librosa-2026-11-14.json` on the 14 songs plus Keep Moving. The output JSON is **byte-identical** to the `6ad231c` run.
  - 14-song key 11/14 (SOFT, librosa stand-in). Tempo STRICT 10/14, FORGIVEN 10/14. Section total 137.
  - Keep Moving: D major (0.70); 98.9 BPM; A4 ≈ 432.1 Hz (applied, SOFT); 5 sections V/C/V/C/Outro at 0.0–24.5, 24.5–43.9, 43.9–99.8, 99.8–121.6, 121.6–154.0 s. All unchanged.

## Sonar on Keep Moving (why it stays experimental)

Truth (Taylor): D major, 96 BPM, A≈432, 5 sections V/C/V/C/Outro, with cuts at 24.5, 43.9, 99.8 and 121.6 s. FORM gets all of this right.

Sonar does not:

- **Letters:** `A A' A' B C A' B' C' D D D' D' E E' E' F`, 16 four-bar phrases, and no loop detected.
- **Agreement with FORM:** **0/4** cuts within one bar.
- **Nearest sonar changes:** 19.7, 39.1, 97.3 and 116.7 s. That is about 2 bars early on three cuts and 2.5 s early on the 99.8 s chorus.
- **Riff finder:** finds only the opening phrase repeat, at 10.0 s.

Keep Moving is a one-key song whose verse and chorus share the same chroma. Sonar listens to harmony only, so it can't hear the energy and vocal changes that FORM uses. Sonar's thresholds were tuned on synthetic frames and one planted etude. Until it has been calibrated on real songs with Taylor's answer key, don't read its letters as section roles.
