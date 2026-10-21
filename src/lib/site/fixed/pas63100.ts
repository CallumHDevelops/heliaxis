/**
 * PAS 63100:2024 (fire safety of home battery systems): its Annex B verification checklist (Table
 * B.1) and the statement of conformity, word for word, once someone has copied them from the owner's
 * copy of the PAS (D14, SPEC §15). Until then `verified` stays false: the electrician answers
 * Heliaxis's own "Battery location check" instead (forms/electrician/pas63100.ts, never in PAS
 * words), and the F74A and F74B handover items wait for an upload. Flipping `verified` is a
 * deliberate commit naming the source document.
 */
export const PAS63100: {
  source: string;
  issue: string | null;
  verified: boolean;
  /** Annex B Table B.1 rows, exactly as printed. */
  rows: { ref: string; text: string }[];
  /** The statement of conformity (F74B), exactly as printed. */
  statement: string | null;
} = {
  source: 'PAS 63100:2024',
  issue: null,
  verified: false,
  rows: [],
  statement: null,
};
