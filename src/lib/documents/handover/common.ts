import 'server-only';
import type { JobHead } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { issueOf } from '../issue';
import { longDate, newDocument, type Kit } from '../pdf-kit';

/**
 * What the handover pack's own documents share (SPEC 4.5): the header with the job and date, the site
 * box, the issue printed in each one's footer (documents/issue.ts), and how a generator gets the
 * images it prints (signatures, the sun-path photo) without the inputs carrying bytes.
 */

/** Reads a stored image or file for a generator: 'docs' is crm-docs (signatures), 'photos' is crm-photos. */
export type Loader = (bucket: 'docs' | 'photos', path: string) => Promise<Uint8Array | null>;
export const noFiles: Loader = async () => null;

/** Heliaxis, the installer: name, address, phone and email. */
export const INSTALLER_LINES = [HELIAXIS_COMPANY.tradingName, ...HELIAXIS_COMPANY.addressLines, `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}`].join('\n');
/** MCS's own contact details (a fact). */
export const MCS_CONTACT = 'Telephone 0333 103 8130 · Email hello@mcscertified.com';

/** A pack document begun: the header (job and date) and the site box, then the caller's content. */
export async function begin(code: string, title: string, h: JobHead, opts: { label?: string; pairs?: [string, string | null | undefined][]; meta?: [string, string][] } = {}): Promise<Kit> {
  const kit = await newDocument({ code, label: opts.label ?? code, title, revision: issueOf(code), jobRef: h.ref, issued: h.issued, variant: h.variant });
  kit.header({ meta: opts.meta ?? [['Project', h.ref ?? '–'], ['Date', longDate(h.issued)]] });
  kit.idGrid([['Address', h.address.join(', ')], ['Customer', h.customer], ...(opts.pairs ?? [])]);
  return kit;
}

/** £1,234.50 from pence. */
export const pounds = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
