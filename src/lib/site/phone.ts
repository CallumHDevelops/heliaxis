/**
 * The checks on a trade's mobile and email, shared by the Site tab, New project, the subcontractor
 * page and the API. No imports, so the admin pages that only need these don't load the trades'
 * forms and the EIC with them (assign.ts imports the certificate routes); assign.ts re-exports them.
 */

/** A phone number as WhatsApp ids it (country code and number, digits only), as whatsapp/shared.ts toWaId. */
export function waIdOf(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/^\+/, '00').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `44${d.slice(1)}`;
  if (d.startsWith('440')) d = `44${d.slice(3)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** What's wrong with a number typed as a mobile, in plain words, or null. Numbers abroad are taken as they are. */
export function mobileProblem(mobile: string | null | undefined): string | null {
  const s = String(mobile ?? '').trim();
  if (!s) return null;
  const wa = waIdOf(s);
  if (!wa) return 'That isn’t a phone number we can use. Check the digits.';
  if (wa.startsWith('44') && !/^447\d{9}$/.test(wa)) return 'That looks like a landline. WhatsApp needs a mobile.';
  return null;
}

export const isEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 200 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
