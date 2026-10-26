/**
 * Share of local search visibility from the monthly manual checks (docs/social-monitoring/09 §6). Pure.
 * A business scores more the nearer the top it appears: #1 = 10 points down to #10 = 1, nothing below that.
 * Organic and local-pack positions are scored separately and added. The share is each business's points
 * divided by all the points on the searches that were checked. It is a simple, explainable measure, not a traffic estimate.
 */

export type RankRow = { keyword_id: number; competitor_id: string; organic_rank: number | null; local_pack_rank: number | null };

/** 10 points for first place, 1 for tenth, 0 beyond or when not seen. */
export const pointsForRank = (rank: number | null | undefined) => (rank && rank >= 1 && rank <= 10 ? 11 - rank : 0);

export function visibilityShares(rows: RankRow[]): { shares: Record<string, number>; searches: number; total: number } {
  const points: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const p = pointsForRank(r.organic_rank) + pointsForRank(r.local_pack_rank);
    points[r.competitor_id] = (points[r.competitor_id] ?? 0) + p;
    total += p;
  }
  const shares: Record<string, number> = {};
  for (const [id, p] of Object.entries(points)) shares[id] = total > 0 ? Math.round((p / total) * 1000) / 10 : 0;
  return { shares, searches: new Set(rows.map((r) => r.keyword_id)).size, total };
}
