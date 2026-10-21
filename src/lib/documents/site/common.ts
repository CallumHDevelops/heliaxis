import 'server-only';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { longDate, type Kit, type Mark, type SignatureItem, type Variant } from '@/lib/documents/pdf-kit';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { valueOf } from '@/lib/site/rules';

/**
 * What the electrician's documents share (F43, F44, F44A, F74, F75, the EV and heat pump records):
 * the input every generator takes, the merge fields (FORMS 0.5), marks and words for answers, and
 * the signature block. The answers come as the rules' context, so "answer once, print everywhere"
 * (FORMS 1.6) is one set of values read by every document.
 */

export type ElectricianDocInput = {
  /** crm_projects.project_ref ("HX-0042"): the forms' "Project reference". */
  jobRef: string | null;
  /** The installation address, a line each, the postcode last. */
  address: string[];
  customer: string | null;
  /** The commissioning engineer: who signed the electrician's pack, and their firm. */
  engineer: string;
  company: string | null;
  /** The commissioning date (YYYY-MM-DD, the sign-off's UK day) and the sign-off time. */
  date: string;
  signedAt: string;
  signature: Uint8Array | null;
  /** The answers and everything they're read with (the job's design, the roofer, the certificate). */
  ctx: FormCtx;
  /** A draft for the office (not signed yet): "Not answered" shows instead of stopping. */
  draft?: boolean;
  /** 'digital' (the default: stored, emailed, the portal, the handover pack) or 'print' (the ink saver, on request). */
  variant?: Variant;
};

const WORD: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A', pass: 'Pass', fail: 'Fail' };

/** A TICK answer as the form's mark: ✓ done, ✗ problem, N/A. */
export const markOf = (v: unknown): Mark => (v === 'done' ? 'tick' : v === 'problem' ? 'cross' : v === 'na' ? 'na' : null);

/** An answer as the form prints it (Pass, Y, 6 mm², the chosen option's words). */
export function words(f: Field, v: unknown, unitInLabel = false): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (v === 'na') return 'N/A';
  switch (f.type) {
    case 'CONFIRM':
      return v === true ? 'Confirmed' : v === 'cant' ? 'Couldn’t confirm' : null;
    case 'NUM':
      return `${v}${f.unit && !unitInLabel ? ` ${f.unit}` : ''}`;
    case 'SEL':
      return f.options?.find((o) => o.key === v)?.label ?? String(v);
    case 'MULTI':
      return Array.isArray(v) ? v.map((k) => f.options?.find((o) => o.key === k)?.label ?? String(k)).join(', ') : null;
    default:
      return typeof v === 'string' ? (WORD[v] ?? v) : String(v);
  }
}

/** The answer to a field, worked out where the form works it out. */
export const answer = (f: Field, c: FormCtx) => valueOf(f, c);

export const addressWords = (lines: string[]) => lines.filter(Boolean).join(', ');

/** The merge fields at the top of every form: Project reference, Installation Address, by, Date. */
export function siteBox(kit: Kit, d: ElectricianDocInput, by: string) {
  kit.idGrid([
    ['Project reference', d.jobRef],
    ['Date', longDate(d.date)],
    ['Installation address', addressWords(d.address)],
    [by, [d.engineer, d.company].filter(Boolean).join(', ')],
  ]);
}

/** The installer's block (F44 carries it under the header). */
export const installerLines = () => [HELIAXIS_COMPANY.tradingName, ...HELIAXIS_COMPANY.addressLines, HELIAXIS_COMPANY.phone, HELIAXIS_COMPANY.email].join(', ');

/** The electrician's signature at the end (FORMS 1.1–1.4 Rec.: F43, F44 and F74 have no line of their own). */
export async function signature(kit: Kit, d: ElectricianDocInput, title: string) {
  if (d.draft) return;
  const sig: SignatureItem = { title, png: d.signature, name: [d.engineer, d.company].filter(Boolean).join(', '), at: d.signedAt };
  await kit.signatures([sig]);
}

/** "Note 1: …" for crosses: numbered in the order they appear on the form. */
export function noter() {
  let n = 0;
  return (text: string | null | undefined): string | null => {
    n++;
    return `Note ${n}: ${text?.trim() || 'see comments'}`;
  };
}
