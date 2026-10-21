import 'server-only';
import { longDay, type G99Input } from '@/lib/handover/inputs';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { begin } from './common';

/**
 * The G99 data sheet beside HX-HO-16 (SPEC 4.5): everything the job holds that the DNO's G99 forms ask
 * for, to copy into whichever form National Grid wants now (G99 Issue 2 may have replaced the owner's
 * Issue 1.9, src/lib/site/fixed/g99.ts). An office helper: it's never in the customer's pack, which
 * gets the application, the acceptance and the installation document as sent.
 */
export const G99_SHEET_TITLE = 'G99 data sheet';
const NOT = 'Not recorded';

export async function makeG99Sheet(g: G99Input): Promise<Uint8Array> {
  const kit = await begin('HX-HO-16', G99_SHEET_TITLE, g, { pairs: [['MPAN', g.mpan ?? NOT], ['DNO reference', g.dnoRef ?? 'Not applied yet']] });
  kit.note('For the office: the values the G99 forms ask for, to copy into the DNO’s current form. Not for the customer’s pack.');
  kit.section('Customer');
  kit.rows([
    { label: 'Name', value: g.customer },
    { label: 'Site address', value: g.address.join(', ') },
    { label: 'Telephone', value: g.phone ?? NOT },
    { label: 'Email', value: g.email ?? NOT },
    { label: 'MPAN', value: g.mpan ?? NOT },
  ]);
  kit.section('Installer');
  kit.rows([
    { label: 'Company', value: HELIAXIS_COMPANY.tradingName },
    { label: 'MCS number', value: HELIAXIS_COMPANY.mcsNumber },
    { label: 'Address', value: HELIAXIS_COMPANY.addressLines.join(', ') },
    { label: 'Telephone', value: HELIAXIS_COMPANY.phone },
  ]);
  kit.section('Generation and storage');
  kit.grid({
    columns: ['Device', 'Manufacturer and model', 'Rating', 'Storage', 'ENA product ID', 'Serial'],
    rows: g.devices.map((d) => [d.what, d.model ?? NOT, d.kw ?? NOT, d.kwh ?? '–', d.ena ?? 'Add it in the product library', d.serials.join(', ') || '–']),
    widths: [1.3, 2.2, 1, 1, 1.5, 1.5],
  });
  kit.rows([
    { label: 'Export limit', value: g.exportLimit ?? 'None recorded' },
    { label: 'Switched on', value: g.devices[0]?.installed ? longDay(g.devices[0].installed) : 'Not yet' },
  ]);
  return kit.save();
}
