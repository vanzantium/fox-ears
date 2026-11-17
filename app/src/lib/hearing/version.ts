/**
 * Work / version identity. A work is the song lineage; a version is one
 * recording, remix, stretch or performance. Listener readings stay off the
 * measured facts so a later rereading does not rewrite the carrier.
 */
export const WORK_RELATIONS = [
  "original",
  "live",
  "remix",
  "cover",
  "edit",
  "stretch",
  "unknown",
] as const;
export type RelationToWork = (typeof WORK_RELATIONS)[number];

import type { TempoHypothesis, PreferredFor } from "./tempoHypotheses";
import type { SectionCue, SectionDisagreement } from "./sectionCues";

export type KeyHypothesis = {
  tonic: string;
  mode: "major" | "minor";
  confidence: number | null;
  source?: string;
};

export type MeasuredFacts = {
  tempo_hypotheses: TempoHypothesis[];
  preferred_for: PreferredFor;
  key_hypotheses: KeyHypothesis[];
  sections?: Array<{ t_start_ms: number; t_end_ms: number; role: string; label?: string }>;
  section_cues?: SectionCue[];
  section_disagreement?: SectionDisagreement[];
  vocal?: Record<string, unknown>;
  confidence?: Record<string, number | null>;
  tool: { name: string; version: string };
  receipt: Record<string, unknown>;
};

export type ReportedFacts = {
  tempo_bpm?: number;
  key?: { tonic: string; mode: "major" | "minor" };
  notes?: string;
  by?: string;
  date?: string;
};

export type ListenerReading = {
  text: string;
  by?: string;
  date?: string;
  /** Separate from measured. Never written into measured.receipt as authority. */
  epistemic?: "INTERPRETED" | "UNRESOLVED";
};

export type VersionComparison = {
  vs_version_id: string;
  changed_in_audio: string[];
  changed_in_listener: string[];
  uncertain: string[];
};

export type VersionRecord = {
  work_id: string;
  version_id: string;
  title?: string;
  audio_sha256: string;
  lyrics_source_id: string | null;
  relation_to_work: RelationToWork;
  measured: MeasuredFacts;
  reported: ReportedFacts | null;
  listener_reading: ListenerReading | null;
  comparison?: VersionComparison | null;
};

export function isRelationToWork(x: string): x is RelationToWork {
  return (WORK_RELATIONS as readonly string[]).includes(x);
}

export function assertVersionRecord(x: unknown): VersionRecord {
  const v = x as VersionRecord;
  if (!v || typeof v !== "object") throw new Error("version record missing");
  if (typeof v.work_id !== "string" || !v.work_id) throw new Error("work_id required");
  if (typeof v.version_id !== "string" || !v.version_id) throw new Error("version_id required");
  if (typeof v.audio_sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(v.audio_sha256)) {
    throw new Error(`audio_sha256 must be a 64-char hex digest, got ${String(v.audio_sha256)}`);
  }
  if (v.lyrics_source_id != null && typeof v.lyrics_source_id !== "string") {
    throw new Error("lyrics_source_id must be a string or null");
  }
  if (!isRelationToWork(v.relation_to_work)) {
    throw new Error(`relation_to_work invalid: ${String(v.relation_to_work)}`);
  }
  if (!v.measured || !Array.isArray(v.measured.tempo_hypotheses) || !v.measured.preferred_for) {
    throw new Error("measured.tempo_hypotheses and measured.preferred_for are required");
  }
  if (!("reported" in v)) throw new Error("reported must be present (null if unknown)");
  if (!("listener_reading" in v)) throw new Error("listener_reading must be present (null if none)");
  return v;
}

export function workId(slug: string): string {
  return `work:${slug}`;
}

export function versionId(workSlug: string, versionSlug: string): string {
  return `${workSlug}/${versionSlug}`;
}
