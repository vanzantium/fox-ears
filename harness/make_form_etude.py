#!/usr/bin/env python3
"""Form etude (P4, 2026-11-21): a synthetic song with a KNOWN form, for the
sonar layer and the answer-key scorer.

Writes a stereo 44.1 kHz WAV and its answer key (JSON, same schema as
docs/answer-key-template.json). Nothing here is Taylor's music; it is a test
signal, so its numbers say only that the pipeline can hear a planted form.

Form (100 BPM, 4/4, G major, one-beat pickup):
  pickup | intro A(4) | verse A A (8) | chorus B B (8) | verse A A (8)
  | chorus B B (8) | bridge A+5 (4, the verse riff moved up to C) | chorus B B (8) | outro A (4)

Instruments: sawtooth-ish pad (left), bass (centre, roots on beats 1 and 3,
fifth on 4), a sung-like melody (centre, vibrato) in verses and choruses,
kick/snare/hat. Requires numpy.

  python harness/make_form_etude.py --out /tmp/form-etude.wav --key /tmp/form-etude.answer.json
"""
import argparse
import json
import wave

import numpy as np

SR = 44100
BPM = 100.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
PICKUP_BEATS = 1
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# G major: I V vi IV  (verse riff)   and   IV V iii vi -> IV V I I (chorus)
VERSE = [(7, "maj"), (2, "maj"), (4, "min"), (0, "maj")]   # G D Em C
CHORUS = [(0, "maj"), (2, "maj"), (11, "min"), (4, "min"), (0, "maj"), (2, "maj"), (7, "maj"), (7, "maj")]  # C D Bm Em C D G G

FORM = [
    ("intro", "A", VERSE, 0, False),
    ("verse", "A", VERSE + VERSE, 0, True),
    ("chorus", "B", CHORUS, 0, True),
    ("verse", "A", VERSE + VERSE, 0, True),
    ("chorus", "B", CHORUS, 0, True),
    ("bridge", "A+5", VERSE, 5, False),
    ("chorus", "B", CHORUS, 0, True),
    ("outro", "A", VERSE, 0, False),
]

VERSE_MEL = [71, 69, 67, 69, 74, 72, 71, 69]  # B A G A D C B A (two notes per bar)
CHORUS_MEL = [72, 74, 76, 74, 71, 74, 79, 79]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def tone(f, dur, harmonics=6, decay=0.0, vib=0.0):
    t = np.arange(int(dur * SR)) / SR
    phase = 2 * np.pi * f * t
    if vib:
        phase += vib * np.sin(2 * np.pi * 5.5 * t)  # 5.5 Hz vibrato
    x = sum(np.sin(k * phase) / k for k in range(1, harmonics + 1))
    env = np.minimum(1.0, t / 0.01) * np.minimum(1.0, (dur - t) / 0.02)
    if decay:
        env = env * np.exp(-t * decay)
    return (x * env).astype(np.float32)


def add(buf, x, at):
    i = int(at * SR)
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[: j - i]


def chord_pcs(root, q):
    third = 3 if q == "min" else 4
    return [root % 12, (root + third) % 12, (root + 7) % 12]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--key", required=True)
    a = ap.parse_args()

    bars_total = sum(len(prog) for _, _, prog, _, _ in FORM)
    dur = PICKUP_BEATS * BEAT + bars_total * BAR + 1.5
    L = np.zeros(int(dur * SR), np.float32)
    R = np.zeros_like(L)
    C = np.zeros_like(L)
    rng = np.random.default_rng(7)

    sections, chords = [], []
    t = PICKUP_BEATS * BEAT
    # pickup: one hi-hat count-in beat
    add(C, rng.standard_normal(int(0.03 * SR)).astype(np.float32) * 0.15, 0.0)
    for role, letter, prog, shift, sung in FORM:
        t0 = t
        mel = VERSE_MEL if role in ("verse", "intro", "bridge", "outro") else CHORUS_MEL
        for bi, (root, q) in enumerate(prog):
            r = (root + shift) % 12
            pcs = chord_pcs(r, q)
            # pad: three chord tones around C4, held for the bar
            for pc in pcs:
                m = 60 + ((pc - 0) % 12)
                add(L, 0.07 * tone(hz(m), BAR * 0.98, harmonics=8), t)
            # bass: root on 1 and 3, fifth on 4
            for beat, iv in ((0, 0), (2, 0), (3, 7)):
                add(C, 0.22 * tone(hz(36 + (r + iv) % 12), BEAT * 0.9, harmonics=4, decay=2.0), t + beat * BEAT)
            # melody (centre, vibrato) when sung
            if sung:
                for k in range(2):
                    m = mel[(bi * 2 + k) % len(mel)] + shift
                    add(C, 0.09 * tone(hz(m), BAR / 2 * 0.95, harmonics=5, vib=0.6), t + k * BAR / 2)
            # drums
            for beat in range(4):
                bt = t + beat * BEAT
                if beat in (0, 2):
                    kt = np.arange(int(0.12 * SR)) / SR
                    add(C, (0.5 * np.sin(2 * np.pi * (50 + 60 * np.exp(-kt * 30)) * kt) * np.exp(-kt * 25)).astype(np.float32), bt)
                else:
                    add(C, (rng.standard_normal(int(0.1 * SR)) * 0.12 * np.exp(-np.arange(int(0.1 * SR)) / SR * 30)).astype(np.float32), bt)
                for h in (0, 0.5):
                    add(R, (rng.standard_normal(int(0.025 * SR)) * 0.04).astype(np.float32), bt + h * BEAT)
            chords.append({"t_start": round(t, 4), "t_end": round(t + BAR, 4),
                           "label": f"{NAMES[r]}:{'min' if q == 'min' else 'maj'}"})
            t += BAR
        sections.append({"t_start": round(t0, 4), "t_end": round(t, 4), "label": role, "letter": letter})

    left = L + 0.75 * C + 0.25 * R
    right = 0.35 * L + 0.75 * C + R
    peak = max(np.abs(left).max(), np.abs(right).max())
    st = np.stack([left, right], axis=1) / peak * 0.9
    with wave.open(a.out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())

    first_down = PICKUP_BEATS * BEAT
    beats = [round(PICKUP_BEATS * BEAT - BEAT + i * BEAT, 4) for i in range(int((t - 0) / BEAT) + 1)]
    beats = [b for b in beats if b >= 0]
    downbeats = [round(first_down + i * BAR, 4) for i in range(bars_total)]
    key = {
        "schema": "fox-ears-answer-key-1",
        "title": "form etude (synthetic, P4)",
        "answer_source": "synthetic",
        "label": "planted truth for this synthetic file only; not Taylor's music, so scores stay SOFT",
        "tempo_bpm": BPM,
        "key": "G major",
        "tuning_a4_hz": 440.0,
        "beats": beats,
        "downbeats": downbeats,
        "sections": sections,
        "chords": chords,
        "repetition": " ".join(s["letter"] for s in sections),
        "notes": "bridge = verse riff transposed +5 semitones (to C); one-beat pickup",
    }
    with open(a.key, "w") as f:
        json.dump(key, f, indent=2)
    print(f"wrote {a.out} ({dur:.1f} s) and {a.key}")


if __name__ == "__main__":
    main()
