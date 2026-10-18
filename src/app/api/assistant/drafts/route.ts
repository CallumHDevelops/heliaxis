import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

/** Drafts waiting to be checked and sent (everyone's — anyone on the CRM can send them). */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const { data, error } = await db
    .from('assistant_drafts')
    .select('id, kind, project_id, enquiry_id, subject, body, created_by, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return json({ drafts: [], setupNeeded: true });
  const ids = [...new Set((data ?? []).map((d) => d.enquiry_id).filter(Boolean))];
  const people = [...new Set((data ?? []).map((d) => d.created_by).filter(Boolean))];
  const [{ data: cs }, { data: ps }] = await Promise.all([
    ids.length ? db.from('enquiries').select('id, name, email, phone').in('id', ids) : Promise.resolve({ data: [] }),
    people.length ? db.from('profiles').select('id, full_name, email').in('id', people) : Promise.resolve({ data: [] }),
  ]);
  const c = new Map((cs ?? []).map((x) => [x.id, x]));
  const p = new Map((ps ?? []).map((x) => [x.id, x.full_name || x.email]));
  return json({
    drafts: (data ?? []).map((d) => ({
      ...d,
      customer: c.get(d.enquiry_id)?.name ?? 'Customer',
      to: d.kind === 'email' ? c.get(d.enquiry_id)?.email : c.get(d.enquiry_id)?.phone,
      by: d.created_by ? p.get(d.created_by) ?? null : null,
    })),
  });
}
