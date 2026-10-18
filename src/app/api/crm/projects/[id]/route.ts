import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, crmSession, enquiryStatusFor, isUuid, json, logActivity, thumbPath } from '@/lib/crm/server';
import { isStage, PRODUCT_KEYS, stageLabel } from '@/lib/crm/stages';
import { canAccess } from '@/lib/portals';
import { toWaId, windowOpen } from '@/lib/whatsapp/shared';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { getSettings } from '@/lib/whatsapp/settings';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Everything for one project: customer, timeline (incl. WhatsApp), photos, team for the owner list. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: project } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (!project) return json({ error: 'Not found' }, 404);

  const { data: customer } = await db
    .from('enquiries')
    .select('id, name, email, phone, postcode, interest, property_type, source, status, created_at, wa_id, wa_unread')
    .eq('id', project.enquiry_id)
    .maybeSingle();

  // WhatsApp is matched on the phone number, so a chat that started on another enquiry (a WhatsApp
  // message, a second web form) still shows here. Backfill the number's WhatsApp id if missing.
  const waId = customer?.wa_id || toWaId(customer?.phone);
  if (customer && waId && !customer.wa_id) await db.from('enquiries').update({ wa_id: waId }).eq('id', customer.id);
  type Linked = { id: string; wa_last_inbound_at: string | null; wa_last_message_at: string | null; wa_unread: number };
  let linked: Linked[] = [];
  if (waId) {
    const { data } = await db
      .from('enquiries')
      .select('id, wa_last_inbound_at, wa_last_message_at, wa_unread')
      .eq('wa_id', waId)
      .limit(20);
    linked = (data ?? []) as Linked[];
  }
  if (customer && !linked.some((l) => l.id === customer.id)) {
    linked.push({ id: customer.id, wa_last_inbound_at: null, wa_last_message_at: null, wa_unread: 0 });
  }
  const linkedIds = linked.map((l) => l.id);
  // The enquiry the live chat is on: the one with the latest WhatsApp activity (replies go there).
  const thread = [...linked].sort((a, b) => (b.wa_last_message_at || '').localeCompare(a.wa_last_message_at || ''))[0];
  const lastInbound = linked.map((l) => l.wa_last_inbound_at).filter(Boolean).sort().pop() ?? null;

  const [{ data: acts }, { data: wa }, { data: photos }, { data: people }, { data: others }, { data: tasks }] = await Promise.all([
    db.from('crm_activities').select('id, project_id, kind, body, meta, by_id, at').eq('enquiry_id', project.enquiry_id).order('at', { ascending: false }).limit(300),
    // WhatsApp is optional (tables may not exist yet).
    linkedIds.length
      ? db.from('whatsapp_messages').select('id, direction, kind, body, status, created_at, sent_by, via, rule_id').in('enquiry_id', linkedIds).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { id: string; direction: string; kind: string; body: string | null; status: string; created_at: string; sent_by: string | null; via: string | null; rule_id: string | null }[] }),
    db.from('crm_photos').select('id, category, storage_path, caption, width, height, taken_at, created_at, uploaded_by').eq('project_id', id).order('created_at', { ascending: false }),
    db.from('profiles').select('*').eq('status', 'approved'),
    db.from('crm_projects').select('id, title, stage').eq('enquiry_id', project.enquiry_id).neq('id', id),
    db
      .from('tasks')
      .select('id, title, due_date, priority, status, assignee_id, assignee_name, completed_at')
      .eq('crm_project_id', id)
      .order('status')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100),
  ]);

  // Anyone who can see the work: CRM users, or people who only have Tasks (they see it on the Tasks page).
  const team = (people ?? [])
    .filter((p) => canAccess(p, 'crm') || canAccess(p, 'tasks'))
    .map((p) => ({ id: p.id as string, name: (p.full_name || p.email || 'Team') as string, crm: canAccess(p, 'crm') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team') as string]));

  // Signed links (1h) for each photo and its thumbnail.
  const paths = (photos ?? []).flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(CRM_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const timeline = [
    ...(acts ?? []).map((a) => ({
      id: a.id,
      kind: a.kind as string,
      body: a.body as string | null,
      meta: a.meta,
      by: a.by_id ? nameOf.get(a.by_id) ?? 'Team' : null,
      at: a.at as string,
      other_project: a.project_id && a.project_id !== id ? a.project_id : null,
    })),
    ...(wa ?? []).map((m) => ({
      id: `wa-${m.id}`,
      kind: 'whatsapp',
      body: m.body as string | null,
      meta: { direction: m.direction, status: m.status, kind: m.kind },
      by:
        m.direction === 'in'
          ? customer?.name ?? 'Customer'
          : m.sent_by
            ? nameOf.get(m.sent_by) ?? 'Team'
            : m.via === 'whatsapp-app'
              ? 'WhatsApp app'
              : m.via === 'chase'
                ? 'Chaser'
                : m.rule_id
                  ? 'Smart reply'
                  : 'Automatic',
      at: m.created_at as string,
      other_project: null,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return json({
    project,
    customer,
    whatsapp: {
      configured: whatsappConfigured(),
      number: waId,
      threadId: thread?.id ?? customer?.id ?? null,
      windowOpen: windowOpen(lastInbound),
      lastInbound,
      unread: linked.reduce((n, l) => n + (l.wa_unread || 0), 0),
      unreadIds: linked.filter((l) => l.wa_unread > 0).map((l) => l.id),
      messages: (wa ?? []).length,
      chaseHours: await getSettings().then((st) => (st.chaseQuestions ? st.chaseAfterHours : 0)).catch(() => 0),
    },
    timeline,
    photos: (photos ?? []).map((p) => ({
      ...p,
      url: signed.get(p.storage_path) ?? null,
      thumb: signed.get(thumbPath(p.storage_path)) ?? signed.get(p.storage_path) ?? null,
      by: p.uploaded_by ? nameOf.get(p.uploaded_by) ?? '' : '',
    })),
    team,
    tasks: (tasks ?? []).map((t) => ({ ...t, assignee: t.assignee_id ? nameOf.get(t.assignee_id) ?? '' : t.assignee_name || '' })),
    others: others ?? [],
  });
}

const TEXT = ['title', 'address', 'postcode', 'simpliheat_url', 'opensolar_url', 'lost_reason', 'notes'] as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: before } = await db.from('crm_projects').select('id, enquiry_id, stage').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);

  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of TEXT) {
    if (k in b) {
      const v = String(b[k] ?? '').trim();
      if (k === 'title' && !v) return json({ error: 'The project needs a name.' }, 400);
      if ((k === 'simpliheat_url' || k === 'opensolar_url') && v && !/^https?:\/\//i.test(v)) {
        return json({ error: 'Links must start with https://' }, 400);
      }
      u[k] = v ? (k === 'postcode' ? v.toUpperCase() : v.slice(0, k === 'notes' ? 5000 : 500)) : k === 'title' ? v : null;
    }
  }
  if ('products' in b) u.products = (Array.isArray(b.products) ? b.products : []).filter((k: unknown) => PRODUCT_KEYS.includes(String(k)));
  if ('value' in b) u.value = b.value === null || b.value === '' ? null : Number.isFinite(Number(b.value)) ? Number(b.value) : null;
  if ('owner_id' in b) u.owner_id = b.owner_id && isUuid(String(b.owner_id)) ? b.owner_id : null;
  // Next step: set / change (re-arms its reminder), or mark done (logged on the timeline).
  let doneStep: string | null = null;
  if (b.complete_next_step) {
    const { data: cur } = await db.from('crm_projects').select('next_step').eq('id', id).maybeSingle();
    doneStep = cur?.next_step || null;
    u.next_step = null;
    u.next_step_at = null;
    u.next_step_notified_at = null;
  } else {
    if ('next_step' in b) u.next_step = String(b.next_step || '').trim().slice(0, 300) || null;
    if ('next_step_at' in b) {
      u.next_step_at = b.next_step_at && !Number.isNaN(Date.parse(b.next_step_at)) ? new Date(b.next_step_at).toISOString() : null;
      u.next_step_notified_at = null;
    }
  }
  for (const k of ['survey_at', 'install_at'] as const) {
    if (k in b) u[k] = b[k] && !Number.isNaN(Date.parse(b[k])) ? new Date(b[k]).toISOString() : null;
  }
  let stageMove: { from: string; to: string } | null = null;
  if ('stage' in b) {
    if (!isStage(b.stage)) return json({ error: 'Unknown stage' }, 400);
    if (b.stage !== before.stage) {
      u.stage = b.stage;
      u.stage_changed_at = u.updated_at;
      stageMove = { from: before.stage, to: b.stage };
    }
  }

  const { data, error } = await db.from('crm_projects').update(u).eq('id', id).select('*').single();
  if (error) return json({ error: error.message }, 500);
  if (doneStep) {
    await logActivity({ enquiryId: before.enquiry_id, projectId: id, kind: 'system', body: `✓ Done: ${doneStep}`, byId: s.user.id });
  }
  if (stageMove && isStage(stageMove.to)) {
    await Promise.all([
      logActivity({
        enquiryId: before.enquiry_id,
        projectId: id,
        kind: 'stage',
        body: `${stageLabel(stageMove.from)} → ${stageLabel(stageMove.to)}`,
        meta: stageMove,
        byId: s.user.id,
      }),
      db.from('enquiries').update({ status: enquiryStatusFor(stageMove.to) }).eq('id', before.enquiry_id),
    ]);
  }
  return json({ project: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can delete projects.' }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: photos } = await db.from('crm_photos').select('storage_path').eq('project_id', id);
  const paths = (photos ?? []).flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]);
  if (paths.length) await db.storage.from(CRM_BUCKET).remove(paths);
  await db.from('crm_projects').delete().eq('id', id);
  return json({ ok: true });
}
