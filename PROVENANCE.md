# Provenance

This repository is **private**. All rights reserved by Taylor Van Zant.

## Research line

- `research/fox_ears_v0_1.py` — earlier Fox Ears runtime (history).
- `research/fox_ears_v0_2_binding_grammar.py` — canonical fox-ears-0.2 binding grammar and Calibration 003 generator.
- `research/music_mode.py` — related scaffold for an organism "music mode"; not the canonical runtime.

These arrived with the Fox Ears Drive folder as Python sources used in the garden's research chain.

## App line (v1–v4 zips)

The web app in `app/` is from `fox-ears-review-v4.zip` (dated 2026-09-19). Earlier zips in the Drive folder, not imported here, were:

- `fox-ears-review.zip` (v1)
- `fox-ears-review-v2.zip` (2026-08-22)
- `fox-ears-review-v3.zip` (2026-08-22)
- `fox-ears-review-v3 (1).zip` — same contents as v3 (duplicate)

Taylor made the v1 to v4 zips with AI help, which he believes was Grok or ChatGPT (his words, 2026-11-14). There is no licence file in those zips. Until Taylor says otherwise, treat the code as all rights reserved by Taylor Van Zant. Do not publish, relicence, or list it for sale.

## Harness and logs

The calibration harness and the 2026-11-14 build and calibration log were written by Riven during the first box bring-up. They measure the app and research runtimes; they do not change the original sources. Baseline JSON in `harness/` is analysis of Taylor's songs, not the audio itself. The songs stay in Drive.

## Calibration 003 key

The locked key, inspector output, and self-check script are held back on the box at `/workspace/fox-ears/cal003-key/` and are not part of this repository. See the README.

## Third-party interpretive material

`app/src/lib/hearing/sonofield.ts` contains a degree “feeling” table that is believed to derive from Max Konyi’s SonoField material. It is credited in [NOTICE.md](NOTICE.md). The table was not removed from the code. Krumhansl–Kessler key profiles in the same file are a separate, published reference.

Keep that table out of anything sold.

## P4 Sonar Form (2026-11-21)

The P4 pass arrived as `fox-ears-p4-sonar-2026-11-21.zip`, `fox-ears-p4-vs-6ad231c.diff` and `p4-sonar-log-2026-11-21.md`. Taylor uploaded them to the Fox Ears Drive folder on 2026-11-21. The notes are unsigned, and Drive lists Taylor as the uploader. The diff was applied to `6ad231c` (P3b) and cherry-picked into branch `p4/sonar-cherry-pick`. See [`docs/p4-cherry-pick-2026-11-21.md`](docs/p4-cherry-pick-2026-11-21.md). The spiral array, tension ribbons, path enhancement and arc diagrams are native reimplementations of published methods, credited in [NOTICE.md](NOTICE.md). No third-party code or model weights were copied in. `sonofield.ts` is unchanged by P4.
