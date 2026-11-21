#!/usr/bin/env python3
"""Score Fox Ears (and optional research candidates) against an answer key.

P4, 2026-11-21. Uses mir_eval (MIT) for the standard MIR metrics, so Fox Ears
numbers read the same way the field reports them:

  tempo     STRICT (±4%) and FORGIVEN (also ½, 2×, 2:3, 3:2) — Fox Ears' own rules
  key       mir_eval.key.weighted_score (1 exact, 0.5 fifth, 0.3 relative, 0.2 parallel)
  beats     mir_eval.beat.f_measure (±70 ms)
  downbeats mir_eval.beat.f_measure on bar starts (Fox Ears: sonar bars)
  sections  mir_eval.segment.detection hit rate at ±0.5 s and ±3 s, and pairwise label F
            — for FORM (chart.sections) and, separately, for SONAR (phrase letters)
  chords    mir_eval.chord.evaluate: root, majmin, mirex

Inputs
  --key   answer key JSON (docs/answer-key-template.json). Every field but title is optional.
  --fox   a Fox Ears chart JSON, or a whole hearing-map JSON (its "chart" is used).
  --candidate  zero or more candidate JSONs from harness/candidates.py (beats, downbeats, segments).
  --json  write the scores as JSON too.

Labels: a score is SOLID only when the answer key is Taylor's own
("answer_source": "taylor"); otherwise every number stays SOFT. The scorer
never edits anything.

  pip install -r harness/requirements-scoring.txt
  python harness/score_answer_key.py --key my-song.answer.json --fox my-song.map.json
  python harness/score_answer_key.py --self-test
"""
import argparse
import json
import sys

try:
    import numpy as np
    import mir_eval
except ImportError:  # pragma: no cover - environment message
    sys.exit("needs numpy and mir_eval: pip install -r harness/requirements-scoring.txt")

PCS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def tempo_scores(est, ref):
    if not est or not ref:
        return None
    strict = abs(est - ref) <= 0.04 * ref
    forgiven = strict or any(abs(est - ref * f) <= 0.04 * ref * f for f in (0.5, 2.0, 2 / 3, 3 / 2))
    return {"estimate": est, "reference": ref, "strict": strict, "forgiven": forgiven}


def key_score(est, ref):
    if not est or not ref:
        return None
    return {"estimate": est, "reference": ref, "weighted": float(mir_eval.key.weighted_score(ref, est))}


def beat_f(est, ref):
    if not est or not ref:
        return None
    r = mir_eval.beat.trim_beats(np.asarray(sorted(ref), float))
    e = mir_eval.beat.trim_beats(np.asarray(sorted(est), float))
    if len(r) == 0 or len(e) == 0:
        return None
    return {"f_measure": float(mir_eval.beat.f_measure(r, e)), "n_ref": int(len(r)), "n_est": int(len(e))}


def intervals(segs, start_key, end_key, label_key):
    iv = np.asarray([[float(s[start_key]), float(s[end_key])] for s in segs], float)
    labels = [str(s.get(label_key, "")) for s in segs]
    return iv, labels


def segment_scores(est_segs, ref_segs, est_label="label", ref_label="letter"):
    """est_segs/ref_segs: dicts with start/end seconds and a label."""
    if not est_segs or not ref_segs:
        return None
    ref_iv, ref_lab = intervals(ref_segs, "start", "end", ref_label)
    est_iv, est_lab = intervals(est_segs, "start", "end", est_label)
    # mir_eval wants both annotations to start at 0 and cover the same span;
    # the padding is labelled "__pad" so it cannot match a real label.
    lo = 0.0
    hi = max(ref_iv[-1, 1], est_iv[-1, 1])
    ref_iv, ref_lab = mir_eval.util.adjust_intervals(ref_iv, ref_lab, t_min=lo, t_max=hi,
                                                     start_label="__pad", end_label="__pad")
    est_iv, est_lab = mir_eval.util.adjust_intervals(est_iv, est_lab, t_min=lo, t_max=hi,
                                                     start_label="__pad", end_label="__pad")
    out = {"n_ref": len(ref_segs), "n_est": len(est_segs)}
    for w in (0.5, 3.0):
        p, r, f = mir_eval.segment.detection(ref_iv, est_iv, window=w, trim=True)
        out[f"hit_{w:g}s"] = {"precision": round(float(p), 3), "recall": round(float(r), 3), "f": round(float(f), 3)}
    p, r, f = mir_eval.segment.pairwise(ref_iv, ref_lab, est_iv, est_lab)
    out["pairwise_labels"] = {"precision": round(float(p), 3), "recall": round(float(r), 3), "f": round(float(f), 3)}
    return out


def harte(chord):
    """Fox Ears ChordEvent -> Harte label (root:quality[/bass])."""
    root = chord.get("root") or ""
    q = chord.get("quality") or "maj"
    if root not in PCS:
        return "X"
    return f"{root}:{'min' if q.startswith('min') else 'maj'}"


def chord_scores(est_chords, ref_chords):
    if not est_chords or not ref_chords:
        return None
    ref_iv = np.asarray([[c["t_start"], c["t_end"]] for c in ref_chords], float)
    ref_lab = [c["label"] for c in ref_chords]
    # Fox Ears chord windows can overlap; each event holds until the next one starts.
    ev = sorted(est_chords, key=lambda c: c["t_ms"])
    rows, est_lab = [], []
    for i, c in enumerate(ev):
        t0 = c["t_ms"] / 1000.0
        t1 = (c["t_ms"] + c["dur_ms"]) / 1000.0
        if i + 1 < len(ev):
            t1 = ev[i + 1]["t_ms"] / 1000.0
        if t1 > t0:
            rows.append([t0, t1])
            est_lab.append(harte(c))
    if not rows:
        return None
    est_iv = np.asarray(rows, float)
    # Fox Ears chord events can leave gaps; fill them with N so the timelines match.
    est_iv, est_lab = mir_eval.util.adjust_intervals(est_iv, est_lab, ref_iv.min(), ref_iv.max(),
                                                     mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    scores = mir_eval.chord.evaluate(ref_iv, ref_lab, est_iv, est_lab)
    return {k: round(float(scores[k]), 3) for k in ("root", "majmin", "mirex")}


def fox_estimates(fox):
    chart = fox.get("chart", fox)
    sections = [{"start": s["t_start_ms"] / 1000.0, "end": s["t_end_ms"] / 1000.0,
                 "label": s["label"].rstrip("'")} for s in chart.get("sections", [])]
    sonar = chart.get("sonar") or {}
    phrases = [{"start": p["t_start_ms"] / 1000.0, "end": p["t_end_ms"] / 1000.0,
                "label": p["letter"].rstrip("'")} for p in sonar.get("phrases", [])]
    # merge consecutive phrases with the same letter into one segment
    merged = []
    for p in phrases:
        if merged and merged[-1]["label"] == p["label"]:
            merged[-1]["end"] = p["end"]
        else:
            merged.append(dict(p))
    key = chart.get("key")
    return {
        "tempo": chart.get("tempo_bpm"),
        "key": f"{key['tonic']} {key['mode']}" if key else None,
        "beats": [b / 1000.0 for b in chart.get("beats", [])],
        "downbeats": [b["t_start_ms"] / 1000.0 for b in sonar.get("bars", [])],
        "form": sections,
        "sonar": merged,
        "chords": chart.get("chords", []),
    }


def label_for(key):
    """SOLID only for Taylor's own answer key (answer_source == "taylor")."""
    return "SOLID" if str(key.get("answer_source", "")).lower() == "taylor" else "SOFT"


def score(key, fox, candidates=()):
    est = fox_estimates(fox)
    ref_secs = key.get("sections") or []
    ref_segs = [{"start": s["t_start"], "end": s["t_end"], "letter": s.get("letter") or s.get("label", "")} for s in ref_secs]
    out = {
        "schema": "fox-ears-answer-key-score-1",
        "title": key.get("title", ""),
        "label": label_for(key),
        "fox": {
            "tempo": tempo_scores(est["tempo"], key.get("tempo_bpm")),
            "key": key_score(est["key"], key.get("key")),
            "beats": beat_f(est["beats"], key.get("beats")),
            "downbeats": beat_f(est["downbeats"], key.get("downbeats")),
            "form": segment_scores(est["form"], ref_segs),
            "sonar": segment_scores(est["sonar"], ref_segs),
            "chords": chord_scores(est["chords"], key.get("chords")),
        },
        "candidates": [],
    }
    for c in candidates:
        segs = [{"start": s["start"], "end": s["end"], "label": s.get("label", "")} for s in c.get("segments", [])]
        out["candidates"].append({
            "tool": c.get("tool"),
            "license": c.get("license"),
            "tempo": tempo_scores(c.get("tempo_bpm"), key.get("tempo_bpm")),
            "beats": beat_f(c.get("beats"), key.get("beats")),
            "downbeats": beat_f(c.get("downbeats"), key.get("downbeats")),
            "sections": segment_scores(segs, ref_segs),
        })
    return out


def fmt(x):
    if x is None:
        return "—"
    if isinstance(x, dict) and "f" in x:
        return f"P {x['precision']:.2f} R {x['recall']:.2f} F {x['f']:.2f}"
    return json.dumps(x)


def report(s):
    f = s["fox"]
    lines = [f"{s['title']} — {s['label']} (an answer key is truth only for the recording it was made from)"]
    t = f["tempo"]
    if t:
        lines.append(f"tempo     {t['estimate']} vs {t['reference']} BPM  strict {t['strict']}  forgiven {t['forgiven']}")
    else:
        lines.append("tempo     —")
    k = f["key"]
    lines.append(f"key       {'—' if not k else str(k['estimate']) + ' vs ' + str(k['reference']) + '  weighted ' + format(k['weighted'], '.2f')}")
    for name in ("beats", "downbeats"):
        b = f[name]
        lines.append(f"{name:<9} {'—' if not b else 'F ' + format(b['f_measure'], '.3f') + '  (' + str(b['n_est']) + ' est / ' + str(b['n_ref']) + ' ref)'}")
    for name in ("form", "sonar"):
        g = f[name]
        if not g:
            lines.append(f"{name:<9} —")
            continue
        lines.append(f"{name:<9} {g['n_est']} segs vs {g['n_ref']} ref · ±0.5 s {fmt(g['hit_0.5s'])} · ±3 s {fmt(g['hit_3s'])} · labels {fmt(g['pairwise_labels'])}")
    c = f["chords"]
    lines.append(f"chords    {'—' if not c else 'root ' + format(c['root'], '.3f') + '  majmin ' + format(c['majmin'], '.3f') + '  mirex ' + format(c['mirex'], '.3f')}")
    for cand in s["candidates"]:
        lines.append(f"candidate {cand['tool']} [{cand.get('license')}]: beats {fmt(cand['beats'] and round(cand['beats']['f_measure'], 3))} downbeats {fmt(cand['downbeats'] and round(cand['downbeats']['f_measure'], 3))} sections {fmt(cand['sections'] and cand['sections']['hit_3s'])}")
    return "\n".join(lines)


def self_test():
    """A planted 4-section song: Fox reads tempo/key right, one section boundary 1 s late."""
    key = {"title": "self-test", "answer_source": "synthetic", "tempo_bpm": 120, "key": "C major",
           "beats": [i * 0.5 for i in range(128)], "downbeats": [i * 2.0 for i in range(32)],
           "sections": [{"t_start": 0, "t_end": 16, "letter": "A"}, {"t_start": 16, "t_end": 32, "letter": "B"},
                        {"t_start": 32, "t_end": 48, "letter": "A"}, {"t_start": 48, "t_end": 64, "letter": "B"}],
           "chords": [{"t_start": i * 2.0, "t_end": i * 2.0 + 2.0, "label": "C:maj" if i % 2 == 0 else "G:maj"} for i in range(32)]}
    fox = {"chart": {"tempo_bpm": 121, "key": {"tonic": "C", "mode": "major"},
                     "beats": [i * 500 + 20 for i in range(128)],
                     "sections": [{"t_start_ms": 0, "t_end_ms": 17000, "label": "A"}, {"t_start_ms": 17000, "t_end_ms": 32000, "label": "B"},
                                  {"t_start_ms": 32000, "t_end_ms": 48000, "label": "A'"}, {"t_start_ms": 48000, "t_end_ms": 64000, "label": "B'"}],
                     "chords": [{"t_ms": i * 2000, "dur_ms": 2000, "root": "C" if i % 2 == 0 else "G", "quality": "maj"} for i in range(32)],
                     "sonar": {"bars": [{"t_start_ms": i * 2000} for i in range(32)],
                               "phrases": [{"t_start_ms": i * 8000, "t_end_ms": i * 8000 + 8000, "letter": "AABBAABB"[i]} for i in range(8)]}}}
    s = score(key, fox)
    f = s["fox"]
    assert s["label"] == "SOFT"
    assert f["tempo"]["strict"] and f["key"]["weighted"] == 1.0
    assert f["beats"]["f_measure"] > 0.99 and f["downbeats"]["f_measure"] > 0.99
    assert f["form"]["hit_3s"]["f"] == 1.0 and f["form"]["hit_0.5s"]["f"] < 1.0  # the 1 s late cut
    assert f["sonar"]["hit_0.5s"]["f"] == 1.0 and f["sonar"]["pairwise_labels"]["f"] == 1.0
    assert f["chords"]["root"] == 1.0
    print("score_answer_key self-test OK")


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", required=True)
    ap.add_argument("--fox", required=True)
    ap.add_argument("--candidate", action="append", default=[])
    ap.add_argument("--json")
    a = ap.parse_args()
    key = json.load(open(a.key))
    fox = json.load(open(a.fox))
    cands = [json.load(open(p)) for p in a.candidate]
    s = score(key, fox, cands)
    print(report(s))
    if a.json:
        with open(a.json, "w") as f:
            json.dump(s, f, indent=2)


if __name__ == "__main__":
    main()
