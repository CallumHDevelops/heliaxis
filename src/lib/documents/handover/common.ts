import 'server-only';
import type { JobHead } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { longDate, newDocument, type Kit } from '../pdf-kit';

/**
 * What the handover pack's own documents share (SPEC 4.5): the header with the job and date, the site
 * box, the revision per form, and how a generator gets the images it prints (signatures, the sun-path
 * photo) without the inputs carrying bytes.
 */

/** One constant per form, printed in its footer. */
export const REVISION: Record<string, string> = {
  F07BI: 'Rev 1',
  F19I: 'Rev 1',
  F16E: 'Rev 1',
  F47: 'Rev 1',
  F76: 'Rev 1',
  F48I: 'Rev 1',
  F49: 'Rev 1',
  F49A: 'Rev 1',
  F78: 'Rev 2',
  CC4: 'Rev 1',
  CC13: 'Rev 1',
  PACK: 'Rev 1',
};

/** Reads a stored image or file for a generator: 'docs' is crm-docs (signatures), 'photos' is crm-photos. */
export type Loader = (bucket: 'docs' | 'photos', path: string) => Promise<Uint8Array | null>;
export const noFiles: Loader = async () => null;

/** The contractor, as the owner's forms print it. */
export const CONTRACTOR = [HELIAXIS_COMPANY.tradingName, ...HELIAXIS_COMPANY.addressLines, `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}`].join('\n');
export const MCS_CONTACT = 'Telephone: 0333 103 8130 · Email: hello@mcscertified.com';

/** A pack document begun: the header (job and date) and the site box, then the caller's content. */
export async function begin(code: string, title: string, h: JobHead, opts: { label?: string; pairs?: [string, string | null | undefined][]; meta?: [string, string][] } = {}): Promise<Kit> {
  const kit = await newDocument({ code, label: opts.label ?? code, title, revision: REVISION[code] ?? 'Rev 1', jobRef: h.ref, issued: h.issued });
  kit.header({ meta: opts.meta ?? [['Project', h.ref ?? '–'], ['Date', longDate(h.issued)]] });
  kit.idGrid([['Installation address', h.address.join(', ')], ['Customer', h.customer], ...(opts.pairs ?? [])]);
  return kit;
}

/** £1,234.50 from pence. */
export const pounds = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
