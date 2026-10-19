import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { msConfigured } from '@/lib/ms365';
import { toWaId } from '@/lib/whatsapp/shared';
import { stageLabel } from '@/lib/crm/stages';
import {
  getPermissionSettings,
  grantPermission,
  isFormSource,
  isStopped,
  markNotAsked,
  savePermissionSettings,
  undoStaffRecord,
  type PermissionRow,
} from '@/lib/whatsapp/permission';

export const dynamic = 'force-dynamic';

/**
 * The WhatsApp permission review list (/admin/crm/whatsapp-permission).
 * GET: customers with an open job (not Complete or Lost), a mobile number, and no WhatsApp permission
 *      recorded for that number on any of their enquiries, newest job first (`count` of them); plus
 *      the rule, and `affected`: how many open-job customers the rule would stop, including those
 *      marked Not asked.
 * POST { action: 'agreed' | 'not_asked' | 'undo', enquiryId } records staff:<name> (agreed) or
 *      not-asked:<name>; { action: 'rule', requireOptIn } (admins) switches "Only send automatic
 *      WhatsApps to customers who've agreed" on or off.
 */

type Job = { id: string; enquiry_id: string; title: string | null; stage: string; created_at: string };
type Row = PermissionRow & { name: string | null; postcode: string | null; created_at: string };

const chunks = <T,>(list: T[], n = 100) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function waitingList() {
  const db = createAdminClient();
  const { data: jobs } = await db
    .from('crm_projects')
    .select('id, enquiry_id, title, stage, created_at')
    .not('stage', 'in', '(complete,lost)')
    .order('created_at', { ascending: false })
    .limit(3000);
  const latestJob = new Map<string, Job>();
  for (const j of (jobs ?? []) as Job[]) if (!latestJob.has(j.enquiry_id)) latestJob.set(j.enquiry_id, j);

  // select('*'): the when/how columns come with crm-v3.sql.
  const customers: Row[] = [];
  for (const ids of chunks([...latestJob.keys()])) {
    const { data } = await db.from('enquiries').select('*').in('id', ids);
    customers.push(...((data ?? []) as Row[]));
  }
  const numberOf = (r: Row) => r.wa_id || toWaId(r.phone);
  // Not agreed on this enquiry and not stopped: the rule would stop these, unless another enquiry covers them.
  const open = customers.filter((r) => numberOf(r) && r.whatsapp_opt_in !== true && !isStopped(r));

  // Every enquiry with the same number counts, as in waPermission: a STOP (or staff switch-off) or an
  // agreement a stranger couldn't have typed in (not a website or booking form) covers the person;
  // anything else staff noted (Not asked) takes them off the list, but the rule would still stop them.
  const covered = new Set<string>();
  const noted = new Set<string>();
  const note = (n: string, r: Row) => {
    if (isStopped(r) || (r.whatsapp_opt_in === true && !isFormSource(r.whatsapp_opt_in_source))) covered.add(n);
    else if (r.whatsapp_opt_in !== true && r.whatsapp_opt_in_source) noted.add(n);
  };
  for (const r of customers) if (numberOf(r)) note(numberOf(r)!, r);
  for (const numbers of chunks([...new Set(open.map((r) => numberOf(r)!))])) {
    const { data } = await db.from('enquiries').select('*').in('wa_id', numbers);
    for (const r of (data ?? []) as Row[]) if (r.wa_id) note(r.wa_id, r);
  }
  const affected = new Set(open.map((r) => numberOf(r)!).filter((n) => !covered.has(n))).size;

  const seen = new Set<string>();
  const list = open
    .filter((r) => !r.whatsapp_opt_in_source && !covered.has(numberOf(r)!) && !noted.has(numberOf(r)!))
    .map((r) => ({ r, job: latestJob.get(r.id)! }))
    .sort((a, b) => (a.job.created_at < b.job.created_at ? 1 : -1))
    .filter(({ r }) => {
      const n = numberOf(r)!;
      if (seen.has(n)) return false; // one line per person
      seen.add(n);
      return true;
    });
  const rows = list.map(({ r, job }) => ({
    id: r.id,
    name: r.name || 'Unnamed',
    phone: r.phone || (r.wa_id ? `+${r.wa_id}` : ''),
    postcode: r.postcode,
    email: !!r.email,
    job: { id: job.id, title: job.title, stage: stageLabel(job.stage), created_at: job.created_at },
  }));
  return { list: rows, affected };
}

export async function GET() {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const [schema, settings] = await Promise.all([schemaReady(), getPermissionSettings()]);
  if (!schema.crmV3) {
    return json({ ready: false, settings, customers: [], count: 0, affected: 0, email: msConfigured(), isAdmin: s.profile.role === 'admin' });
  }
  const { list, affected } = await waitingList();
  return json({
    ready: true,
    settings,
    customers: list.slice(0, 300),
    count: list.length,
    affected,
    email: msConfigured(),
    isAdmin: s.profile.role === 'admin',
  });
}

export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => ({}))) as { action?: string; enquiryId?: string; requireOptIn?: unknown };
  const who = s.profile.full_name?.trim() || s.profile.email?.split('@')[0] || 'staff';
  if (!(await schemaReady()).crmV3) return json({ error: 'Run crm-v3.sql in Supabase first (it’s on the to-do list).' }, 409);

  if (b.action === 'rule') {
    if (s.profile.role !== 'admin') return json({ error: 'Only admins can change this.' }, 403);
    if (typeof b.requireOptIn !== 'boolean') return json({ error: 'requireOptIn must be true or false' }, 400);
    try {
      return json({ ok: true, settings: await savePermissionSettings(b.requireOptIn, who) });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
    }
  }

  const id = String(b.enquiryId || '');
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  if (b.action === 'agreed') {
    // Only this enquiry, so Undo is exact (a staff "agreed" covers their other enquiries too).
    if (!(await grantPermission(id, `staff:${who}`))) return json({ error: 'Already recorded. Refresh the list.' }, 409);
    await logActivity({ enquiryId: id, kind: 'system', body: `WhatsApp permission turned on by ${who}`, byId: s.user.id });
    return json({ ok: true });
  }
  if (b.action === 'not_asked') {
    if (!(await markNotAsked(id, who))) return json({ error: 'Already recorded. Refresh the list.' }, 409);
    await logActivity({ enquiryId: id, kind: 'system', body: `WhatsApp permission: not asked yet (noted by ${who})`, byId: s.user.id });
    return json({ ok: true });
  }
  if (b.action === 'undo') {
    if (!(await undoStaffRecord(id))) return json({ error: 'Nothing to undo.' }, 409);
    await logActivity({ enquiryId: id, kind: 'system', body: `WhatsApp permission record undone by ${who}`, byId: s.user.id });
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
}
