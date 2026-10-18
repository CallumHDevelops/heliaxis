import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';

/**
 * Edit the customer's contact details. Changing the mobile re-links WhatsApp: any chat on that
 * number (on any enquiry) then shows on their CRM timeline.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('name' in b) {
    const name = String(b.name || '').trim();
    if (!name) return json({ error: 'The customer needs a name.' }, 400);
    u.name = name.slice(0, 200);
  }
  if ('email' in b) u.email = String(b.email || '').trim().slice(0, 200);
  if ('postcode' in b) u.postcode = String(b.postcode || '').trim().toUpperCase().slice(0, 12) || null;
  if ('phone' in b) {
    const phone = String(b.phone || '').trim();
    if (phone && !toWaId(phone)) return json({ error: 'That doesn’t look like a phone number.' }, 400);
    u.phone = phone || null;
    u.wa_id = toWaId(phone);
  }
  const db = createAdminClient();
  const { data: before } = await db.from('enquiries').select('phone').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);
  const { error } = await db.from('enquiries').update(u).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  if ('phone' in u && u.phone !== before.phone) {
    await logActivity({ enquiryId: id, kind: 'system', body: `Mobile changed to ${u.phone || '—'}`, byId: s.user.id });
  }
  return json({ ok: true });
}
