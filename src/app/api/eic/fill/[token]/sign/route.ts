import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { readByToken } from '@/lib/eic-manual/request';
import { viewOf, type SigStore } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };
/** The installer signs their own parts only: never the design part, which is the office's. */
const SLOTS = ['eic_sig_con', 'eic_sig_ins', 'eic_sig_one'];

export async function POST(req: Request, { params }: Ctx) {
  const db = createAdminClient();
  const row = await readByToken(db, (await params).token);
  if (!row) return json({ error: 'This link isn’t working any more.' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued, so it can’t be changed.' }, 409);
  const b = (await req.json().catch(() => ({}))) as { slot?: string; dataUrl?: string };
  if (!SLOTS.includes(String(b.slot))) return json({ error: 'Unknown signature' }, 400);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
  if (!m || m[1].length > 280_000) return json({ error: 'Draw the signature again.' }, 400);
  const sigs: SigStore = { ...row.sigs, [b.slot!]: { png: m[1], at: new Date().toISOString() } };
  const request = row.request ? { ...row.request, submitted_at: null } : null;
  await db.from('eic_manual').update({ sigs, request, updated_at: new Date().toISOString() }).eq('id', row.id);
  return json({ ...(await viewOf(db, { ...row, sigs, request }, { name: row.request!.name })), customer: null, project: null });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const db = createAdminClient();
  const row = await readByToken(db, (await params).token);
  if (!row) return json({ error: 'This link isn’t working any more.' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued, so it can’t be changed.' }, 409);
  const slot = new URL(req.url).searchParams.get('slot') ?? '';
  if (!SLOTS.includes(slot)) return json({ error: 'Not found' }, 404);
  const sigs: SigStore = { ...row.sigs };
  delete sigs[slot];
  await db.from('eic_manual').update({ sigs, updated_at: new Date().toISOString() }).eq('id', row.id);
  return json({ ...(await viewOf(db, { ...row, sigs }, { name: row.request!.name })), customer: null, project: null });
}
