import type { LyricLine } from "./types";

type RecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function speechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startLyricListen(
  nowMs: () => number,
  onLine: (line: LyricLine) => void,
): { stop: () => void } {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return { stop: () => {} };
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (!r?.isFinal) continue;
      const text = (r[0]?.transcript ?? "").trim();
      if (!text) continue;
      onLine({ t_ms: Math.round(nowMs()), text, source: "speech" });
    }
  };
  rec.onerror = () => {};
  rec.start();
  return { stop: () => rec.stop() };
}
