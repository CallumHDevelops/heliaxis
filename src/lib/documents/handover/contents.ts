import 'server-only';
import { GROUPS, type Group } from '@/lib/handover/slots';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { longDate, newDocument } from '../pdf-kit';
import { issueOf } from '../issue';
import { MCS_CONTACT } from './common';

/**
 * The combined pack's contents page (SPEC 4.7): the groups in pack order, each document with the pack
 * page it starts on, "To follow" for what hasn't arrived and "Separate file in your portal" for what
 * isn't merged (signed or protected PDFs, Word files, big manuals); then the "Your system" box and who
 * to call. Built last, once every page count is known, and placed straight after the cover letter.
 */

export type ContentsLine = { title: string; group: Exclude<Group, 'cover'>; order: number; page: number | null; status: 'in' | 'separate' | 'follow' };
export type ContentsInput = {
  ref: string | null;
  issued: string;
  customer: string;
  address: string[];
  version: number;
  /** "Adds your MCS certificate" (from version 2). */
  changes: string[];
  lines: ContentsLine[];
  system: [string, string][];
};

export const CONTENTS_TITLE = 'Your handover pack';

export async function makeContents(c: ContentsInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'PACK', label: 'Contents', title: CONTENTS_TITLE, revision: issueOf('PACK'), jobRef: c.ref, issued: c.issued });
  kit.header({ meta: [['Project', c.ref ?? '–'], ['Version', String(c.version)], ['Date', longDate(c.issued)]] });
  kit.idGrid([
    ['Installation address', c.address.join(', ')],
    ['Customer', c.customer],
  ]);
  if (c.version > 1 && c.changes.length) kit.paragraph(`What’s new in version ${c.version}: ${c.changes.join('; ')}.`, { bold: true });
  for (const g of GROUPS) {
    const items = c.lines.filter((l) => l.group === g.key).sort((a, b) => a.order - b.order);
    if (!items.length) continue;
    kit.grid({
      columns: [g.title, 'Page'],
      rows: items.map((l) => [l.status === 'in' ? l.title : `${l.title}: ${l.status === 'follow' ? 'to follow' : 'separate file in your portal'}`, l.status === 'in' && l.page ? String(l.page) : '–']),
      widths: [6, 1],
    });
  }
  if (c.system.length) {
    kit.section('Your system');
    kit.idGrid(c.system);
  }
  kit.section('Who to call');
  kit.rows([
    { label: 'Heliaxis', value: `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}` },
    { label: 'MCS', value: MCS_CONTACT.replace('Telephone ', '').replace(' · Email ', ' · ') },
  ]);
  return kit.save();
}
