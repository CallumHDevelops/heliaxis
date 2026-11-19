/** Pure: the refusal when this month's AI spend has reached its cap, or null when there is room. */
export function aiCapMessage(what: string, spentGbp: number, capGbp: number): string | null {
  if (!Number.isFinite(spentGbp) || !Number.isFinite(capGbp)) return null;
  if (spentGbp < capGbp) return null;
  return `Not ${what}: this month's AI spend (£${spentGbp.toFixed(2)}) has reached the £${capGbp.toFixed(2)} monthly cap (Social › Costs). It resets on the 1st, or the owner can raise the cap.`;
}

/** Pure: seconds still to wait before another draft may be written (one per page every `gapMs`), 0 when free. */
export function draftWaitSeconds(lastStartedAt: string | null | undefined, now: number, gapMs = 120_000): number {
  if (!lastStartedAt) return 0;
  const t = Date.parse(lastStartedAt);
  if (!Number.isFinite(t)) return 0;
  const left = t + gapMs - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
