# Answer key guide (P4, 2026-11-21)

An answer key is the truth for **one recording**. With it, `harness/score_answer_key.py` scores Fox Ears, and any outside candidate, the way the music-information-retrieval field reports results (mir_eval). Scores turn **SOLID** only when the key says `"answer_source": "taylor"`. Anything else, such as the synthetic etude, stays **SOFT**.

Copy `answer-key-template.json` and fill in only what you know. Every field except `title` is optional, and empty lists are skipped.

| Field | What to put | Scored as |
|---|---|---|
| `tempo_bpm` | The BPM you play it at | STRICT ±4%, FORGIVEN also ½, 2×, 2:3, 3:2 |
| `key` | `"D major"`, `"E minor"` (tonic then mode) | mir_eval weighted: exact 1, fifth 0.5, relative 0.3, parallel 0.2 |
| `tuning_a4_hz` | 440, 432… | Reported only |
| `sections` | Start and end seconds, your name for it, and a **letter**: the same letter for parts that repeat (A = verse riff, B = chorus) | Boundary hit rate at ±0.5 s and ±3 s, plus pairwise label F. FORM and SONAR are scored separately |
| `downbeats` | Bar-start times in seconds | F-measure ±70 ms (Fox: sonar bars) |
| `beats` | Every beat, if you have them (a DAW tap track exports this) | F-measure ±70 ms |
| `chords` | Harte labels: `C:maj`, `A:min`, `G:7`, `D:maj/3` (the bass on the 3rd) | mir_eval root, majmin, mirex |
| `riffs` | A riff's first time and where it comes back, including transposed returns | Not scored yet. Kept for the riff finder |

The quickest useful key is **tempo, key and section starts with letters**. That alone scores the tempo, key, FORM and SONAR layers. Chords and downbeats can come later, from your tabs or MIDI.

Tools that make this faster:
- **Your DAW:** tap tempo, markers at section starts, then export marker times.
- **Sonic Visualiser** (free, GPL): add a "Time Instants" layer, tap along, and export as CSV. Use it as the annotation workstation only; it is not part of Fox Ears.

```bash
pip install -r harness/requirements-scoring.txt
python harness/score_answer_key.py --key keep-moving.answer.json --fox keep-moving.map.json --json keep-moving.score.json
# with an outside candidate (see harness/candidates.py):
python harness/score_answer_key.py --key keep-moving.answer.json --fox keep-moving.map.json --candidate keep-moving.beat-this.json
```

`--fox` takes either the JSON the app downloads (the whole map) or a chart. The scorer never edits the map.
