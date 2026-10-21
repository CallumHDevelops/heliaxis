import 'server-only';
import { longDate, type Kit, type Mark, type SignatureItem } from '@/lib/documents/pdf-kit';
import { recordStatement, signedStatement, type RecordCode } from '@/lib/site/declaration';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { valueOf } from '@/lib/site/rules';

/**
 * What the electrician's documents share (the solar PV and battery records, the EV and heat pump
 * records): the input every generator takes, the job's details at the top, marks and words for
 * answers, the record's statement as signed, and the signature block. The answers come as the rules'
 * context, so "answer once, print everywhere" (FORMS 1.6) is one set of values read by every document.
 */

export type ElectricianDocInput = {
  /** crm_projects.project_ref ("HX-0042"): the records' "Job reference". */
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
  /** The declaration as signed (site_signoffs.declaration): each record prints its own statement from it. */
  declaration?: string | null;
  /** The job's Building Control reference (paperwork.building_regs_ref), once the office has it. */
  buildingRef?: string | null;
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

/** The job's details at the top of every record: Job reference, the date, Address, and who did it. */
export function siteBox(kit: Kit, d: ElectricianDocInput, by: string, dateLabel = 'Date') {
  kit.idGrid([
    ['Job reference', d.jobRef],
    [dateLabel, longDate(d.date)],
    ['Address', addressWords(d.address)],
    [by, [d.engineer, d.company].filter(Boolean).join(', ')],
  ]);
}

/** A record's statement: as the electrician signed it (their declaration), else as it reads for this job. */
export const statementOf = (d: ElectricianDocInput, code: RecordCode) =>
  signedStatement(d.declaration, code) ?? recordStatement(code, addressWords(d.address), longDate(d.date), d.ctx.products);

/** The record's statement, then the electrician's signature under it (drafts: the statement only). */
export async function signature(kit: Kit, d: ElectricianDocInput, title: string, code?: RecordCode) {
  if (code) {
    kit.section('Statement', { keep: 120 });
    kit.paragraph(statementOf(d, code));
  }
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
