import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { moveSitePostcodes } from '@/lib/crm/move-site-postcodes';
import { postcodeKey } from '@/lib/crm/site-postcode';
import { toWaId } from '@/lib/whatsapp/shared';
import { permissionStop, setPermissionByStaff, STAFF_STOP_PREFIX, type StopRecord } from '@/lib/whatsapp/permission';

export const dynamic = 'force-dynamic';

/**
 * Edit the customer's contact details. Changing the mobile re-links WhatsApp: any chat on that
 * number (on any enquiry) then shows on their CRM timeline. Correcting the postcode moves the site
 * postcode on their jobs that only had a copy of the old one → `movedJobs`: those jobs' ids.
 * `whatsapp_opt_in: true | false` records WhatsApp permission given to staff ('staff:<name>') or
 * withdrawn ('staff-stop:<name>': no automatic WhatsApps, whatever the rule says) on every enquiry
 * with their number → { ok, liftedStop }. Switching it on when they replied STOP (or staff switched it
 * off) also needs `lift_stop: true`; without it nothing is saved → 409 { stopped: true, error }.
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
  const liftStop = b.lift_stop === true;
  // Checked before anything is saved, so a refused switch-on changes nothing.
  if (b.whatsapp_opt_in === true && !liftStop) {
    const stop = await permissionStop(id);
    if (stop) return stoppedResponse(stop);
  }
  const db = createAdminClient();
  const { data: before } = await db.from('enquiries').select('phone, postcode').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);
  if (Object.keys(u).length) {
    const { error } = await db.from('enquiries').update(u).eq('id', id);
    if (error) return json({ error: error.message }, 500);
  }
  if ('phone' in u && u.phone !== before.phone) {
    await logActivity({ enquiryId: id, kind: 'system', body: `Mobile changed to ${u.phone || '—'}`, byId: s.user.id });
  }
  // Customer → Edit sends the postcode every time: only a real change looks at their jobs.
  const pcWas = (before.postcode as string | null) ?? null;
  const pcNow = (u.postcode as string | null | undefined) ?? null;
  const movedJobs = 'postcode' in u && pcNow && postcodeKey(pcNow) !== postcodeKey(pcWas) ? await moveSitePostcodes(id, pcWas, pcNow, s.user.id) : [];

  if (typeof b.whatsapp_opt_in === 'boolean') {
    const on = b.whatsapp_opt_in;
    const who = s.profile.full_name?.trim() || s.profile.email?.split('@')[0] || 'staff';
    const r = await setPermissionByStaff(id, on, who, { liftStop });
    if (r.stopped) return stoppedResponse(r.stopped);
    if (!r.ok) return json({ error: r.error || 'Not saved' }, 500);
    const note = on
      ? r.liftedStop
        ? ' (they had replied STOP)'
        : r.liftedStaffStop
          ? ' (it had been switched off)'
          : ''
      : ' (no automatic WhatsApps to them)';
    await logActivity({ enquiryId: id, kind: 'system', body: `WhatsApp permission turned ${on ? 'on' : 'off'} by ${who}${note}`, byId: s.user.id });
    const { data: after } = await db.from('enquiries').select('*').eq('id', id).maybeSingle();
    return json({
      ok: true,
      liftedStop: r.liftedStop || r.liftedStaffStop,
      movedJobs,
      whatsapp_opt_in: on,
      whatsapp_opt_in_at: (after?.whatsapp_opt_in_at as string | null | undefined) ?? null,
      whatsapp_opt_in_source: (after?.whatsapp_opt_in_source as string | null | undefined) ?? null,
      ...(r.recorded
        ? {}
        : {
            warning: on
              ? 'Saved, but when and how they agreed needs crm-v3.sql: run it from the to-do list.'
              : 'Saved, but automatic WhatsApps can only be kept off once crm-v3.sql is run: run it from the to-do list.',
          }),
    });
  }
  return json({ ok: true, movedJobs });
}

/** Switching on was refused: they replied STOP, or staff switched it off. */
function stoppedResponse(stop: StopRecord) {
  const when = stop.at
    ? ` on ${new Date(stop.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`
    : '';
  const by = stop.source.startsWith(STAFF_STOP_PREFIX) ? stop.source.slice(STAFF_STOP_PREFIX.length) || 'Staff' : null;
  const error = by
    ? `${by} switched WhatsApp permission off${when}, so it’s still off. Only switch it on if the customer has asked you to.`
    : `They replied STOP${when}, so it’s still off. Only switch it on if they’ve asked you to.`;
  return json({ error, stopped: true }, 409);
}
