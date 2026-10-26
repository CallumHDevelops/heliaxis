import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { SALES_STAGES } from '@/lib/crm/stages';
import { starterContent } from '@/lib/quotes/types';

export const dynamic = 'force-dynamic';

/** Quotes, newest first, with the customer's name and the total, for Sales › Quotes. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('crm_quotes').select('id, number, title, status, enquiry_id, project_id, updated_at, sent_at, content').order('updated_at', { ascending: false }).limit(200);
  if (error) return json({ error: error.message, quotes: [] }, 500);
  return json({ quotes: data ?? [] });
}

/**
 * New quote for a customer { enquiry_id, project_id? }: on the opportunity given, else their latest one
 * that is still in sales, else a new opportunity for them. Starts from a template to fill in.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const enquiryId = String(b.enquiry_id || '');
  if (!isUuid(enquiryId)) return json({ error: 'Pick a customer.' }, 400);
  const db = createAdminClient();
  const { data: c } = await db.from('enquiries').select('id, name, postcode, interest').eq('id', enquiryId).maybeSingle();
  if (!c) return json({ error: 'Customer not found' }, 404);

  let projectId = String(b.project_id || '');
  if (projectId) {
    const { data: p } = await db.from('crm_projects').select('id').eq('id', projectId).eq('enquiry_id', enquiryId).maybeSingle();
    if (!p) return json({ error: 'That opportunity isn’t this customer’s.' }, 400);
  } else {
    const { data: theirs } = await db.from('crm_projects').select('id, stage').eq('enquiry_id', enquiryId).order('created_at', { ascending: false }).limit(20);
    const open = (theirs ?? []).find((p) => (SALES_STAGES as string[]).includes(p.stage as string));
    if (open) projectId = open.id as string;
    else {
      const { data: made, error } = await db
        .from('crm_projects')
        .insert({ enquiry_id: enquiryId, title: `${c.name}${c.postcode ? ` · ${c.postcode}` : ''}`, stage: 'surveyed', postcode: c.postcode, products: [] })
        .select('id')
        .single();
      if (error || !made) return json({ error: error?.message || 'Couldn’t start an opportunity.' }, 500);
      projectId = made.id as string;
    }
  }
  const first = String(c.name || '').trim().split(/\s+/)[0] || '';
  const { data: q, error } = await db
    .from('crm_quotes')
    .insert({ project_id: projectId, enquiry_id: enquiryId, content: starterContent(first), created_by: s.user.id, valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) })
    .select('id, number')
    .single();
  if (error || !q) return json({ error: error?.message || 'Couldn’t start the quote.' }, 500);
  await logActivity({ enquiryId, projectId, kind: 'system', body: `Quote ${q.number} started`, byId: s.user.id });
  return json({ id: q.id });
}
