/**
 * Optional research-side tools. None of these are required for base Fox Ears
 * startup. Essentia (AGPL) and madmom (CC BY-NC-SA) stay optional-only.
 * Capability checks never throw; they report availability.
 */
import { existsSync } from "node:fs";

export type ToolCapability = {
  available: boolean;
  optional: boolean;
  license?: string;
  /**
   * P4: licence class for the code AND the weights, whichever is stricter.
   * "noncommercial" and "copyleft" stay research-only; "unverified" means the
   * weight licence was read from a redistributor, not the authors.
   */
  license_class?: "permissive" | "copyleft" | "noncommercial" | "unverified";
  note?: string;
  path?: string;
};

export type ResearchCapabilities = {
  demucs: ToolCapability;
  torchcrepe: ToolCapability;
  fasterWhisper: ToolCapability;
  librosa: ToolCapability;
  essentia: ToolCapability;
  madmom: ToolCapability;
  /** P4 (2026-11-21) candidates — see harness/candidates.py. */
  beatThis: ToolCapability;
  allin1: ToolCapability;
  vocalSeparator: ToolCapability;
  basicPitch: ToolCapability;
  songformer: ToolCapability;
  mirEval: ToolCapability;
};

const ENV = {
  demucs: "FOX_EARS_DEMUCS",
  torchcrepe: "FOX_EARS_TORCHCREPE",
  fasterWhisper: "FOX_EARS_WHISPER",
  librosa: "FOX_EARS_LIBROSA",
  essentia: "FOX_EARS_ESSENTIA",
  madmom: "FOX_EARS_MADMOM",
  beatThis: "FOX_EARS_BEAT_THIS",
  allin1: "FOX_EARS_ALLIN1",
  vocalSeparator: "FOX_EARS_SEPARATOR",
  basicPitch: "FOX_EARS_BASIC_PITCH",
  songformer: "FOX_EARS_SONGFORMER",
  mirEval: "FOX_EARS_MIR_EVAL",
} as const;

function fromEnvOrPath(envKey: string, fallbacks: string[]): { available: boolean; path?: string } {
  const env = process.env[envKey];
  if (env === "0" || env === "false") return { available: false };
  if (env && existsSync(env)) return { available: true, path: env };
  for (const p of fallbacks) {
    if (existsSync(p)) return { available: true, path: p };
  }
  return { available: false };
}

export function researchCapabilities(): ResearchCapabilities {
  const demucs = fromEnvOrPath(ENV.demucs, [
    "/workspace/fox-ears/.venv-sep/bin/python",
  ]);
  const whisper = fromEnvOrPath(ENV.fasterWhisper, [
    "/workspace/fox-ears-bakeoff/.venv/bin/python",
  ]);
  const librosa = fromEnvOrPath(ENV.librosa, [
    "/workspace/fox-ears-bakeoff/.venv/bin/python",
  ]);
  const essentia = fromEnvOrPath(ENV.essentia, [
    "/workspace/fox-ears-bakeoff/.venv-essentia/bin/python",
  ]);
  const madmom = fromEnvOrPath(ENV.madmom, [
    "/workspace/fox-ears-bakeoff/.venv-madmom/bin/python",
  ]);
  const beatThis = fromEnvOrPath(ENV.beatThis, ["/workspace/fox-ears/.venv-beatthis/bin/python"]);
  const allin1 = fromEnvOrPath(ENV.allin1, ["/workspace/fox-ears/.venv-allin1/bin/python"]);
  const vocalSeparator = fromEnvOrPath(ENV.vocalSeparator, ["/workspace/fox-ears/.venv-separator/bin/python"]);
  const basicPitch = fromEnvOrPath(ENV.basicPitch, ["/workspace/fox-ears-bakeoff/.venv-bp/bin/python"]);
  const songformer = fromEnvOrPath(ENV.songformer, ["/workspace/fox-ears/.venv-songformer/bin/python"]);
  const mirEval = fromEnvOrPath(ENV.mirEval, ["/workspace/fox-ears/.venv-score/bin/python"]);
  return {
    demucs: {
      available: demucs.available,
      optional: true,
      license: "MIT",
      note: "htdemucs_6s behind an adapter; not required at startup",
      path: demucs.path,
    },
    torchcrepe: {
      available: demucs.available, // same sep venv in this workspace
      optional: true,
      license: "MIT",
      note: "CREPE-family F0; not required at startup",
      path: demucs.path,
    },
    fasterWhisper: {
      available: whisper.available,
      optional: true,
      license: "MIT",
      note: "lyric / ASR comparison; not required at startup",
      path: whisper.path,
    },
    librosa: {
      available: librosa.available,
      optional: true,
      license: "ISC",
      note: "independent reference / utility",
      path: librosa.path,
    },
    essentia: {
      available: essentia.available,
      optional: true,
      license: "AGPL-3.0",
      note: "research-only cross-check; do not bundle as a production dependency",
      path: essentia.path,
    },
    madmom: {
      available: madmom.available,
      optional: true,
      license: "CC-BY-NC-SA",
      note: "research-only diagnostic; models are noncommercial share-alike",
      path: madmom.path,
    },
    beatThis: {
      available: beatThis.available,
      optional: true,
      license: "MIT (code and published weights, per the CPJKU README)",
      license_class: "permissive",
      note: "beats + downbeats candidate (harness/candidates.py beat-this); replaces madmom's NC models for downbeats",
      path: beatThis.path,
    },
    allin1: {
      available: allin1.available,
      optional: true,
      license: "MIT code; weights on Hugging Face — confirm at the source",
      license_class: "unverified",
      note: "labelled sections + beats candidate (harness/candidates.py allin1); needs demucs + NATTEN",
      path: allin1.path,
    },
    vocalSeparator: {
      available: vocalSeparator.available,
      optional: true,
      license: "MIT tool (python-audio-separator); Kim Mel-Band RoFormer vocals card reports MIT — confirm",
      license_class: "unverified",
      note: "vocal stem for the vocal gate and lyric alignment (harness/candidates.py vocals); per-checkpoint licences vary",
      path: vocalSeparator.path,
    },
    basicPitch: {
      available: basicPitch.available,
      optional: true,
      license: "Apache-2.0",
      license_class: "permissive",
      note: "notes/MIDI per stem (bake-off 2026-11-16); a TS build exists but is not wired into the app",
      path: basicPitch.path,
    },
    songformer: {
      available: songformer.available,
      optional: true,
      license: "CC BY 4.0 code; loads MuQ weights under CC BY-NC 4.0",
      license_class: "noncommercial",
      note: "strongest structure model in the 2025 benchmarks; private use only, add knowingly; not wrapped",
      path: songformer.path,
    },
    mirEval: {
      available: mirEval.available,
      optional: true,
      license: "MIT",
      license_class: "permissive",
      note: "answer-key scoring (harness/score_answer_key.py)",
      path: mirEval.path,
    },
  };
}

/** Base app startup must not require any of these. */
export function baseStartupRequiresResearchTools(): boolean {
  return false;
}
