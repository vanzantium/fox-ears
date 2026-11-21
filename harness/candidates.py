#!/usr/bin/env python3
"""Research-side candidate generators (P4, 2026-11-21).

Runs one outside model on one audio file and writes a normalised, SOFT
"candidate" JSON that harness/score_answer_key.py can score next to Fox Ears.
This is the "second independent method" lane: candidates never feed the
browser app and never overwrite a Fox Ears reading (measure once, hear many
times; no second ear inside the app).

  beat-this   Beat This! (CPJKU, ISMIR 2024)   beats + downbeats
              code MIT, published weights MIT (per the CPJKU README)
  allin1      All-In-One (WASPAA 2023)         beats, downbeats, BPM, labelled sections
              code MIT; weights on Hugging Face (taejunkim) — confirm their licence there
  vocals      python-audio-separator + Kim's Mel-Band RoFormer vocals model
              tool MIT; model card reports MIT — confirm on the card; writes a vocal stem

NOT RUN in the build environment that wrote this file: model hosts were
blocked there, so only the normalisers below were tested (--self-test). The
first live run is on Taylor's machine. Each tool runs in its own venv:

  python -m venv .venv-beatthis && .venv-beatthis/bin/pip install beat-this soundfile
  .venv-beatthis/bin/python harness/candidates.py beat-this song.wav --out song.beat-this.json
  .venv-allin1/bin/pip install allin1      # also needs demucs + NATTEN; see allin1's README
  .venv-sep/bin/pip install "audio-separator[cpu]"

SongFormer (stronger structure model) is deliberately not wrapped: its code is
CC BY 4.0 but it loads MuQ weights that are CC BY-NC 4.0 (non-commercial).
Fine for private use if Taylor chooses it; it should be added knowingly, not
by default.
"""
import argparse
import json
import sys
from datetime import datetime, timezone

LICENSES = {
    "beat-this": {"code": "MIT", "weights": "MIT (CPJKU README; verify)", "class": "permissive"},
    "allin1": {"code": "MIT", "weights": "verify on huggingface.co/taejunkim/allinone", "class": "unverified-weights"},
    "vocals": {"code": "MIT (python-audio-separator)", "weights": "MIT per model card (verify)", "class": "permissive"},
}


def candidate(tool, version, audio, **fields):
    out = {
        "schema": "fox-ears-candidate-1",
        "label": "SOFT",
        "tool": tool,
        "version": version,
        "license": LICENSES[tool],
        "audio": audio,
        "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "outside-model candidate; scored beside Fox Ears, never merged into it",
    }
    out.update(fields)
    return out


def _floats(xs):
    return [round(float(x), 4) for x in xs]


def tempo_from_beats(beats):
    if len(beats) < 3:
        return None
    ibis = sorted(b - a for a, b in zip(beats, beats[1:]) if b > a)
    med = ibis[len(ibis) // 2]
    return round(60.0 / med, 2) if med > 0 else None


def normalise_beat_this(beats, downbeats, audio, version):
    b = _floats(beats)
    return candidate("beat-this", version, audio, beats=b, downbeats=_floats(downbeats), tempo_bpm=tempo_from_beats(b))


def normalise_allin1(result, audio, version):
    """result: an allin1 AnalysisResult (or a dict with the same fields)."""
    get = (lambda k: result[k]) if isinstance(result, dict) else (lambda k: getattr(result, k))
    segs = []
    for s in get("segments"):
        sg = (lambda k: s[k]) if isinstance(s, dict) else (lambda k: getattr(s, k))
        segs.append({"start": round(float(sg("start")), 3), "end": round(float(sg("end")), 3), "label": str(sg("label"))})
    return candidate("allin1", version, audio, tempo_bpm=get("bpm"), beats=_floats(get("beats")),
                     downbeats=_floats(get("downbeats")), segments=segs)


def run_beat_this(audio, checkpoint):
    from beat_this.inference import File2Beats  # MIT; pip install beat-this
    import importlib.metadata as md
    f2b = File2Beats(checkpoint_path=checkpoint, device="cpu", dbn=False)
    beats, downbeats = f2b(audio)  # order per the beat_this README
    return normalise_beat_this(beats, downbeats, audio, f"beat-this {md.version('beat-this')} ({checkpoint})")


def run_allin1(audio):
    import allin1  # MIT code; weights from Hugging Face
    import importlib.metadata as md
    res = allin1.analyze(audio, device="cpu")
    return normalise_allin1(res, audio, f"allin1 {md.version('allin1')}")


def run_vocals(audio, out_dir, model):
    from audio_separator.separator import Separator  # MIT
    import importlib.metadata as md
    sep = Separator(output_dir=out_dir, output_single_stem="Vocals")
    sep.load_model(model_filename=model)
    files = sep.separate(audio)
    return candidate("vocals", f"audio-separator {md.version('audio-separator')} ({model})", audio, stems=files)


def self_test():
    """Normalisers only — no models, no network."""
    c = normalise_beat_this([0.5, 1.0, 1.5, 2.0], [0.5, 2.0], "x.wav", "beat-this test")
    assert c["tempo_bpm"] == 120.0 and c["downbeats"] == [0.5, 2.0] and c["label"] == "SOFT"
    fake = {"bpm": 96, "beats": [0.1, 0.725], "downbeats": [0.1],
            "segments": [{"start": 0.0, "end": 9.9, "label": "intro"}, {"start": 9.9, "end": 30.1, "label": "verse"}]}
    a = normalise_allin1(fake, "x.wav", "allin1 test")
    assert a["segments"][1] == {"start": 9.9, "end": 30.1, "label": "verse"} and a["tempo_bpm"] == 96
    assert a["license"]["class"] == "unverified-weights"
    json.dumps(a)
    print("candidates self-test OK")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tool", choices=["beat-this", "allin1", "vocals", "self-test"])
    ap.add_argument("audio", nargs="?")
    ap.add_argument("--out")
    ap.add_argument("--checkpoint", default="final0", help="beat-this checkpoint: final0, small0, ...")
    ap.add_argument("--stem-dir", default="stems")
    ap.add_argument("--model", default="vocals_mel_band_roformer.ckpt", help="audio-separator model file")
    a = ap.parse_args()
    if a.tool == "self-test":
        self_test()
        return
    if not a.audio:
        sys.exit("audio path required")
    try:
        if a.tool == "beat-this":
            c = run_beat_this(a.audio, a.checkpoint)
        elif a.tool == "allin1":
            c = run_allin1(a.audio)
        else:
            c = run_vocals(a.audio, a.stem_dir, a.model)
    except ImportError as e:
        sys.exit(f"{a.tool}: not installed in this Python ({e}). See the header of harness/candidates.py.")
    text = json.dumps(c, indent=2)
    if a.out:
        with open(a.out, "w") as f:
            f.write(text)
    print(text if not a.out else f"wrote {a.out}")


if __name__ == "__main__":
    main()
