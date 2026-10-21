/**
 * Every Heliaxis document's issue in the quality system (CODE-MAP 4), printed in its footer
 * ("HX-PV-02 · Issue 1 · Page 2 of 3"). One map, keyed by the document codes; a document's issue
 * goes up when its wording changes and the owner approves it. Pure.
 */
export const ISSUE: Record<string, string> = {
  'HX-PV-01': 'Issue 1',
  'HX-PV-02': 'Issue 1',
  'HX-PV-03': 'Issue 1',
  'HX-BAT-01': 'Issue 1',
  'HX-BAT-02': 'Issue 1',
  'HX-HO-01': 'Issue 1',
  'HX-HO-02': 'Issue 1',
  'HX-HO-06': 'Issue 1',
  'HX-HO-08': 'Issue 1',
  'HX-HO-09': 'Issue 1',
  'HX-HO-10': 'Issue 1',
  'HX-HO-11': 'Issue 1',
  'HX-HO-12': 'Issue 1',
  'HX-HO-15': 'Issue 1',
  'HX-HO-16': 'Issue 1',
  'HX-HO-18': 'Issue 1',
  'HX-EV-01': 'Issue 1',
  'HX-HP-01': 'Issue 1',
  PACK: 'Issue 1',
};
export const issueOf = (code: string) => ISSUE[code] ?? 'Issue 1';
