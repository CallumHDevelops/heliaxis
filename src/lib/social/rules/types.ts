/** Shared types for the pure Social monitoring rules. No I/O in this folder. */

export const SEVERITIES = ['ignore', 'positive', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PLATFORMS = ['facebook', 'instagram', 'trustpilot', 'google', 'manual'] as const;
export type Platform = (typeof PLATFORMS)[number];

const RANK: Record<Severity, number> = { ignore: 0, positive: 1, low: 2, medium: 3, high: 4, critical: 5 };

export const sevRank = (s: Severity | null | undefined): number => (s ? RANK[s] : -1);

/** The higher of two severities (null counts as lowest). */
export function maxSeverity(a: Severity | null | undefined, b: Severity | null | undefined): Severity | null {
  return sevRank(a) >= sevRank(b) ? (a ?? null) : (b ?? null);
}

/** One level up, capped at critical. */
export function raiseOne(s: Severity): Severity {
  return SEVERITIES[Math.min(RANK[s] + 1, RANK.critical)];
}

/** At least `min`: raises, never lowers. */
export function atLeast(s: Severity, min: Severity): Severity {
  return sevRank(s) >= sevRank(min) ? s : min;
}
