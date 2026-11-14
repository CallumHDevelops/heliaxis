import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { msConfigured } from '@/lib/ms365';
import { newToken, sendRequest } from '@/lib/eic-manual/request';
import { ctxOf, readEic, viewOf, type InfoRequest } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Request information: { name, email, message? } emails the installer a personal link to fill the certificate in. Asking again (or resending)
 * keeps the same link and what they have already entered. Replies with the new view.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; message?: string };
  const name = String(b.name ?? '').trim().slice(0, 120);
  const email = String(b.email ?? '').trim().slice(0, 200);
  if (!name) return json({ error: 'Who is it for? Add their name.' }, 400);
  if (!EMAIL.test(email)) return json({ error: 'That email address doesn’t look right.' }, 400);
  if (!msConfigured()) return json({ error: 'Email isn’t set up on this system, so nothing can be sent.' }, 503);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued. Reopen it first.' }, 409);
  const who = { name: s.profile.full_name || '' };
  const request = { token: row.request?.token ?? newToken(), name, email, message: String(b.message ?? '').trim().slice(0, 1500), sent_at: new Date().toISOString(), submitted_at: null } satisfies InfoRequest;
  const ctx = await ctxOf(db, row, who);
  try {
    await sendRequest(row, request, { customer: ctx.customer, address: ctx.address, from: who.name });
  } catch (e) {
    return json({ error: `The email didn’t send: ${e instanceof Error ? e.message : 'try again'}.` }, 502);
  }
  await db.from('eic_manual').update({ request, updated_at: new Date().toISOString() }).eq('id', id);
  return json(await viewOf(db, { ...row, request }, who));
}

/** Withdraw the request: the link stops working. What they entered stays on the certificate. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  await db.from('eic_manual').update({ request: null, updated_at: new Date().toISOString() }).eq('id', id);
  return json(await viewOf(db, { ...row, request: null }, { name: s.profile.full_name || '' }));
}
