import { z } from 'zod';

/**
 * The planner's tunable weights (spec §5 M3: "the owner can tune the weights"). Stored in seo_setting under the key
 * `planner`, read and written by planner/server.ts. Pure, so the defaults and parsing can be tested.
 */

export const PLANNER_KEY = 'planner';

/** The queue's status flow (Dismiss sets 'dismissed', which is off the queue). */
export const QUEUE_STATUSES = ['idea', 'briefed', 'drafting', 'in_review', 'published', 'measuring'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export const STATUS_LABEL: Record<QueueStatus, string> = { idea: 'Idea', briefed: 'Briefed', drafting: 'Drafting', in_review: 'In review', published: 'Published', measuring: 'Measuring' };

export const INTENTS = ['local_commercial', 'commercial', 'informational'] as const;
export type Intent = (typeof INTENTS)[number];

export const DEFAULT_PLANNER = {
  /** Intent weight in the score: local commercial 3, commercial 2, informational 1. */
  intentWeights: { local_commercial: 3, commercial: 2, informational: 1 },
  /** Proof weight: 1 when we have real local work to show, 0.3 when we don't. */
  proofWeights: { with: 1, without: 0.3 },
  /** Two searches share a page when their top 10s share at least this many URLs. */
  overlapUrls: 4,
  /** Keyword difficulty (0 to 100) cut points: below 15 is band 1, 15 to 29 band 2, 30 to 49 band 3, 50 to 69 band 4, 70+ band 5. */
  difficultyCuts: [15, 30, 50, 70],
  /** The band used when difficulty is not known yet. */
  unknownDifficultyBand: 2,
  /** Monthly volume counted for a search whose volume is not known yet. */
  unknownVolume: 10,
  /** Search Console "striking distance": positions in this range with at least this many impressions in 28 days. */
  strikingFrom: 8,
  strikingTo: 30,
  minImpressions: 10,
  /** At most this many new groups are added to the queue per scoring run (existing ones are always re-scored). */
  maxNewClusters: 150,
};

const weight = z.number().min(0).max(10);

export const PlannerSchema = z.object({
  intentWeights: z.object({ local_commercial: weight, commercial: weight, informational: weight }),
  proofWeights: z.object({ with: z.number().min(0).max(2), without: z.number().min(0).max(2) }),
  overlapUrls: z.number().int().min(1).max(10),
  difficultyCuts: z.array(z.number().min(0).max(100)).min(1).max(8),
  unknownDifficultyBand: z.number().min(1).max(9),
  unknownVolume: z.number().min(0).max(10_000),
  strikingFrom: z.number().min(1).max(100),
  strikingTo: z.number().min(1).max(100),
  minImpressions: z.number().int().min(0),
  maxNewClusters: z.number().int().min(0).max(1000),
});

export type PlannerSettings = z.infer<typeof PlannerSchema>;

/** A stored value merged over the defaults, field by field, so a half-written row never breaks the planner. */
export function parsePlanner(raw: unknown): PlannerSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const merged = {
    ...DEFAULT_PLANNER,
    ...r,
    intentWeights: { ...DEFAULT_PLANNER.intentWeights, ...((r.intentWeights as object) ?? {}) },
    proofWeights: { ...DEFAULT_PLANNER.proofWeights, ...((r.proofWeights as object) ?? {}) },
  };
  const p = PlannerSchema.safeParse(merged);
  if (!p.success) return PlannerSchema.parse(DEFAULT_PLANNER);
  const v = p.data;
  return { ...v, difficultyCuts: [...v.difficultyCuts].sort((a, b) => a - b), strikingTo: Math.max(v.strikingFrom, v.strikingTo) };
}
