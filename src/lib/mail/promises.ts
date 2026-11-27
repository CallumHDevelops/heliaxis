import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { newPart, plainText } from '@/lib/email/call-request';
import { findPromise } from '@/lib/email/promise';
import type { GMessage } from './graph';

type Db = ReturnType<typeof createAdminClient>;
type Box = { id: string; user_id: string; address: string };

const addr = (a?: string) => (a ?? '').trim().toLowerCase();
const ukDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
/** Mail sent more than this long ago is history being read, not a promise still to keep. */
const FRESH_MS = 36 * 3600_000;

/**
 * You emailed a customer "I'll get you a quote this weekend": put it on their record as a task (due that day, so it comes up in
 * your reminders even at the weekend) and tell you now. The customer is the one already in the CRM with that email address,
 * else a new customer and opportunity is made, so the promise always has a record to sit on. Only recently sent mail is read,
 * once each (the task notes carry the message's id), and never anything sent to a colleague.
 * Never throws: reading your mail must not stop because of this.
 */
export async function notePromises(db: Db, box: Box, page: GMessage[], added: Set<string>, ruleEnquiry: (address: string) => string | null): Promise<number> {
  let made = 0;
  const me = addr(box.address);
  const domain = me.split('@')[1] ?? '';
  for (const m of page) {
    try {
      if (!added.has(m.id) || !m.internetMessageId || m.isDraft) continue;
      const sent = Date.parse(m.sentDateTime ?? '');
      if (!Number.isFinite(sent) || Date.now() - sent > FRESH_MS) continue;
      const to = (m.toRecipients ?? []).map((r) => ({ address: addr(r.emailAddress?.address), name: r.emailAddress?.name ?? '' })).filter((r) => r.address && r.address !== me);
      const customer = to.find((r) => !(domain && r.address.endsWith(`@${domain}`)) && !/(^|[.-])(no-?reply|donotreply|notifications?)@/.test(r.address));
      if (!customer) continue;
      const found = findPromise(newPart(plainText(m.bodyPreview ?? '')), ukDay(new Date(sent)));
      if (!found) continue;

      const marker = `promise:${m.internetMessageId}`;
      const { data: dup } = await db.from('tasks').select('id').ilike('notes', `%${marker}%`).limit(1);
      if (dup?.length) continue;

      // Their record: the one this address already belongs to, else a new customer and opportunity.
      let enquiryId = ruleEnquiry(customer.address);
      if (!enquiryId) {
        const { data: known } = await db.from('enquiries').select('id').ilike('email', customer.address).order('created_at', { ascending: false }).limit(1);
        enquiryId = (known?.[0]?.id as string | undefined) ?? null;
      }
      let name = customer.name || customer.address.split('@')[0];
      let projectId: string | null = null;
      let created = false;
      if (enquiryId) {
        const { data: e } = await db.from('enquiries').select('name').eq('id', enquiryId).maybeSingle();
        if (e?.name) name = e.name as string;
        const { data: jobs } = await db.from('crm_projects').select('id, stage').eq('enquiry_id', enquiryId).order('created_at', { ascending: false }).limit(20);
        projectId = ((jobs ?? []).find((j) => j.stage !== 'complete' && j.stage !== 'lost') ?? jobs?.[0])?.id ?? null;
      }
      if (!enquiryId) {
        const { data: c } = await db.from('enquiries').insert({ name, email: customer.address, source: 'email', status: 'contacted' }).select('id').single();
        if (!c) continue;
        enquiryId = c.id as string;
        created = true;
      }
      if (!projectId) {
        const { data: p } = await db.from('crm_projects').insert({ enquiry_id: enquiryId, title: name, owner_id: box.user_id, created_by: box.user_id, stage: 'lead' }).select('id').single();
        projectId = (p?.id as string | undefined) ?? null;
        created = created || !!projectId;
      }

      const verb = found.item === 'a call' ? `Call ${name}` : found.item === 'a reply' ? `Get back to ${name}` : `Send ${found.item} to ${name}`;
      const { data: me2 } = await db.from('profiles').select('full_name, email').eq('id', box.user_id).maybeSingle();
      const notes = [`You promised this by email (${m.subject ?? 'no subject'}): “${found.sentence}”`, `They were told: ${found.when}.`, `Added by Metis from your sent mail. ${marker}`].join('\n\n');
      const { data: task } = await db
        .from('tasks')
        .insert({ title: `${verb} (promised ${found.when})`, notes, assignee_id: box.user_id, assignee_name: (me2?.full_name as string) || (me2?.email as string) || '', due_date: found.due, priority: 'high', status: 'todo', created_by: box.user_id, ...(projectId ? { crm_project_id: projectId } : {}) })
        .select('id')
        .single();
      if (!task) continue;
      made++;
      if (projectId) await logActivity({ enquiryId, projectId, kind: 'system', body: `Promise noted from your email: ${found.item} ${found.when}${created ? ' (new customer made from this email)' : ''}`, byId: box.user_id });
      const dayName = new Date(`${found.due}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      await notify({
        userId: box.user_id,
        kind: 'promise',
        title: `You promised ${name} ${found.item} ${found.when}`,
        body: `Noted${created ? ' on a new customer record' : ''}: task for ${dayName}. You'll be reminded then, weekends included.`,
        href: projectId ? `/admin/crm/${projectId}` : `/admin/tasks?task=${task.id}`,
      });
    } catch {
      // Carry on with the next email.
    }
  }
  return made;
}
