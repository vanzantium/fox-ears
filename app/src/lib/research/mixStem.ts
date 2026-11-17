/**
 * Mix-vs-stem dual analysis. Run both when available, score quality
 * indicators, keep both receipts, choose a preferred reading with a reason,
 * and retain disagreement. Never hard-code "stem always wins" or "mix always wins".
 */
export type AnalysisSource = "mix" | "vocal_stem";

export type AnalysisQuality = {
  voiced_fraction?: number | null;
  wer?: number | null;
  n_hyp_tokens?: number | null;
  n_ref_tokens?: number | null;
  leakage_db?: number | null;
  mean_logprob?: number | null;
  usable?: boolean;
  notes?: string;
};

export type AnalysisReceipt = {
  source: AnalysisSource;
  available: boolean;
  quality: AnalysisQuality;
  measured: Record<string, unknown>;
};

export type PreferredReading = {
  preferred: AnalysisSource | null;
  reason: string;
  receipts: AnalysisReceipt[];
  disagreement: string[];
};

function usability(r: AnalysisReceipt): number {
  if (!r.available) return -Infinity;
  const q = r.quality;
  if (q.usable === false) return -1e6;
  let s = 0;
  if (q.wer != null) s += (1 - q.wer) * 3;
  if (q.n_hyp_tokens != null && q.n_ref_tokens) {
    const cov = Math.min(1, q.n_hyp_tokens / Math.max(1, q.n_ref_tokens));
    s += cov;
  }
  if (q.voiced_fraction != null) s += q.voiced_fraction;
  if (q.mean_logprob != null) s += Math.max(-2, q.mean_logprob) * 0.15;
  if (q.leakage_db != null) s += Math.min(20, Math.max(0, -q.leakage_db - 20)) * 0.03;
  return s;
}

export function preferReading(receipts: AnalysisReceipt[]): PreferredReading {
  const available = receipts.filter((r) => r.available);
  const disagreement: string[] = [];
  if (!available.length) {
    return { preferred: null, reason: "no mix or stem receipt available", receipts, disagreement };
  }
  const ranked = available.slice().sort((a, b) => usability(b) - usability(a));
  const best = ranked[0]!;
  const other = ranked[1];
  if (other) {
    const d = usability(best) - usability(other);
    const werGap =
      best.quality.wer != null && other.quality.wer != null
        ? Math.abs(best.quality.wer - other.quality.wer)
        : null;
    if (werGap != null && werGap >= 0.05) {
      disagreement.push(
        `${best.source} WER ${(best.quality.wer! * 100).toFixed(1)}% vs ${other.source} ${(other.quality.wer! * 100).toFixed(1)}%`,
      );
    }
    if (d < 0.15) {
      disagreement.push(`${best.source} and ${other.source} quality scores are close (${d.toFixed(2)})`);
    }
  }
  const parts: string[] = [];
  if (best.quality.wer != null) parts.push(`WER ${(best.quality.wer * 100).toFixed(1)}%`);
  if (best.quality.voiced_fraction != null) {
    parts.push(`voiced ${(best.quality.voiced_fraction * 100).toFixed(1)}%`);
  }
  if (best.quality.n_hyp_tokens != null) parts.push(`${best.quality.n_hyp_tokens} hyp tokens`);
  if (best.quality.usable === false) parts.push("marked unusable but still the only receipt");
  const reason = other
    ? `${best.source} preferred over ${other.source}: ${parts.join(", ") || "higher combined quality"}`
    : `${best.source} is the only available reading${parts.length ? ` (${parts.join(", ")})` : ""}`;
  return { preferred: best.source, reason, receipts, disagreement };
}
