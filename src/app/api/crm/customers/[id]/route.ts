import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { toWaId } from '@/lib/whatsapp/shared';
import { setPermissionByStaff } from '@/lib/whatsapp/permission';

export const dynamic = 'force-dynamic';

/**
 * Edit the customer's contact details. Changing the mobile re-links WhatsApp: any chat on that
 * number (on any enquiry) then shows on their CRM timeline.
 * `whatsapp_opt_in: true | false` records WhatsApp permission given (or withdrawn) to staff, as
 * 'staff:<name>', on every enquiry with their number; switching it on also lifts a STOP.
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
  if ('whatsapp_opt_in' in b && typeof b.whatsapp_opt_in !== 'boolean') return json({ error: 'whatsapp_opt_in must be true or false' }, 400);
  const db = createAdminClient();
  const { data: before } = await db.from('enquiries').select('phone').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);
  if (Object.keys(u).length) {
    const { error } = await db.from('enquiries').update(u).eq('id', id);
    if (error) return json({ error: error.message }, 500);
  }
  if ('phone' in u && u.phone !== before.phone) {
    await logActivity({ enquiryId: id, kind: 'system', body: `Mobile changed to ${u.phone || '—'}`, byId: s.user.id });
  }

  if (typeof b.whatsapp_opt_in === 'boolean') {
    const on = b.whatsapp_opt_in;
    const who = s.profile.full_name?.trim() || s.profile.email?.split('@')[0] || 'staff';
    const r = await setPermissionByStaff(id, on, who);
    if (!r.ok) return json({ error: r.error || 'Not saved' }, 500);
    await logActivity({
      enquiryId: id,
      kind: 'system',
      body: `WhatsApp permission turned ${on ? 'on' : 'off'} by ${who}${r.liftedStop ? ' (they had replied STOP)' : ''}`,
      byId: s.user.id,
    });
    const { data: after } = await db.from('enquiries').select('*').eq('id', id).maybeSingle();
    return json({
      ok: true,
      whatsapp_opt_in: on,
      whatsapp_opt_in_at: (after?.whatsapp_opt_in_at as string | null | undefined) ?? null,
      whatsapp_opt_in_source: (after?.whatsapp_opt_in_source as string | null | undefined) ?? null,
      ...(r.recorded ? {} : { warning: 'Saved, but when and how they agreed needs crm-v3.sql: run it from the to-do list.' }),
    });
  }
  return json({ ok: true });
}
