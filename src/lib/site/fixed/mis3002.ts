/**
 * MIS 3002's wording for the performance estimate (the "Important Note") and the shading notes, for
 * HX-HO-10, the solar estimate, shading and care page (SPEC 4.5, D14). Not copied yet: the research could only see the note's first lines in search
 * extracts, and the handover pack never prints a standard's wording from a summary. Until someone
 * copies both texts word for word from the issue the owner works to (owner question 3) and sets
 * `verified: true` in a commit naming that document, HX-HO-10 isn't made: the office uploads its own.
 */
export type Mis3002Notes = { source: string; issue: string; verified: boolean; importantNote: string; shadingNote: string };

export const MIS3002_NOTES: Mis3002Notes = {
  source: 'MCS MIS 3002',
  issue: '(issue to confirm with the owner)',
  verified: false,
  /** The estimate's "Important Note", word for word. */
  importantNote: '',
  /** The extra note printed when the shade factor is below 1, word for word. */
  shadingNote: '',
};
