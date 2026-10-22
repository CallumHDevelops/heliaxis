/**
 * The Minor Electrical Installation Works Certificate's fixed wording (SPEC D14, 3.3). A4:2026 re-laid
 * the form out as Sections A–E (REGS 1.4 [S]), and no copy of its text, A2 or A4, was readable here,
 * so there's nothing to copy yet: `verified` is false and `declaration` null. Until a person copies the
 * A4 form's sections and declaration from the IET's PDF (REGS 7), each Minor Works prints as a "Minor
 * Works data sheet": every value in the form's order, for copying onto the electrician's own
 * certificate, which is then uploaded into the handover pack (HX-HO-04). It isn't filed as a certificate.
 */
export const IET_MEIWC = {
  source: 'IET model Minor Electrical Installation Works Certificate, BS 7671:2018+A4:2026',
  issue: 'A4:2026',
  verified: false,
  /** Section letters and titles, once copied: { letter, title }. */
  sections: [] as { letter: string; title: string }[],
  declaration: null as ((amended: string) => string) | null,
};
