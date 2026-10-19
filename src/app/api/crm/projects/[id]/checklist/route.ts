import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { checklistItem, checklistView, stageProgress, type ChecklistMark } from '@/lib/projects/checklist';
import { checkCtxFor, jobLookups, projectRow } from '@/lib/projects/server';
import { ukDay } from '@/lib/bank-holidays';

export const dynamic = 'force-dynamic';

/**
 * Tick, untick or mark "Not needed" one checklist item: { item, done?: boolean, na?: boolean }.
 * One item at a time in the database (crm_checklist_set), so two people ticking different items at
 * once both stick. Needs crm-v3.sql.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const item = checklistItem(String(b.item || ''));
  if (!item) return json({ error: 'Unknown checklist item' }, 400);
  if (typeof b.done !== 'boolean' && typeof b.na !== 'boolean') return json({ error: 'Say done or na (true or false).' }, 400);

  const db = createAdminClient();
  const { data: before } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);

  const by = s.profile.full_name || s.profile.email || 'Someone';
  const now = new Date().toISOString();
  const on = b.na === true || b.done === true;
  const value: ChecklistMark | null = on ? { done_at: now, by_id: s.user.id, by, ...(b.na === true ? { na: true } : {}) } : null;
  const r = await db.rpc('crm_checklist_set', { p_project: id, p_key: item.key, p_value: value }).then(
    (x) => x,
    () => ({ error: { message: 'missing' } })
  );
  if (r.error) return json({ error: 'Run crm-v3.sql first (it’s on your to-do list), then try again.' }, 400);

  await logActivity({
    enquiryId: before.enquiry_id,
    projectId: id,
    kind: 'system',
    body: b.na === true ? `Not needed: ${item.label}` : on ? `✓ ${item.label}` : `Unticked: ${item.label}`,
    meta: { checklist: item.key },
    byId: s.user.id,
  });

  // The whole list again, so the page shows what's true now (including other people's ticks).
  const { data: raw } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (!raw) return json({ error: 'Not found' }, 404);
  const p = projectRow(raw);
  const ctx = checkCtxFor(p, await jobLookups(db, [p]), ukDay(Date.now()));
  return json({ checklist: checklistView(ctx), progress: stageProgress(ctx, p.stage) });
}
