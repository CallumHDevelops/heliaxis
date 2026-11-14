import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { readEic, SIG_KEYS, viewOf, type SigStore } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** A signature drawn on the page: { slot, dataUrl (a PNG, up to 200 kB) }. Replies with the new view. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { slot?: string; dataUrl?: string };
  if (!(SIG_KEYS as readonly string[]).includes(String(b.slot))) return json({ error: 'Unknown signature' }, 400);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
  if (!m || m[1].length > 280_000) return json({ error: 'Draw the signature again.' }, 400);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued. Reopen it to change it.' }, 409);
  const sigs: SigStore = { ...row.sigs, [b.slot!]: { png: m[1], at: new Date().toISOString() } };
  await db.from('eic_manual').update({ sigs, updated_at: new Date().toISOString() }).eq('id', id);
  return json(await viewOf(db, { ...row, sigs }, { name: s.profile.full_name || '' }));
}

/** ?slot= takes a signature off. */
export async function DELETE(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const slot = new URL(req.url).searchParams.get('slot') ?? '';
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row || !(SIG_KEYS as readonly string[]).includes(slot)) return json({ error: 'Not found' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued. Reopen it to change it.' }, 409);
  const sigs: SigStore = { ...row.sigs };
  delete sigs[slot];
  await db.from('eic_manual').update({ sigs, updated_at: new Date().toISOString() }).eq('id', id);
  return json(await viewOf(db, { ...row, sigs }, { name: s.profile.full_name || '' }));
}
