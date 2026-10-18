import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { PRODUCT_KEYS } from '@/lib/crm/stages';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';

/** Pipeline list, plus new enquiries that don't have a project yet. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const [{ data: projects, error }, { data: recent }] = await Promise.all([
    db
      .from('crm_projects')
      .select('id, enquiry_id, title, stage, products, value, owner_id, postcode, survey_at, install_at, next_step, next_step_at, updated_at, stage_changed_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(1000),
    db
      .from('enquiries')
      .select('id, name, phone, email, postcode, interest, source, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (error) return json({ error: error.message, projects: [], unassigned: [] }, 500);

  const enquiryIds = [...new Set((projects ?? []).map((p) => p.enquiry_id))];
  const ownerIds = [...new Set((projects ?? []).map((p) => p.owner_id).filter(Boolean))] as string[];
  const [{ data: customers }, { data: owners }] = await Promise.all([
    enquiryIds.length
      ? db.from('enquiries').select('id, name, phone, wa_unread').in('id', enquiryIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null; wa_unread: number }[] }),
    ownerIds.length
      ? db.from('profiles').select('id, full_name, email').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);
  // The soonest open task on each opportunity (shown when it has no next step).
  const projectIds = (projects ?? []).map((p) => p.id);
  const nextTask = new Map<string, { title: string; due_date: string | null }>();
  if (projectIds.length) {
    const { data: open } = await db
      .from('tasks')
      .select('crm_project_id, title, due_date')
      .in('crm_project_id', projectIds)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false });
    for (const t of open ?? []) if (t.crm_project_id && !nextTask.has(t.crm_project_id)) nextTask.set(t.crm_project_id, t);
  }
  const cust = new Map((customers ?? []).map((c) => [c.id, c]));
  const own = new Map((owners ?? []).map((o) => [o.id, o.full_name || o.email || '']));
  const withProject = new Set(enquiryIds);

  return json({
    projects: (projects ?? []).map((p) => ({
      ...p,
      customer: cust.get(p.enquiry_id)?.name ?? '',
      phone: cust.get(p.enquiry_id)?.phone ?? null,
      wa_unread: cust.get(p.enquiry_id)?.wa_unread ?? 0,
      owner: p.owner_id ? own.get(p.owner_id) ?? '' : '',
      next_task: nextTask.get(p.id) ?? null,
    })),
    // Leads not yet turned into a project (excluding lost ones).
    unassigned: (recent ?? []).filter((e) => !withProject.has(e.id) && e.status !== 'lost').slice(0, 30),
  });
}

/** New project: for an existing enquiry, or a new customer entered here (e.g. a phone call). */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();

  let enquiryId = String(b.enquiry_id || '');
  let customer: { name: string; postcode: string | null; interest: string | null } | null = null;
  if (enquiryId) {
    if (!isUuid(enquiryId)) return json({ error: 'Unknown customer' }, 400);
    const { data } = await db.from('enquiries').select('name, postcode, interest').eq('id', enquiryId).maybeSingle();
    if (!data) return json({ error: 'Customer not found' }, 404);
    customer = data;
    // From an enquiry's "Open in CRM": reuse their latest project rather than making a duplicate.
    if (b.open_existing) {
      const { data: existing } = await db
        .from('crm_projects')
        .select('id')
        .eq('enquiry_id', enquiryId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (existing?.[0]) return json({ id: existing[0].id, existing: true });
    }
  } else {
    const name = String(b.name || '').trim();
    if (!name) return json({ error: 'Add the customer’s name.' }, 400);
    const phone = String(b.phone || '').trim() || null;
    const { data, error } = await db
      .from('enquiries')
      .insert({
        name,
        email: String(b.email || '').trim(),
        phone,
        postcode: String(b.postcode || '').trim().toUpperCase() || null,
        wa_id: toWaId(phone),
        source: String(b.source || 'crm').trim() || 'crm',
        status: 'contacted',
      })
      .select('id, name, postcode, interest')
      .single();
    if (error || !data) return json({ error: error?.message || 'Could not add the customer' }, 500);
    enquiryId = data.id;
    customer = data;
  }

  const products = (Array.isArray(b.products) ? b.products : []).filter((k: unknown) => PRODUCT_KEYS.includes(String(k)));
  const title = String(b.title || '').trim() || `${customer!.name}${customer!.postcode ? ` · ${customer!.postcode}` : ''}`;
  const { data: project, error } = await db
    .from('crm_projects')
    .insert({
      enquiry_id: enquiryId,
      title: title.slice(0, 140),
      products,
      value: b.value != null && b.value !== '' && Number.isFinite(Number(b.value)) ? Number(b.value) : null,
      postcode: customer!.postcode,
      owner_id: s.user.id,
      created_by: s.user.id,
      stage: 'lead',
    })
    .select('id')
    .single();
  if (error || !project) return json({ error: error?.message || 'Could not create the opportunity' }, 500);
  await logActivity({ enquiryId, projectId: project.id, kind: 'system', body: 'Opportunity created', byId: s.user.id });
  return json({ id: project.id });
}
