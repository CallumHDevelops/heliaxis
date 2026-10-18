import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { availableSlots } from '@/lib/crm/booking';
import { projectByToken } from '@/lib/crm/portal';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { createEvent, msConfigured } from '@/lib/ms365';
import { sendStageToMeta } from '@/lib/meta-capi';

export const dynamic = 'force-dynamic';

/** The customer books their survey from the portal. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['lead', 'contacted', 'survey_booked'].includes(p.stage)) return NextResponse.json({ error: 'Your survey is already done.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const at = String(b.at || '');
  const { slots } = await availableSlots();
  if (!slots.some((s) => s.at === at)) return NextResponse.json({ error: 'That time has just gone — please pick another.' }, { status: 409 });

  const db = createAdminClient();
  const { data: e } = await db.from('enquiries').select('name, phone').eq('id', p.enquiry_id).maybeSingle();
  await db
    .from('crm_projects')
    .update({ survey_at: at, stage: 'survey_booked', stage_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', p.id);
  await db.from('enquiries').update({ status: 'contacted' }).eq('id', p.enquiry_id).eq('status', 'new');
  const when = new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'stage', body: `Customer booked their survey online: ${when}` });

  after(async () => {
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const team = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
    const to = p.owner_id && team.includes(p.owner_id) ? [p.owner_id] : team;
    await Promise.all(
      to.map((userId) =>
        notify({ userId, kind: 'crm_booking', title: `📅 Survey booked: ${e?.name || p.title}`, body: when, href: `/admin/crm/${p.id}`, tag: `crm-${p.id}` })
      )
    );
    if (msConfigured()) {
      await createEvent({
        subject: `Survey — ${e?.name || p.title}${p.postcode ? ` (${p.postcode})` : ''}`,
        start: new Date(at),
        minutes: 90,
        location: p.postcode || undefined,
        body: `Booked online by the customer.${e?.phone ? ` Phone: ${e.phone}` : ''}`,
      }).catch(() => null);
    }
    await sendStageToMeta(p.id, 'survey_booked').catch(() => null);
  });
  return NextResponse.json({ ok: true, at });
}
