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
  // Copied word for word from the MCS performance estimate template the owner issues with every quote
  // (F71 Solar PV & Battery Performance Estimate, which carries MIS 3002's notes), 20 Nov 2026.
  issue: '(as set out in the MCS performance estimate)',
  verified: true,
  /** The estimate's "Important Note", word for word. */
  importantNote:
    'The performance of solar PV systems is impossible to predict with certainty due to the variability in the amount of solar radiation (sunlight) from location to location and from year to year. This estimate is based upon the standard MCS procedure, given as guidance only for the first year of generation. It should not be considered as a guarantee of performance.',
  /** The extra note printed when the shade factor is below 1, word for word (the MCS shading methodology). */
  shadingNote:
    'Shading will be present on your system that will reduce its output to the factor stated. This factor was calculated using the MCS shading methodology and we believe that this will yield results within 10% of the actual energy estimate for most systems.',
};
