import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { projectSigned, projectByToken } from '@/lib/crm/portal';
import { logActivity } from '@/lib/crm/server';
import { cleanPref } from '@/lib/install-dates';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The customer asks for up to three installation dates (and says if they are flexible), once they have
 * signed. It is a request: the office checks crews and scaffolding and confirms the real date. The team
 * is told, and it goes on the job's record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return reply({ error: 'Not found' }, 404);
  if (!(await projectSigned(p))) return reply({ error: 'Please accept your quote first, then you can choose your installation date.' }, 400);
  const b = await req.json().catch(() => ({}));
  const r = cleanPref(b, ukDay(new Date()), await ukBankHolidays());
  if (!r.ok) return reply({ error: r.error }, 400);
  const db = createAdminClient();
  const at = new Date().toISOString();
  const { error } = await db.from('crm_projects').update({ install_pref: { ...r.pref, at }, updated_at: at }).eq('id', p.id);
  if (error) return reply({ error: 'Couldn’t save your dates just now. Please try again, or message us.' }, 500);
  const words = r.pref.dates.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })).join(', ');
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body: `Customer asked for installation on: ${words}${r.pref.flexible ? ' (flexible)' : ''}${r.pref.notes ? `. Note: ${r.pref.notes}` : ''}` });
  after(async () => {
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const team = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
    await Promise.all(
      team.map((userId) =>
        notify({ userId, kind: 'crm_install_dates', title: `📅 Install dates requested: ${p.title}`, body: words, href: `/admin/crm/${p.id}`, tag: `crm-install-${p.id}` })
      )
    );
  });
  return reply({ ok: true });
}
