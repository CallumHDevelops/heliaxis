/**
 * Earthing arrangements, one set of codes for the whole job. The survey (crm_surveys E5), the EV
 * charger record (ev_earthing) and the EIC (eic_earthing) each keep their own option keys, as saved
 * answers already use them; everything that reads one from another goes through here, in the EIC's
 * codes (Section F of the model form): TN-C, TN-S, TN-C-S (PME), TN-C-S (PNB), TT and IT.
 *
 * A code a form can't say (IT or TN-C on the EV record, PNB on the survey) maps to nothing, so it's
 * never carried across as something else. Pure (no imports): the phone, the server and the tests.
 */

export type Earthing = 'tn_c' | 'tn_s' | 'tn_c_s_pme' | 'tn_c_s_pnb' | 'tt' | 'it';

export const EARTHING_LABEL: Record<Earthing, string> = {
  tn_c: 'TN-C',
  tn_s: 'TN-S',
  tn_c_s_pme: 'TN-C-S (PME)',
  tn_c_s_pnb: 'TN-C-S (PNB)',
  tt: 'TT',
  it: 'IT',
};

export const isEarthing = (v: unknown): v is Earthing => typeof v === 'string' && Object.prototype.hasOwnProperty.call(EARTHING_LABEL, v);

/** The survey's E5: tncs (asked as "TN-C-S (PME)"), tns, tt, unknown. */
const SURVEY: Record<string, Earthing> = { tncs: 'tn_c_s_pme', tns: 'tn_s', tt: 'tt' };
/** The EV charger record's keys. */
const EV: Record<string, Earthing> = { tn_s: 'tn_s', tncs_pme: 'tn_c_s_pme', tncs_pnb: 'tn_c_s_pnb', tt: 'tt' };

const pick = (map: Record<string, Earthing>, v: unknown): Earthing | null => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : null);

/** The survey's answer in the EIC's codes ("Don't know" is nothing). */
export const earthingFromSurvey = (v: unknown): Earthing | null => pick(SURVEY, v);
/** The EV record's answer in the EIC's codes. */
export const earthingFromEv = (v: unknown): Earthing | null => pick(EV, v);
/** An EIC code as the EV record's key (null where the EV record has no such choice). */
export function earthingToEv(e: unknown): string | null {
  if (!isEarthing(e)) return null;
  return Object.entries(EV).find(([, x]) => x === e)?.[0] ?? null;
}
/** The EIC's own answer, if it's one of its codes. */
export const earthingFromEic = (v: unknown): Earthing | null => (isEarthing(v) ? v : null);
