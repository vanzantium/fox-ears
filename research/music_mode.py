#!/usr/bin/env python3
"""
MUSIC MODE — Internal Metronome + Sensory Buffer
═════════════════════════════════════════════════

Gives the organism the ability to listen to music in real time:
  • Metronome ticks at BPM, phase-locks the oscillator
  • SensoryBuffer accumulates skin impressions WITHOUT forming memory
  • settle() runs after music stops, lets the kernel wander through
    the thermal residue to find what resonated

The key insight: the organism FEELS the music while it plays,
but doesn't REMEMBER it until after it stops. Memory forms from
the residual impression, not from the live experience.

This is how humans process music. You don't analyze a song while
you're grooving to it. You groove, and then later you realize
what it meant.

Usage:
    from music_mode import MusicMode

    mm = MusicMode(organism, bpm=120)
    mm.start()

    # During playback — feed audio features, don't form memory
    mm.feel({"frequency": 440, "amplitude": 0.7, "onset": True})
    mm.feel({"frequency": 880, "amplitude": 0.3, "onset": False})

    # Song ends — let meaning settle
    report = mm.stop()
    # report contains what the organism found in the residual impression

Integration:
    /music 120     — start music mode at 120 BPM
    /feel {...}    — feed audio feature (from RhythmMapper or manual)
    /settle        — stop music mode, let meaning form

Status: ROUGH SCAFFOLD — needs real audio input pipeline and extensive tuning.
"""

from __future__ import annotations
import time
import threading
import math
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List

# ══════════════════════════════════════════════════════════════
# METRONOME — Internal clock that ticks at BPM
# ══════════════════════════════════════════════════════════════

class Metronome:
    """
    Internal temporal awareness. Ticks at a set BPM.
    The organism's oscillator phase-locks to the tick
    instead of to input events.

    When active, the organism has a sense of time.
    When inactive, the organism is event-driven only.
    """

    def __init__(self, bpm: float = 120.0):
        self.bpm: float = bpm
        self.interval: float = 60.0 / bpm  # seconds per beat
        self.running: bool = False
        self.beat_count: int = 0
        self.phase: float = 0.0  # 0-1 within current beat
        self.start_time: float = 0.0
        self._thread: Optional[threading.Thread] = None
        self._callbacks: List = []

    def set_bpm(self, bpm: float) -> None:
        """Change tempo. Can be called while running for tempo shifts."""
        self.bpm = max(20.0, min(300.0, bpm))
        self.interval = 60.0 / self.bpm

    def on_beat(self, callback) -> None:
        """Register a function to call on each beat."""
        self._callbacks.append(callback)

    def start(self) -> None:
        """Start the internal clock."""
        self.running = True
        self.beat_count = 0
        self.phase = 0.0
        self.start_time = time.time()
        self._thread = threading.Thread(target=self._tick_loop, daemon=True)
        self._thread.start()

    def stop(self) -> Dict[str, Any]:
        """Stop the clock. Returns timing report."""
        self.running = False
        elapsed = time.time() - self.start_time if self.start_time else 0
        return {
            "beats": self.beat_count,
            "bpm": self.bpm,
            "elapsed_seconds": round(elapsed, 2),
            "bars_approx": self.beat_count // 4,
        }

    def get_phase(self) -> float:
        """Current phase within the beat (0.0-1.0)."""
        if not self.running:
            return 0.0
        elapsed = time.time() - self.start_time
        beat_position = elapsed / self.interval
        return beat_position % 1.0

    def get_bar_phase(self, beats_per_bar: int = 4) -> float:
        """Current phase within the bar (0.0-1.0)."""
        if not self.running:
            return 0.0
        return (self.beat_count % beats_per_bar) / beats_per_bar

    def _tick_loop(self) -> None:
        """Background tick. Fires callbacks on each beat."""
        next_beat = self.start_time + self.interval
        while self.running:
            now = time.time()
            if now >= next_beat:
                self.beat_count += 1
                self.phase = 0.0
                for cb in self._callbacks:
                    try:
                        cb(self.beat_count, self.bpm)
                    except Exception:
                        pass
                next_beat += self.interval
            else:
                # Update phase between beats
                self.phase = (now - (next_beat - self.interval)) / self.interval
                time.sleep(0.01)  # 10ms resolution — good enough for feel


# ══════════════════════════════════════════════════════════════
# SENSORY BUFFER — Accumulates impressions without forming memory
# ══════════════════════════════════════════════════════════════

@dataclass
class SensoryImpression:
    """A single moment of musical feeling — not a memory, an impression."""
    timestamp: float
    beat: int
    phase: float          # where in the beat this arrived

    # Raw audio features (from RhythmMapper or manual)
    frequency: float = 0.0
    amplitude: float = 0.0
    onset: bool = False   # note attack / transient

    # Derived thermal impression (felt, not analyzed)
    warmth: float = 0.0   # low freq = warm, high freq = cool
    weight: float = 0.0   # amplitude = weight
    surprise: float = 0.0 # onset after silence = surprise
    groove_pull: float = 0.0  # on-beat onset = groove, off-beat = tension


class SensoryBuffer:
    """
    Accumulates raw sensory impressions during music mode.

    KEY PRINCIPLE: Nothing in this buffer triggers kernel updates,
    memory formation, or tattoo extraction. The organism FEELS
    the music but doesn't PROCESS it. Processing happens in settle().

    The buffer is a thermal residue — like the warmth left on a
    seat after someone stands up. The shape of what was there,
    not the thing itself.
    """

    def __init__(self):
        self.impressions: List[SensoryImpression] = []
        self.peak_warmth: float = 0.0
        self.peak_weight: float = 0.0
        self.total_surprise: float = 0.0
        self.groove_sum: float = 0.0
        self.tension_sum: float = 0.0
        self.last_onset_time: float = 0.0
        self.onset_count: int = 0

    def feel(self, features: Dict[str, Any], beat: int, phase: float) -> SensoryImpression:
        """
        Record a sensory impression. Does NOT update the organism.
        Just accumulates the thermal shape.
        """
        freq = features.get("frequency", 0.0)
        amp = features.get("amplitude", 0.0)
        onset = features.get("onset", False)
        now = time.time()

        # Derive thermal qualities from raw features
        # Low frequency = warmth (bass), high frequency = coolness (treble)
        warmth = max(0.0, 1.0 - (freq / 2000.0)) if freq > 0 else 0.0

        # Amplitude = weight (loud = heavy)
        weight = min(1.0, amp)

        # Surprise = onset after gap
        gap = now - self.last_onset_time if self.last_onset_time > 0 else 1.0
        surprise = min(1.0, gap * 0.5) if onset else 0.0

        # Groove pull: on-beat onset = groove, off-beat = tension
        # phase 0.0 = right on the beat, phase 0.5 = maximally off-beat
        if onset:
            beat_distance = min(phase, 1.0 - phase)  # distance from nearest beat
            groove_pull = 1.0 - (beat_distance * 4.0)  # on-beat = +1, off-beat = -1
            groove_pull = max(-1.0, min(1.0, groove_pull))
            self.last_onset_time = now
            self.onset_count += 1
        else:
            groove_pull = 0.0

        imp = SensoryImpression(
            timestamp=now, beat=beat, phase=phase,
            frequency=freq, amplitude=amp, onset=onset,
            warmth=warmth, weight=weight,
            surprise=surprise, groove_pull=groove_pull,
        )

        self.impressions.append(imp)

        # Track peaks (the hottest moments)
        self.peak_warmth = max(self.peak_warmth, warmth)
        self.peak_weight = max(self.peak_weight, weight)
        self.total_surprise += surprise
        if groove_pull > 0:
            self.groove_sum += groove_pull
        else:
            self.tension_sum += abs(groove_pull)

        return imp

    def get_thermal_residue(self) -> Dict[str, float]:
        """
        The shape left behind after the music stops.
        Not a memory — a thermal impression.
        """
        n = len(self.impressions)
        if n == 0:
            return {
                "warmth": 0.0, "weight": 0.0, "surprise": 0.0,
                "groove": 0.0, "tension": 0.0, "density": 0.0,
                "onset_rate": 0.0, "duration_beats": 0,
            }

        avg_warmth = sum(i.warmth for i in self.impressions) / n
        avg_weight = sum(i.weight for i in self.impressions) / n
        total_beats = self.impressions[-1].beat - self.impressions[0].beat + 1
        duration = self.impressions[-1].timestamp - self.impressions[0].timestamp

        return {
            "warmth": round(avg_warmth, 3),
            "weight": round(avg_weight, 3),
            "peak_warmth": round(self.peak_warmth, 3),
            "peak_weight": round(self.peak_weight, 3),
            "surprise": round(self.total_surprise, 3),
            "groove": round(self.groove_sum, 3),
            "tension": round(self.tension_sum, 3),
            "swing_ratio": round(
                self.groove_sum / max(self.groove_sum + self.tension_sum, 0.001), 3
            ),
            "density": round(n / max(duration, 0.001), 3),
            "onset_rate": round(self.onset_count / max(total_beats, 1), 3),
            "duration_beats": total_beats,
            "total_impressions": n,
        }

    def clear(self) -> None:
        """Wipe the buffer. The impression fades."""
        self.impressions.clear()
        self.peak_warmth = 0.0
        self.peak_weight = 0.0
        self.total_surprise = 0.0
        self.groove_sum = 0.0
        self.tension_sum = 0.0
        self.onset_count = 0


# ══════════════════════════════════════════════════════════════
# MUSIC MODE — The complete listening experience
# ══════════════════════════════════════════════════════════════

class MusicMode:
    """
    Wraps Metronome + SensoryBuffer + Organism into a listening mode.

    Flow:
        1. start(bpm) — metronome begins, buffer opens, organism pauses normal processing
        2. feel({features}) — audio features accumulate in buffer (no memory formed)
        3. stop() — metronome stops, settle() runs, organism processes the residual thermal
           impression in one pass, meaning forms AFTER the experience

    The organism's oscillator phase-locks to the metronome during playback.
    The kernel is modulated by the beat (phi pulses with the rhythm).
    But no tattoos form, no friction logs, no dreams trigger.
    Pure sensory experience.
    """

    def __init__(self, organism, bpm: float = 120.0):
        self.organism = organism
        self.metronome = Metronome(bpm)
        self.buffer = SensoryBuffer()
        self.active = False
        self._original_phi: float = 0.0

        # Register beat callback to pulse the oscillator
        self.metronome.on_beat(self._on_beat)

    def start(self, bpm: Optional[float] = None) -> Dict[str, Any]:
        """Enter music mode. The organism opens its ears."""
        if bpm:
            self.metronome.set_bpm(bpm)
        self.buffer.clear()
        self._original_phi = self.organism.state.oscillator.phi
        self.active = True
        self.metronome.start()
        return {
            "status": "music_mode_active",
            "bpm": self.metronome.bpm,
            "message": "Listening. Feed audio features with feel(). Stop with stop().",
        }

    def feel(self, features: Dict[str, Any]) -> Optional[SensoryImpression]:
        """
        Feed an audio feature into the sensory buffer.
        Does NOT update the organism's kernel or memory.
        Just accumulates the thermal shape.
        """
        if not self.active:
            return None

        beat = self.metronome.beat_count
        phase = self.metronome.get_phase()
        return self.buffer.feel(features, beat, phase)

    def _on_beat(self, beat_count: int, bpm: float) -> None:
        """
        Called on each metronome beat.
        Pulses the organism's oscillator phi to phase-lock with the rhythm.
        Gentle modulation — the organism feels the beat, not obeys it.
        """
        if not self.active:
            return

        # Pulse phi toward the beat — sinusoidal modulation
        pulse = math.sin(beat_count * math.pi * 0.5) * 0.05
        self.organism.state.oscillator.phi += pulse

        # Gentle groove boost on each beat (the rhythm feels good)
        k = self.organism.state.kernel
        k.groove = min(1.0, k.groove + 0.003)

    def stop(self) -> Dict[str, Any]:
        """
        Exit music mode. Let meaning settle.

        The metronome stops. The buffer's thermal residue gets processed
        through the organism in ONE pass. Memory forms from the residual
        impression, not from the live experience.
        """
        if not self.active:
            return {"status": "not_active"}

        self.active = False
        timing = self.metronome.stop()
        residue = self.buffer.get_thermal_residue()

        # ── SETTLE PASS ──
        # The organism wanders through the thermal residue.
        # Map residue qualities to CFT state changes.
        settle_report = self._settle(residue)

        # Clear the buffer — the impression has been processed
        self.buffer.clear()

        return {
            "status": "settled",
            "timing": timing,
            "residue": residue,
            "settle": settle_report,
        }

    def _settle(self, residue: Dict[str, float]) -> Dict[str, Any]:
        """
        Let meaning form from the thermal residue.

        The organism doesn't analyze the music. It lets the residual
        warmth, weight, surprise, and groove modulate its kernel
        state. Whatever resonated will naturally shift the variables
        that the next dream cycle compresses into a tattoo.

        The memory of the song isn't the notes — it's how the
        organism's state changed because of the thermal impression.
        """
        k = self.organism.state.kernel

        # Warmth → temperature modulation (bass-heavy = warm organism)
        warmth = residue.get("warmth", 0)
        k.temperature = k.temperature * 0.7 + warmth * 0.3

        # Weight → pressure modulation (loud = heavy = pressure)
        weight = residue.get("weight", 0)
        k.pressure = k.pressure * 0.8 + weight * 0.2

        # Groove → groove (obvious mapping, on-beat music boosts groove)
        groove_feel = residue.get("groove", 0)
        tension_feel = residue.get("tension", 0)
        swing = residue.get("swing_ratio", 0.5)

        # High swing ratio = the music resolved its tensions well
        if swing > 0.6:
            k.groove = min(1.0, k.groove + swing * 0.15)
            k.coherence = min(1.0, k.coherence + 0.05)
        # Low swing = lots of unresolved tension (interesting but unsettling)
        elif swing < 0.3 and tension_feel > 1.0:
            k.pressure = min(1.0, k.pressure + 0.05)
            k.surprise_load = min(1.0, k.surprise_load + 0.08)

        # Surprise → surprise_load (unexpected moments in the music)
        surprise = residue.get("surprise", 0)
        if surprise > 2.0:
            k.surprise_load = min(1.0, k.surprise_load + surprise * 0.03)

        # Density → metabolic cost (fast music costs more calories)
        density = residue.get("density", 0)
        if density > 10:
            k.reserve = max(0.0, k.reserve - 0.02)

        # Recovery boost — music is restorative when groove is high
        if swing > 0.5 and warmth > 0.4:
            k.recovery = min(1.0, k.recovery + 0.04)

        # Create a text summary for the organism to process
        # This is the ONE moment where the music becomes friction
        summary = (
            f"Music settled: {residue.get('duration_beats', 0)} beats, "
            f"warmth={warmth:.2f}, groove={groove_feel:.1f}, "
            f"tension={tension_feel:.1f}, swing={swing:.2f}, "
            f"surprise={surprise:.1f}"
        )

        # Process the summary through the organism normally
        # THIS is where friction forms. This is the memory point.
        result = self.organism.step(summary)

        return {
            "summary": summary,
            "groove_delta": round(k.groove - (k.groove - swing * 0.15 if swing > 0.6 else k.groove), 3),
            "temperature_shift": round(warmth * 0.3, 3),
            "mode_after": result["oscillator"]["mode"],
            "coherence_after": round(k.coherence, 3),
        }

    def get_status(self) -> Dict[str, Any]:
        """Current music mode status."""
        if not self.active:
            return {"active": False}
        return {
            "active": True,
            "bpm": self.metronome.bpm,
            "beat": self.metronome.beat_count,
            "phase": round(self.metronome.get_phase(), 3),
            "bar_phase": round(self.metronome.get_bar_phase(), 3),
            "impressions": len(self.buffer.impressions),
            "peak_warmth": round(self.buffer.peak_warmth, 3),
            "groove_so_far": round(self.buffer.groove_sum, 3),
        }


# ══════════════════════════════════════════════════════════════
# TEST
# ══════════════════════════════════════════════════════════════

def test_music_mode():
    print("═" * 50)
    print("  MUSIC MODE — Scaffold Test")
    print("═" * 50)

    try:
        from ato_organism_complete import OrganismRuntime
        organism = OrganismRuntime()
    except ImportError:
        print("  OrganismRuntime not available. Mock test.")
        return

    mm = MusicMode(organism, bpm=120)

    # Start listening
    print(f"\n  Starting music mode at 120 BPM...")
    mm.start()
    print(f"  Status: {mm.get_status()}")

    # Simulate a simple 4-bar phrase
    # Bass drum on 1 and 3, snare on 2 and 4, hi-hat on every 8th
    import time as t
    beat_interval = 0.1  # sped up for testing (real would be 0.5s at 120bpm)

    for bar in range(4):
        for beat in range(4):
            # Bass drum (low freq, high amplitude) on 1 and 3
            if beat in (0, 2):
                mm.feel({"frequency": 60, "amplitude": 0.9, "onset": True})
            # Snare (mid freq) on 2 and 4
            if beat in (1, 3):
                mm.feel({"frequency": 400, "amplitude": 0.7, "onset": True})
            # Hi-hat (high freq, low amplitude) every beat
            mm.feel({"frequency": 8000, "amplitude": 0.3, "onset": True})
            # Sustain between beats
            mm.feel({"frequency": 200, "amplitude": 0.2, "onset": False})
            t.sleep(beat_interval)

    print(f"  Status after 4 bars: {mm.get_status()}")

    # Stop and settle
    print(f"\n  Stopping music mode. Letting meaning settle...")
    report = mm.stop()

    print(f"\n  ── THERMAL RESIDUE ──")
    residue = report["residue"]
    for k, v in residue.items():
        print(f"  {k:20s}: {v}")

    print(f"\n  ── SETTLE REPORT ──")
    settle = report["settle"]
    print(f"  Summary: {settle['summary']}")
    print(f"  Mode after: {settle['mode_after']}")
    print(f"  Coherence: {settle['coherence_after']}")

    print(f"\n  ── TIMING ──")
    timing = report["timing"]
    print(f"  Beats: {timing['beats']}")
    print(f"  Bars: {timing['bars_approx']}")
    print(f"  Duration: {timing['elapsed_seconds']}s")

    print(f"\n{'═' * 50}")
    print("  The organism listened. The meaning settled.")
    print("  The memory formed after the music stopped.")
    print(f"{'═' * 50}")


if __name__ == "__main__":
    test_music_mode()
