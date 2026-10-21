/**
 * Maximum earth fault loop impedance (Zs) for a protective device, by device type and rating: the
 * tables in BS 7671 Chapter 41 (41.2, 41.3, 41.4 and 41.6). Empty and `verified: false` until someone
 * copies them from BS 7671:2018+A4:2026 itself (SPEC D14: the sandbox couldn't open the standard, and
 * nobody types a regulated table from memory). Until then the electrician types the maximum permitted
 * Zs for each circuit (EIC column 12), as they would on paper, or takes the figure worked out from
 * first principles (zsCalculated, below), whose source then goes in Remarks as footnote § asks.
 * Flipping `verified` is a deliberate commit naming the page it was copied from.
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

/* ── Worked out from first principles (footnote § of the Schedule of Circuit Details) ─────────── */

/**
 * The maximum permitted Zs worked out instead of read from a table, which the form allows as long as
 * the source is stated in Remarks (column 31, footnote §):
 *
 * - a circuit-breaker of type B, C or D (BS EN 60898-1, or the overcurrent part of a BS EN 61009-1
 *   RCBO): Zs = U0 × Cmin ÷ Ia, with U0 230 V, Cmin 0.95 and Ia the current that trips it at once:
 *   5 × In (type B), 10 × In (C), 20 × In (D). B32 → 1.37 Ω, C32 → 0.68 Ω, B6 → 7.28 Ω.
 * - on a TT supply, where the circuit's RCD gives the fault protection (Reg 411.5): Zs × IΔn ≤ 50 V,
 *   so Zs = 50 V ÷ IΔn. 30 mA → 1667 Ω.
 *
 * Fuses aren't worked out here (their Ia comes from a time–current curve): null, and the electrician
 * types the figure. It's offered as a suggestion they take or override; nothing is filled in for them.
 */
export const ZS_U0 = 230;
export const ZS_CMIN = 0.95;
export const ZS_TT_VOLTS = 50;
const TRIP: Record<string, number> = { B: 5, C: 10, D: 20 };

export type ZsCalc = { ohms: number; source: string };

const round = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 100) / 100);
const positive = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Ia for a circuit-breaker of this type and rating (A), or null (a fuse, or not known yet). */
export function tripCurrent(type: unknown, ratingA: unknown): number | null {
  const k = typeof type === 'string' ? TRIP[type.trim().toUpperCase()] : undefined;
  const In = positive(ratingA);
  return k && In ? k * In : null;
}

/** The calculated maximum Zs for a circuit (from its device; from its RCD on a TT supply), and the words for Remarks. */
export function zsCalculated(c: Record<string, unknown>, opt: { tt?: boolean } = {}): ZsCalc | null {
  const idn = positive(c.rcd_idn);
  if (opt.tt && c.rcd === 'yes' && idn) {
    const ohms = round(ZS_TT_VOLTS / (idn / 1000));
    return { ohms, source: `Max Zs calculated: 50 V ÷ IΔn = 50 ÷ ${idn / 1000} = ${ohms} Ω (TT, RCD fault protection, Reg 411.5)` };
  }
  const ia = tripCurrent(c.ocpd_type, c.ocpd_a);
  if (!ia) return null;
  // U0 × Cmin is 218.5 V; worked in hundredths so 2.185 rounds to 2.19 as it should (not 2.18 from binary fractions).
  const ohms = Math.round((ZS_U0 * Math.round(ZS_CMIN * 100)) / ia) / 100;
  const type = String(c.ocpd_type).trim().toUpperCase();
  return { ohms, source: `Max Zs calculated: U0 × Cmin ÷ Ia = 230 × 0.95 ÷ ${ia} = ${ohms} Ω (type ${type}: Ia = ${TRIP[type]} × In)` };
}

/** Is this the calculation's own note (so a device changed since can be spotted)? */
export const isCalculatedSource = (s: unknown) => typeof s === 'string' && s.startsWith('Max Zs calculated:');
