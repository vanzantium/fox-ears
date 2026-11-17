/**
 * Remix compare as a first-class object, generated from version records
 * (work/version identity) and mix-vs-stem preferred readings.
 */
import type { VersionRecord } from "./version";
import type { PreferredReading } from "../research/mixStem";
import { withinTol } from "./tempoHypotheses";

export type RemixCompare = {
  work_id: string;
  original_version_id: string;
  remake_version_id: string;
  relation: string;
  measured_changes: {
    tempo: string[];
    key: string[];
    sections: string[];
    vocal: string[];
  };
  preferred_readings?: {
    original?: PreferredReading;
    remake?: PreferredReading;
  };
  listener_changes: string[];
  uncertain: string[];
  /** Copied, not merged, from each version. */
  listener_readings: {
    original: VersionRecord["listener_reading"];
    remake: VersionRecord["listener_reading"];
  };
};

function roleBpm(v: VersionRecord, role: string): number | null {
  return v.measured.tempo_hypotheses.find((h) => h.role === role)?.value_bpm ?? null;
}

function topKey(v: VersionRecord): string | null {
  const k = v.measured.key_hypotheses[0];
  return k ? `${k.tonic} ${k.mode}` : null;
}

export function remixCompare(
  original: VersionRecord,
  remake: VersionRecord,
  readings?: { original?: PreferredReading; remake?: PreferredReading },
): RemixCompare {
  if (original.work_id !== remake.work_id) {
    throw new Error(`remix compare requires the same work_id (got ${original.work_id} vs ${remake.work_id})`);
  }
  const tempo: string[] = [];
  for (const role of ["reference_click", "performed_groove"] as const) {
    const a = roleBpm(original, role);
    const b = roleBpm(remake, role);
    if (a == null && b == null) continue;
    if (a == null) tempo.push(`${role} appeared on remake at ${b}`);
    else if (b == null) tempo.push(`${role} present on original (${a}) missing on remake`);
    else if (!withinTol(b, a, 0.02)) tempo.push(`${role} ${a} → ${b}`);
    else tempo.push(`${role} held near ${a} (remake ${b})`);
  }
  const key: string[] = [];
  const ka = topKey(original);
  const kb = topKey(remake);
  if (ka && kb && ka !== kb) key.push(`${ka} → ${kb}`);
  else if (ka && kb) key.push(`key held ${ka}`);

  const sections: string[] = [];
  const nsA = original.measured.sections?.length;
  const nsB = remake.measured.sections?.length;
  if (nsA != null && nsB != null && nsA !== nsB) sections.push(`section count ${nsA} → ${nsB}`);

  const vocal: string[] = [];
  if (readings?.original || readings?.remake) {
    const po = readings.original?.preferred;
    const pr = readings.remake?.preferred;
    if (po && pr && po !== pr) {
      vocal.push(`preferred lyric reading ${po} on original, ${pr} on remake`);
    }
    if (readings.remake?.reason) vocal.push(readings.remake.reason);
  }

  const listener_changes: string[] = [];
  const lo = original.listener_reading?.text;
  const lr = remake.listener_reading?.text;
  if (lo && lr && lo !== lr) listener_changes.push("listener reading changed between versions");
  else if (!lo && lr) listener_changes.push("listener reading added on remake");

  const uncertain = [
    ...(original.comparison?.uncertain ?? []),
    ...(remake.comparison?.uncertain ?? []),
  ];

  return {
    work_id: original.work_id,
    original_version_id: original.version_id,
    remake_version_id: remake.version_id,
    relation: remake.relation_to_work,
    measured_changes: { tempo, key, sections, vocal },
    preferred_readings: readings,
    listener_changes,
    uncertain,
    listener_readings: {
      original: original.listener_reading,
      remake: remake.listener_reading,
    },
  };
}
