import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { ROUTES } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';

/** The EIC certificates made in the office, newest edit first, each with who and what job it is for. ?enquiry= or ?project= narrows it. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = new URL(req.url).searchParams;
  const db = createAdminClient();
  let query = db.from('eic_manual').select('id, number, route, title, enquiry_id, project_id, address, status, issued_on, updated_at').order('updated_at', { ascending: false }).limit(300);
  if (isUuid(q.get('enquiry') ?? '')) query = query.eq('enquiry_id', q.get('enquiry')!);
  if (isUuid(q.get('project') ?? '')) query = query.eq('project_id', q.get('project')!);
  const { data, error } = await query;
  if (error) return json({ error: error.message, missing: /eic_manual/.test(error.message) }, 500);
  const rows = (data ?? []) as { id: string; enquiry_id: string | null; project_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.enquiry_id).filter(Boolean))] as string[];
  const pids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
  const [{ data: cs }, { data: ps }] = await Promise.all([
    ids.length ? db.from('enquiries').select('id, name').in('id', ids) : Promise.resolve({ data: [] }),
    pids.length ? db.from('crm_projects').select('id, project_ref, title').in('id', pids) : Promise.resolve({ data: [] }),
  ]);
  const cname = new Map(((cs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pname = new Map(((ps ?? []) as { id: string; project_ref: string | null; title: string | null }[]).map((p) => [p.id, [p.project_ref, p.title].filter(Boolean).join(' · ')]));
  return json({ certificates: rows.map((r) => ({ ...r, customer: r.enquiry_id ? (cname.get(r.enquiry_id) ?? null) : null, job: r.project_id ? (pname.get(r.project_id) ?? null) : null })) });
}

/** A new, empty certificate: { route?, enquiry_id?, project_id?, title?, address? } → { id }. A job brings its customer. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const pick = (v: unknown) => (isUuid(String(v ?? '')) ? String(v) : null);
  const db = createAdminClient();
  let enquiry = pick(b.enquiry_id);
  const project = pick(b.project_id);
  if (project && !enquiry) {
    const { data } = await db.from('crm_projects').select('enquiry_id').eq('id', project).maybeSingle();
    enquiry = (data as { enquiry_id?: string } | null)?.enquiry_id ?? null;
  }
  const route = (ROUTES as readonly string[]).includes(String(b.route)) ? String(b.route) : 'eic_single';
  const { data, error } = await db
    .from('eic_manual')
    .insert({ route, enquiry_id: enquiry, project_id: project, title: String(b.title || '').trim().slice(0, 200), address: String(b.address || '').trim().slice(0, 300), created_by: s.user.id })
    .select('id')
    .single();
  if (error || !data) return json({ error: error?.message || 'Couldn’t start the certificate.' }, 500);
  return json({ id: data.id });
}
