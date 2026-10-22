import 'server-only';
import type { CoverInput } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { longDate, newDocument } from '../pdf-kit';
import { issueOf } from '../issue';

/**
 * HX-HO-01, the covering letter (SPEC 4.5): the letterhead, the customer and address, a thank-you,
 * what was installed in plain words, the pack's contents with each item enclosed or to follow, the
 * references as they arrive, what to do next, who to call, signed with the job owner's typed name.
 * The words are the draft the owner approved in CRM settings (DRAFTS.cover).
 */
export const COVER_TITLE = 'Covering letter';

export async function makeCoverLetter(c: CoverInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HX-HO-01', title: COVER_TITLE, revision: issueOf('HX-HO-01'), jobRef: c.ref, issued: c.issued, variant: c.variant });
  kit.header({ meta: [['Project', c.ref ?? '–'], ['Date', longDate(c.issued)]] });
  kit.paragraph([c.customer, ...c.address].join('\n'), { bold: true });
  kit.gap(4);
  kit.paragraph(`Dear ${c.first || c.customer},`);
  kit.paragraph('Thank you for choosing Heliaxis. This pack has everything about the system we installed at your home: the certificates, the warranties, how to look after it and the manufacturers’ information.');

  if (c.installed.length) {
    kit.section('What we installed');
    kit.paragraph(c.installed.map((l) => `•  ${l}`).join('\n'));
  }

  kit.section('What’s in this pack', { intro: 'Each document is in this pack and in your online portal. Anything still to follow will appear in your portal as soon as it arrives.' });
  for (const g of c.contents) {
    kit.grid({ columns: [g.group, 'In this pack'], rows: g.items.map((i) => [i.title, i.status]), widths: [3, 4] });
  }

  if (c.refs.length) {
    kit.section('Your references');
    kit.rows(c.refs.map(([label, value]) => ({ label, value })));
  }

  kit.section('What to do next');
  kit.paragraph(c.next.map((l) => `•  ${l}`).join('\n'));

  kit.section('If you need us');
  kit.paragraph(`If anything doesn’t look right, or you have a question, call us on ${HELIAXIS_COMPANY.phone} or email ${HELIAXIS_COMPANY.email}. We’ll be in touch shortly to go through this pack with you.`);
  kit.gap(6);
  kit.paragraph('Yours sincerely,');
  kit.gap(4);
  kit.paragraph(c.owner ? `${c.owner}\nfor Heliaxis` : 'The Heliaxis team', { bold: true });
  return kit.save();
}
