/**
 * Mode is a cue, not valence. A mode flip between two readings emits a
 * REVIEW / changed-input receipt and does not promote a feeling.
 */
export type InputChangeReceipt = {
  kind: "REVIEW";
  reason: "changed-input";
  cue: "mode" | "key" | "tempo" | string;
  from: string;
  to: string;
  at: string;
};

export type ModeLabel = "major" | "minor" | null | undefined;

export function modeChangeReceipt(
  previous: ModeLabel,
  next: ModeLabel,
  at = new Date().toISOString(),
): InputChangeReceipt | null {
  if (!previous || !next) return null;
  if (previous === next) return null;
  return {
    kind: "REVIEW",
    reason: "changed-input",
    cue: "mode",
    from: previous,
    to: next,
    at,
  };
}

/**
 * Mode may be cited as a cue. It must not be added into a valence sum.
 * Returns 0 so existing call sites can replace a mode term without a feeling.
 */
export function modeValenceContribution(_mode: ModeLabel): 0 {
  return 0;
}
