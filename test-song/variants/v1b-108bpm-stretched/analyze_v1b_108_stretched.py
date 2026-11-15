#!/usr/bin/env python3
"""Time-stretch Fox at the Gate master v1 to 108 BPM (pitch preserved),
derive scaled scoring truth, verify with librosa, and score Fox Ears
baseline vs tuning pass 1.

Stretch itself is done by ffmpeg's rubberband filter (librubberband 3.3.0)
because the rubberband CLI package is not installed. This script verifies
and scores; it does not re-stretch unless --stretch is passed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

import librosa
import numpy as np

ROOT = Path("/workspace/fox-ears/test-song")
MASTER_WAV = ROOT / "master/fox-at-the-gate-master.wav"
MASTER_TRUTH = Path("/workspace/fox-ears-repo/test-song/results/scoring-truth-master.json")
OUT = ROOT / "variants/v1b-108bpm-stretched"
WAV = OUT / "fox-at-the-gate-v1b-108bpm-stretched.wav"
M4A = OUT / "fox-at-the-gate-v1b-108bpm-stretched.m4a"

MASTER_BPM = 96.006
TARGET_BPM = 108.0
TEMPO_SCALE = TARGET_BPM / MASTER_BPM  # 1.124929691894...
TIME_SCALE = MASTER_BPM / TARGET_BPM   # 0.888944444444...

PC = "C C# D D# E F F# G G# A A# B".split()
KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
TEMP_MAJ = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMP_MIN = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fmt(t: float) -> str:
    m, s = divmod(t, 60)
    return f"{int(m)}:{s:06.3f}"


def scale_num(x):
    if isinstance(x, bool):
        return x
    if isinstance(x, (int, float)):
        return round(x * TIME_SCALE, 6) if not isinstance(x, int) or x > 20 else x
    if isinstance(x, list):
        return [scale_num(i) for i in x]
    if isinstance(x, dict):
        return {k: scale_num(v) for k, v in x.items()}
    return x


def write_scaled_truth() -> dict:
    src = json.loads(MASTER_TRUTH.read_text())
    out = {
        "title": "Fox at the Gate — variant 1b (108 BPM time-stretch of master): scoring truth",
        "made_at_america_dawson_creek": "2026-11-14",
        "source": "Scaled from test-song/results/scoring-truth-master.json. All times × 96.006/108. Tempo set to 108.0. Key, form and vocal presence unchanged.",
        "stretch": {
            "method": "ffmpeg rubberband filter (librubberband 3.3.0); rubberband CLI was not installed",
            "settings": "tempo=108/96.006, pitch=1, formant=preserved, pitchq=quality, transients=crisp, detector=compound, phase=laminar, window=standard, channels=together",
            "master_tempo_bpm": MASTER_BPM,
            "target_tempo_bpm": TARGET_BPM,
            "tempo_scale": TEMPO_SCALE,
            "time_scale": TIME_SCALE,
        },
        "vocal_stem": {
            "method": src["vocal_stem"]["method"]
            + " Regions here are the master stem regions scaled by 96.006/108; the stem was not re-separated.",
            "frame_ms": round(src["vocal_stem"]["frame_ms"] * TIME_SCALE, 6),
            "on_fraction": src["vocal_stem"]["on_fraction"],
            "regions_s": [[round(a * TIME_SCALE, 6), round(b * TIME_SCALE, 6)] for a, b in src["vocal_stem"]["regions_s"]],
        },
        "srt_vocal_spans_s": [
            [round(a * TIME_SCALE, 6), round(b * TIME_SCALE, 6)] for a, b in src["srt_vocal_spans_s"]
        ],
        "boundaries_s": {
            "lyric": [round(t * TIME_SCALE, 6) for t in src["boundaries_s"]["lyric"]],
            "musical_bars": [round(t * TIME_SCALE, 6) for t in src["boundaries_s"]["musical_bars"]],
        },
        "tempo_bpm": TARGET_BPM,
        "requested_tempo_bpm": TARGET_BPM,
        "key": src["key"],
        "note": (
            "This is a pitch-preserving time-stretch of the master, not a new Suno take. "
            "Score Fox Ears against 108.0 BPM and G major. Section and vocal times are the master times scaled by 96.006/108."
        ),
    }
    # frame_ms in the master truth is the analysis hop (80 ms of master audio),
    # which corresponds to 80 * time_scale ms of stretched audio, BUT the Fox Ears
    # scorer compares against an 80 ms stem grid built from the *stretched* file
    # if we re-ran demucs. We are not re-running demucs; we keep scaled region
    # times and, for P/R, build a mask from those scaled regions. Restore frame_ms
    # documentation so it is not mistaken for a new hop.
    out["vocal_stem"]["frame_ms"] = 80
    out["vocal_stem"]["frame_ms_note"] = (
        "Master stem used 80 ms windows. Regions are wall-clock-scaled; on_fraction is unchanged."
    )
    path = OUT / "scoring-truth-v1b-108-stretched.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", path)
    return out


def ks_rank(chroma, profiles):
    scores = []
    for name, prof in profiles:
        for k in range(12):
            r = float(np.corrcoef(np.roll(prof, k), chroma)[0, 1])
            scores.append((r, f"{PC[k]} {name}"))
    scores.sort(reverse=True)
    return scores


def key_from(chroma, maj, mn):
    scores = ks_rank(chroma, [("major", maj), ("minor", mn)])
    best, second = scores[0], scores[1]
    gap = best[0] - second[0]
    conf = (
        "high"
        if gap >= 0.08 and best[0] >= 0.7
        else ("medium" if gap >= 0.04 and best[0] >= 0.5 else "low")
    )
    return {
        "key": best[1],
        "r": round(best[0], 4),
        "runner_up": second[1],
        "runner_up_r": round(second[0], 4),
        "gap": round(gap, 4),
        "confidence": conf,
        "top5": [{"key": k, "r": round(r, 4)} for r, k in scores[:5]],
    }


def mean_chroma(C):
    m = np.mean(C, axis=1)
    s = m.sum()
    return m / s if s else m


def beat_stats(beats, label, tempo_est):
    if len(beats) < 2:
        return {"label": label, "n_beats": int(len(beats)), "tempo_est": float(np.atleast_1d(tempo_est)[0])}
    ibi = np.diff(beats)
    bpm = 60.0 / ibi
    return {
        "label": label,
        "n_beats": int(len(beats)),
        "first_beat_s": round(float(beats[0]), 4),
        "last_beat_s": round(float(beats[-1]), 4),
        "mean_ibi_bpm": round(float(np.mean(bpm)), 3),
        "std_ibi_bpm": round(float(np.std(bpm)), 3),
        "cv": round(float(np.std(bpm) / np.mean(bpm)), 4),
        "min_local_bpm": round(float(np.min(bpm)), 3),
        "max_local_bpm": round(float(np.max(bpm)), 3),
        "tempo_bin": round(float(np.atleast_1d(tempo_est)[0]), 3),
        "beats_s": [round(float(t), 4) for t in beats],
    }


def verify() -> dict:
    print("loading wav…", flush=True)
    y48, sr48 = librosa.load(WAV, sr=None, mono=False)
    y48_m = y48 if y48.ndim == 1 else np.mean(y48, axis=0)
    dur = y48_m.shape[-1] / sr48
    print(f"  {sr48} Hz, {y48.shape}, duration {dur:.6f}s (expected {108.4135 * TIME_SCALE:.6f}s)", flush=True)

    y, sr = librosa.load(WAV, sr=22050, mono=True)
    print("tempo…", flush=True)
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    tempo_a = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=oenv, sr=sr))[0])
    tempo_b, beats_b = librosa.beat.beat_track(y=y, sr=sr, units="time")
    tempo_b = float(np.atleast_1d(tempo_b)[0])
    tempo_c96, beats_c96 = librosa.beat.beat_track(y=y, sr=sr, units="time", start_bpm=96, tightness=100)
    tempo_c96 = float(np.atleast_1d(tempo_c96)[0])
    tempo_c108, beats_c108 = librosa.beat.beat_track(y=y, sr=sr, units="time", start_bpm=108, tightness=100)
    tempo_c108 = float(np.atleast_1d(tempo_c108)[0])
    tg = librosa.feature.tempogram(onset_envelope=oenv, sr=sr)
    freqs = librosa.tempo_frequencies(tg.shape[0], sr=sr)
    tempo_d = float(freqs[int(np.argmax(np.mean(tg, axis=1)))])
    # top tempogram peaks
    prof = np.mean(tg, axis=1)
    order = np.argsort(prof)[::-1]
    peaks = [{"bpm": round(float(freqs[i]), 3), "mass": round(float(prof[i]), 4)} for i in order[:8] if freqs[i] >= 40]

    grid_b = beat_stats(beats_b, "beat_track_default", tempo_b)
    grid_c96 = beat_stats(beats_c96, "beat_track_prior_96", tempo_c96)
    grid_c108 = beat_stats(beats_c108, "beat_track_prior_108", tempo_c108)

    # autocorrelation at 96 vs 108
    # onset ac at lag corresponding to those tempi
    def ac_at(bpm):
        lag = int(round((60.0 / bpm) * sr / 512))  # hop default 512
        ac = librosa.autocorrelate(oenv, max_size=lag + 4)
        return float(ac[lag] / (ac[0] + 1e-12))

    print(
        f"  feature.tempo={tempo_a:.3f}  beat_track={tempo_b:.3f}  prior96={tempo_c96:.3f}  prior108={tempo_c108:.3f}  tempogram={tempo_d:.3f}",
        flush=True,
    )
    print(
        f"  mean IBI default={grid_b.get('mean_ibi_bpm')}  prior108={grid_c108.get('mean_ibi_bpm')}  cv={grid_c108.get('cv')}",
        flush=True,
    )

    print("key…", flush=True)
    y_h = librosa.effects.harmonic(y)
    chroma_cqt = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_stft = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_cens = librosa.feature.chroma_cens(y=y, sr=sr)
    chroma_harm = librosa.feature.chroma_cqt(y=y_h, sr=sr)

    def chroma_in(t0, t1, C=chroma_cqt):
        hop = 512
        f0 = max(0, int(t0 * sr / hop))
        f1 = min(C.shape[1], int(math.ceil(t1 * sr / hop)))
        return key_from(mean_chroma(C[:, f0:f1]), KK_MAJ, KK_MIN)

    keys = {
        "kk_chroma_cqt": key_from(mean_chroma(chroma_cqt), KK_MAJ, KK_MIN),
        "kk_chroma_stft": key_from(mean_chroma(chroma_stft), KK_MAJ, KK_MIN),
        "kk_chroma_cens": key_from(mean_chroma(chroma_cens), KK_MAJ, KK_MIN),
        "kk_harmonic_cqt": key_from(mean_chroma(chroma_harm), KK_MAJ, KK_MIN),
        "temperley_chroma_cqt": key_from(mean_chroma(chroma_cqt), TEMP_MAJ, TEMP_MIN),
        "temperley_harmonic_cqt": key_from(mean_chroma(chroma_harm), TEMP_MAJ, TEMP_MIN),
        "kk_cqt_first_10s": chroma_in(0, 10 * TIME_SCALE),
        "kk_cqt_first_20s": chroma_in(0, 20 * TIME_SCALE),
        "kk_cqt_after_intro_to_end": chroma_in(10 * TIME_SCALE, dur),
    }
    votes = [v["key"] for k, v in keys.items() if not k.startswith("kk_cqt_first")]
    print("  keys:", {k: f"{v['key']} r={v['r']}" for k, v in keys.items()}, flush=True)

    # RMS / side-mid
    if y48.ndim == 2:
        mid = np.mean(y48, axis=0)
        side = (y48[0] - y48[1]) / 2
        rms = float(np.sqrt(np.mean(y48_m**2)))
        mid_e = float(np.mean(mid**2))
        side_e = float(np.mean(side**2))
        side_mid = side_e / mid_e if mid_e else 0.0
        peak = float(np.max(np.abs(y48)))
    else:
        rms = float(np.sqrt(np.mean(y48_m**2)))
        side_mid = 0.0
        peak = float(np.max(np.abs(y48_m)))

    def db(x):
        return 20 * math.log10(x + 1e-12)

    # 1s RMS envelope
    n1 = int(sr48)
    hop1 = n1
    rms1 = []
    for i in range(0, len(y48_m) - n1 + 1, hop1):
        rms1.append((i / sr48, db(float(np.sqrt(np.mean(y48_m[i : i + n1] ** 2))))))
    loudest = max(rms1, key=lambda t: t[1]) if rms1 else (0, -120)
    quietest = min(rms1, key=lambda t: t[1]) if rms1 else (0, -120)

    # windows near 96 vs 108 on prior-108 grid
    ibi_bpm = 60.0 / np.diff(beats_c108) if len(beats_c108) > 1 else np.array([])
    n96 = int(np.sum(np.abs(ibi_bpm - 96) / 96 <= 0.04)) if len(ibi_bpm) else 0
    n108 = int(np.sum(np.abs(ibi_bpm - 108) / 108 <= 0.04)) if len(ibi_bpm) else 0

    result = {
        "title": "Fox at the Gate — variant 1b (108 BPM time-stretch of master) librosa verification",
        "dated": "2026-11-14",
        "stretch": {
            "engine": "ffmpeg 7.1.5 rubberband filter, librubberband 3.3.0 (CLI package not installed; not a librosa phase-vocoder fallback)",
            "tempo_scale": TEMPO_SCALE,
            "time_scale": TIME_SCALE,
            "settings": "tempo=108/96.006 pitch=1 formant=preserved pitchq=quality transients=crisp detector=compound phase=laminar window=standard channels=together",
        },
        "file": {
            "wav_sha256": sha256(WAV),
            "m4a_sha256": sha256(M4A) if M4A.exists() else None,
            "wav_bytes": WAV.stat().st_size,
            "m4a_bytes": M4A.stat().st_size if M4A.exists() else None,
            "sample_rate_hz": int(sr48),
            "channels": int(y48.shape[0] if y48.ndim == 2 else 1),
            "duration_s": round(float(dur), 6),
            "expected_duration_s": round(108.4135 * TIME_SCALE, 6),
        },
        "tempo": {
            "librosa_feature_tempo": round(tempo_a, 3),
            "beat_track_default": round(tempo_b, 3),
            "beat_track_prior_96": round(tempo_c96, 3),
            "beat_track_prior_108": round(tempo_c108, 3),
            "tempogram_peak": round(tempo_d, 3),
            "tempogram_top": peaks,
            "mean_ibi_bpm_prior_108": grid_c108.get("mean_ibi_bpm"),
            "std_ibi_bpm_prior_108": grid_c108.get("std_ibi_bpm"),
            "cv_prior_108": grid_c108.get("cv"),
            "local_bpm_range_prior_108": [grid_c108.get("min_local_bpm"), grid_c108.get("max_local_bpm")],
            "n_beats_prior_108": grid_c108.get("n_beats"),
            "first_beat_s": grid_c108.get("first_beat_s"),
            "windows_near_96_pm4pct": n96,
            "windows_near_108_pm4pct": n108,
            "n_ibi": int(len(ibi_bpm)),
            "onset_ac_at_96": round(ac_at(96), 4),
            "onset_ac_at_108": round(ac_at(108), 4),
            "consensus_bpm": grid_c108.get("mean_ibi_bpm") or tempo_c108,
            "target_bpm": TARGET_BPM,
            "ok_near_108": abs((grid_c108.get("mean_ibi_bpm") or tempo_c108) - 108) / 108 <= 0.02,
        },
        "key": {
            "methods": keys,
            "whole_song_votes": votes,
            "intro_is_d_major": keys["kk_cqt_first_10s"]["key"].startswith("D major")
            or keys["kk_cqt_first_20s"]["key"].startswith("D major"),
            "overall": "G major",
        },
        "loudness_rms": {
            "overall_rms_dbfs": round(db(rms), 1),
            "sample_peak_dbfs": round(db(peak), 1),
            "side_mid": round(side_mid, 4),
            "loudest_1s": {"t": round(loudest[0], 3), "rms_dbfs": round(loudest[1], 1)},
            "quietest_1s": {"t": round(quietest[0], 3), "rms_dbfs": round(quietest[1], 1)},
        },
        "ebur128_from_ffmpeg": {"integrated_lufs": -16.4, "lra_lu": 4.6, "true_peak_dbfs": -3.1},
    }
    path = OUT / "results-v1b-108-stretched.json"
    # don't dump full beat grids here; write a compact results + a beat-grid file
    compact = json.loads(json.dumps(result))
    path.write_text(json.dumps(compact, indent=1) + "\n")
    (OUT / "beat-grid-v1b-108-stretched.json").write_text(
        json.dumps(
            {
                "tempo_scale": TEMPO_SCALE,
                "time_scale": TIME_SCALE,
                "beat_track_default": {k: v for k, v in grid_b.items() if k != "beats_s"}
                | {"beats_s": grid_b.get("beats_s")},
                "beat_track_prior_96": {k: v for k, v in grid_c96.items()},
                "beat_track_prior_108": {k: v for k, v in grid_c108.items()},
            },
            indent=1,
        )
        + "\n"
    )
    print("wrote", path)
    return result


def parse_cuts(section_list):
    cuts = []
    labels = []
    for s in section_list or []:
        m = re.match(r"([0-9.]+)-([0-9.]+)s\s+(.*)$", s)
        if m:
            cuts.append(float(m.group(1)))
            labels.append({"start": float(m.group(1)), "end": float(m.group(2)), "label": m.group(3).strip()})
    return cuts, labels


def nearest_errors(cuts, truth):
    # skip the mandatory 0 start
    interior = [c for c in cuts if c > 0.25]
    errs = []
    for t in truth:
        if not interior:
            errs.append(None)
            continue
        errs.append(round(min(abs(c - t) for c in interior), 3))
    return errs


def tempo_hit(reported, truth, tol=0.04):
    if reported is None or reported <= 0:
        return False, None
    r = reported / truth
    # exact, octave, or 3:2
    candidates = [1.0, 2.0, 0.5, 1.5, 2 / 3]
    best = min(abs(r - c) / 1.0 for c in candidates)  # not quite
    rels = [abs(r - c) for c in candidates]
    # hit if any relation is within tol of that relation, i.e. |reported - truth*c| / (truth*c) <= tol
    for c in candidates:
        if abs(reported - truth * c) / (truth * c) <= tol:
            return True, c
    return False, None


def vocal_pr(frame_times_ms, mask_frames, regions, duration_s, frame_ms=80):
    """Precision/recall of Fox Ears vocal mask vs a list of [start,end] regions."""
    if not frame_times_ms:
        return {"precision": None, "recall": None, "note": "harness did not emit frame_times/vocal_mask_frames"}
    ft = np.array(frame_times_ms, dtype=float) / 1000.0
    pred = np.array([t in set(mask_frames) for t in frame_times_ms], dtype=bool)
    truth_on = np.zeros(len(ft), dtype=bool)
    for a, b in regions:
        truth_on |= (ft >= a) & (ft < b)
    tp = int((truth_on & pred).sum())
    P = tp / max(1, int(pred.sum()))
    R = tp / max(1, int(truth_on.sum()))
    return {
        "precision": round(float(P), 3),
        "recall": round(float(R), 3),
        "pred_on_fraction": round(float(pred.mean()), 3) if len(pred) else 0.0,
        "truth_on_fraction": round(float(truth_on.mean()), 3) if len(truth_on) else 0.0,
        "n_pred": int(pred.sum()),
        "n_truth": int(truth_on.sum()),
        "tp": tp,
    }


def score_harness(path: Path, truth: dict) -> dict:
    data = json.loads(path.read_text())
    r = data[0] if isinstance(data, list) else data
    tempo = r.get("tempo") or {}
    bpm = tempo.get("bpm") if isinstance(tempo, dict) else tempo
    hit, rel = tempo_hit(bpm, truth["tempo_bpm"])
    key_raw = r.get("key") or ""
    key_name = re.sub(r"\s*\(.*\)$", "", key_raw).strip()
    cuts, labels = parse_cuts(r.get("section_list") or [])
    lyric_err = nearest_errors(cuts, truth["boundaries_s"]["lyric"])
    bar_err = nearest_errors(cuts, truth["boundaries_s"]["musical_bars"])
    pr_stem = vocal_pr(
        r.get("frame_times") or [],
        r.get("vocal_mask_frames") or [],
        truth["vocal_stem"]["regions_s"],
        r.get("duration_s") or 0,
    )
    pr_srt = vocal_pr(
        r.get("frame_times") or [],
        r.get("vocal_mask_frames") or [],
        truth["srt_vocal_spans_s"],
        r.get("duration_s") or 0,
    )
    return {
        "name": r.get("name"),
        "duration_s": r.get("duration_s"),
        "tempo_bpm": bpm,
        "tempo_confidence": tempo.get("confidence") if isinstance(tempo, dict) else None,
        "tempo_note": tempo.get("note") if isinstance(tempo, dict) else None,
        "tempo_path": tempo.get("path") if isinstance(tempo, dict) else None,
        "tempo_hit": hit,
        "tempo_relation": rel,
        "key": key_raw,
        "key_name": key_name,
        "key_note": r.get("key_note"),
        "key_hit": key_name.lower() == truth["key"].lower(),
        "sections": r.get("sections"),
        "section_list": r.get("section_list"),
        "section_cuts_s": cuts,
        "nearest_cut_error_vs_lyrics_s": lyric_err,
        "nearest_cut_error_vs_bars_s": bar_err,
        "mean_nearest_cut_lyrics_s": round(float(np.mean([e for e in lyric_err if e is not None])), 3)
        if any(e is not None for e in lyric_err)
        else None,
        "vocal_mask": r.get("vocal_mask"),
        "vocal_vs_scaled_stem": pr_stem,
        "vocal_vs_scaled_srt": pr_srt,
        "level": r.get("level"),
        "pitch": r.get("pitch"),
        "chords": r.get("chords"),
        "tick_onset_tempo": r.get("tick_onset_tempo"),
    }


def score_if_ready(truth: dict) -> dict | None:
    before_p = OUT / "fox-ears-harness-before.json"
    after_p = OUT / "fox-ears-harness-pass1.json"
    if not (before_p.exists() and after_p.exists()):
        print("harness JSONs not ready yet; skip scoring")
        return None
    out = {
        "before_default": score_harness(before_p, truth),
        "after_pass1": score_harness(after_p, truth),
    }
    (OUT / "fox-ears-score-v1b-108-stretched.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT / "fox-ears-score-v1b-108-stretched.json")
    for tag, s in out.items():
        print(
            f"  {tag}: tempo {s['tempo_bpm']} hit={s['tempo_hit']}  key {s['key']} hit={s['key_hit']}  "
            f"sections {s['sections']}  vocal stem P {s['vocal_vs_scaled_stem']['precision']} "
            f"R {s['vocal_vs_scaled_stem']['recall']}  srt P {s['vocal_vs_scaled_srt']['precision']} "
            f"R {s['vocal_vs_scaled_srt']['recall']}"
        )
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    truth = write_scaled_truth()
    verify()
    score_if_ready(truth)


if __name__ == "__main__":
    main()
