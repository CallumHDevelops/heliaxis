import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { TRADE_LABEL } from '@/lib/site/types';
import { createAssignments, logJob, notReady, siteReady, siteTabData, type NewAssignment } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The Site tab: the job strip, every trade on the job with its person, rate, VAT, CIS, status, photos, flags, PO and messages. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const data = await siteTabData(createAdminClient(), id);
  return data ? json(data) : json({ error: 'Not found' }, 404);
}

/** Put trades on the job: { assignments: [{ contact_id | firm_id | new_contact, trade, rate_pence, rate_basis, … }] }. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const list = (Array.isArray(b.assignments) ? b.assignments : []) as NewAssignment[];
  if (!list.length) return json({ error: 'Add a trade first.' }, 400);
  const db = createAdminClient();
  const r = await createAssignments(db, id, list, s.user.id);
  if (!r.ok) return json({ error: r.error }, r.status);
  const data = await siteTabData(db, id);
  const added = (data?.assignments ?? []).filter((a) => r.ids.includes(a.id));
  if (added.length) {
    await logJob(
      db,
      id,
      `${added.length === 1 ? 'Trade' : 'Trades'} added: ${added.map((a) => `${a.contact.name} (${a.trade === 'other' ? a.title : TRADE_LABEL[a.trade].toLowerCase()})`).join(', ')}`,
      { assignments: r.ids },
      s.user.id
    );
  }
  return json({ ...data, created: r.ids });
}
