import 'server-only';
import { longDay, type G98Input } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { G98_FORM_B } from '@/lib/site/fixed/g98-form-b';
import { begin, type Loader } from './common';

/**
 * The G98 data sheet beside HX-HO-15 (SPEC 4.5, D14; OWNER-DECISIONS 9): an office helper, never in
 * the customer's pack. The values G98 Form B asks for, in its order, to copy into the DNO's own form
 * (src/lib/site/fixed/g98-form-b.ts); the pack's HX-HO-15 item takes the notice as sent. Anything
 * the job hasn't got says so, rather than being filled in.
 */
export const G98_SHEET_TITLE = G98_FORM_B.verified ? 'G98 Form B' : 'G98 data sheet';
const NOT = 'Not recorded';

export async function makeG98Sheet(g: G98Input, load: Loader): Promise<Uint8Array> {
  const kit = await begin('HX-HO-15', G98_SHEET_TITLE, g, { pairs: [['MPAN', g.mpan], ['Switched on', g.devices[0]?.installed ? longDay(g.devices[0].installed) : null]] });
  kit.note('This sheet lists the values Form B asks for, in its order, to copy into the network operator’s (DNO’s) own form. It isn’t the form itself: anything not recorded here is filled in on the DNO’s form.');
  kit.section('1. Customer');
  kit.rows([
    { label: 'Name', value: g.customer },
    { label: 'Address', value: g.address.join(', ') },
    { label: 'Telephone', value: g.phone ?? NOT },
    { label: 'Email', value: g.email ?? NOT },
  ]);
  kit.section('2. Installer');
  kit.rows([
    { label: 'Name', value: HELIAXIS_COMPANY.tradingName },
    { label: 'Accreditation', value: `MCS ${HELIAXIS_COMPANY.mcsNumber}` },
    { label: 'Address', value: HELIAXIS_COMPANY.addressLines.join(', ') },
    { label: 'Telephone', value: HELIAXIS_COMPANY.phone },
    { label: 'Email', value: HELIAXIS_COMPANY.email },
  ]);
  kit.section('3. Installation');
  kit.rows([
    { label: 'Site address', value: g.address.join(', ') },
    { label: 'MPAN', value: g.mpan },
    { label: 'Lockable isolation switch: where it is', value: g.isolator ?? NOT },
  ]);
  kit.section('4. Generation and storage', { intro: 'One row per inverter or battery.' });
  kit.grid({
    columns: ['Device', 'Manufacturer and model', 'Installed', 'Registered capacity', 'Storage', 'ENA product ID', 'Serial'],
    rows: g.devices.map((d) => [d.what, d.model ?? NOT, longDay(d.installed), d.kw ?? NOT, d.kwh ?? '–', d.ena ?? NOT, d.serials.join(', ') || '–']),
    widths: [1.3, 2, 1.3, 1.2, 1, 1.5, 1.5],
  });
  kit.note('Energy source, technology codes and the phase are chosen from the form’s own lists.');
  kit.section('5. Customer’s signature');
  if (g.signature) {
    await kit.signatures([{ title: 'Customer', png: await load('docs', g.signature.path), name: g.signature.name, at: g.signature.signed_at }]);
  } else kit.paragraph('Not signed yet: the customer signs in their portal, or on the electrician’s phone.');
  return kit.save();
}
