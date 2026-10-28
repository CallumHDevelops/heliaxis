import { crmSession, json } from '@/lib/crm/server';
import { tidyAddress } from '@/lib/greeting-name';
import { addressPickerOn, place, suggest } from '@/lib/estimator/address-lookup';

export const dynamic = 'force-dynamic';

/**
 * Address lookup for staff adding someone to the CRM (Ideal Postcodes, UK). ?q=2 marine terr → { suggestions }.
 * ?id=… (one of those suggestions) → { address, postcode, lat, lng }. { configured: false } when no key is set.
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!addressPickerOn()) return json({ configured: false, suggestions: [] });
  const q = new URL(req.url).searchParams;
  const id = (q.get('id') || '').trim();
  if (id) {
    const p = await place(id);
    if (!p) return json({ error: 'Couldn’t get that address. Type it in instead.' }, 404);
    // The lines without the postcode on the end: the postcode has its own box.
    const lines = tidyAddress(p.address).replace(new RegExp(`,?\\s*${p.postcode.replace(/\s+/g, '\\s*')}\\s*$`, 'i'), '');
    return json({ configured: true, address: lines, postcode: p.postcode, lat: p.lat, lng: p.lng });
  }
  return json({ configured: true, suggestions: await suggest((q.get('q') || '').slice(0, 100)) });
}
