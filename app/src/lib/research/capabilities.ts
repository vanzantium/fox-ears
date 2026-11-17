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
};

const ENV = {
  demucs: "FOX_EARS_DEMUCS",
  torchcrepe: "FOX_EARS_TORCHCREPE",
  fasterWhisper: "FOX_EARS_WHISPER",
  librosa: "FOX_EARS_LIBROSA",
  essentia: "FOX_EARS_ESSENTIA",
  madmom: "FOX_EARS_MADMOM",
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
  };
}

/** Base app startup must not require any of these. */
export function baseStartupRequiresResearchTools(): boolean {
  return false;
}
