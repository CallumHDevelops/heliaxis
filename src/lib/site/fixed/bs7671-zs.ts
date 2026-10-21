/**
 * Maximum earth fault loop impedance (Zs) for a protective device, by device type and rating: the
 * tables in BS 7671 Chapter 41 (41.2, 41.3, 41.4 and 41.6). Empty and `verified: false` until someone
 * copies them from BS 7671:2018+A4:2026 itself (SPEC D14: the sandbox couldn't open the standard, and
 * nobody types a regulated table from memory). Until then the electrician types the maximum permitted
 * Zs for each circuit (EIC column 12), as they would on paper. Flipping `verified` is a deliberate
 * commit naming the page it was copied from.
 */
export type ZsRow = { bs: string; type: string; ratingA: number; disconnectS: number; maxOhm: number };

export const ZS_MAX: { standard: string; issue: string; verified: boolean; rows: ZsRow[] } = {
  standard: 'BS 7671 Chapter 41 (Tables 41.2, 41.3, 41.4, 41.6)',
  issue: 'BS 7671:2018+A4:2026',
  verified: false,
  rows: [],
};

const norm = (s: string) => s.toUpperCase().replace(/^BS\s*(EN)?\s*/, '').replace(/\s+/g, '');

/** The table's maximum for this device, or null (not verified yet, or not in the table). */
export function maxZsFor(bs: string | null | undefined, type: string | null | undefined, ratingA: number | null | undefined, table = ZS_MAX): number | null {
  if (!table.verified || !bs || !type || !ratingA) return null;
  const row = table.rows.find((r) => norm(r.bs) === norm(bs) && r.type.toUpperCase() === type.trim().toUpperCase() && r.ratingA === ratingA);
  return row ? row.maxOhm : null;
}
