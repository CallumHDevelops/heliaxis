import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { crmTeam, withFallback } from '@/lib/projects/server';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';

type PgError = { code?: string; message?: string } | null;
type Job = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  owner_id: string | null;
  next_step: string | null;
  next_step_at: string | null;
  created_at: string;
  project_ref?: string | null;
};
const CLOSED = new Set(['complete', 'lost']);

/**
 * Which job a WhatsApp chat's call-back reminder, task or note goes on (GET ?enquiry={the chat's
 * enquiry}): the customer's latest open job on any of their enquiries with that WhatsApp number (the
 * dock's rule), or else their latest job of any kind (`last`), and the team for the task's "Who" and
 * whoever looks after the job (who the cron tells when a next step falls due). Read-only: with no open
 * job the chat opens one with POST /api/crm/projects as it saves, so nothing is made just by looking.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('enquiry') ?? '';
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: e } = await db.from('enquiries').select('id, phone, wa_id').eq('id', id).maybeSingle();
  if (!e) return json({ error: 'Not found' }, 404);

  const waId = e.wa_id || toWaId(e.phone);
  const { data: same } = waId ? await db.from('enquiries').select('id').eq('wa_id', waId).limit(20) : { data: [] as { id: string }[] };
  const ids = [...new Set([id, ...(same ?? []).map((x) => x.id as string)])];
  const [{ data: jobs }, team] = await Promise.all([
    withFallback<Job>(
      (cols) =>
        db.from('crm_projects').select(cols).in('enquiry_id', ids).order('created_at', { ascending: false }).limit(50) as unknown as PromiseLike<{
          data: Job[] | null;
          error: PgError;
        }>,
      'id, enquiry_id, title, stage, owner_id, next_step, next_step_at, created_at',
      'project_ref'
    ),
    crmTeam(),
  ]);
  const list = jobs ?? [];
  const open = list.find((p) => !CLOSED.has(p.stage)) ?? null;
  // The cron only tells the owner if they can open the CRM; otherwise everyone on it.
  const crmPeople = new Map(team.filter((t) => t.crm).map((t) => [t.id, t.name]));
  const shape = (p: Job | null) =>
    p && {
      id: p.id,
      enquiryId: p.enquiry_id,
      ref: p.project_ref ?? null,
      title: p.title,
      stage: p.stage,
      owner: p.owner_id && crmPeople.has(p.owner_id) ? { id: p.owner_id, name: crmPeople.get(p.owner_id)! } : null,
      nextStep: p.next_step,
      nextStepAt: p.next_step_at,
    };
  return json({ job: shape(open), last: open ? null : shape(list[0] ?? null), team, me: s.user.id });
}
