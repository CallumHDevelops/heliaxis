import 'server-only';
import { notify } from '@/lib/notify';
import type { createAdminClient } from '@/lib/supabase/admin';
import { describeMessage, type InboundMessage } from '@/lib/whatsapp/describe';
import { stopWord } from '@/lib/whatsapp/permission';

/**
 * SPEC D20: a trade answering a site message on WhatsApp (their job pack, PO, strike reminder,
 * return to site) isn't a new lead. The site messages go out from the business number, so the
 * trade's reply comes in through the Meta webhook like a customer's; without this it became a
 * customer, a Lead-stage opportunity, a "New WhatsApp lead" push and maybe a smart reply.
 *
 * A number on a live site contact (site_contacts.wa_id), with no enquiry on it, is a trade's: the
 * message goes on their job's Site history (site_events 'trade_reply') and to the job's owner.
 * Their open jobs, else their latest one (a reply after the job, or to a return to site); none at
 * all and the inbox team hears. STOP turns job messages on WhatsApp off for them (they go by email).
 * A number that is also a customer's stays in that customer's chat, as before.
 */

type Db = ReturnType<typeof createAdminClient>;
type Contact = { id: string; name: string; subcontractor_id: string | null };
type Job = { id: string; project_id: string; contact_id: string; status: string; trade: string };
export type NotifyTeam = (title: string, body: string, href: string, extra?: { tag?: string }) => Promise<void>;

const TRADE_WORD: Record<string, string> = { roofer: 'roofer', scaffolder: 'scaffolder', electrician: 'electrician' };

/** The trade on this WhatsApp number and the jobs a message to or from them belongs to, or null. */
async function tradeOn(db: Db, waId: string): Promise<{ people: Contact[]; jobs: Job[] } | null> {
  const { data: people, error } = await db.from('site_contacts').select('id, name, subcontractor_id').eq('wa_id', waId).is('archived_at', null);
  // Not a trade, or site-commissioning.sql not run yet: the inbox as before.
  if (error || !people?.length) return null;
  const { data: enq } = await db.from('enquiries').select('id').eq('wa_id', waId).limit(1);
  if (enq?.length) return null;
  const { data: rows } = await db
    .from('site_assignments')
    .select('id, project_id, contact_id, status, trade')
    .in('contact_id', (people as Contact[]).map((p) => p.id))
    .neq('status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(50);
  const all = (rows ?? []) as Job[];
  const open = all.filter((a) => a.status !== 'done' && a.status !== 'draft');
  return { people: people as Contact[], jobs: open.length ? open : all.slice(0, 1) };
}

async function logEach(db: Db, jobs: Job[], actor: string, type: string, detail: Record<string, unknown>) {
  const rows = (jobs.length ? jobs.map((a) => a.id) : [null]).map((id) => ({ assignment_id: id, actor, type, detail }));
  try {
    await db.from('site_events').insert(rows);
  } catch {
    // The history is a record, never a blocker.
  }
}

/** A message from a trade: true when it was one (dealt with here, nothing for the leads). */
export async function tradeReply(db: Db, m: InboundMessage, notifyTeam: NotifyTeam): Promise<boolean> {
  const t = await tradeOn(db, m.from);
  if (!t) return false;
  const { data: seen } = await db.from('site_events').select('id').eq('type', 'trade_reply').contains('detail', { wa_message_id: m.id }).limit(1);
  if (seen?.length) return true; // Meta sent it again
  const { kind, body } = describeMessage(m);
  const word = kind === 'text' && m.type !== 'reaction' ? stopWord(body) : null;
  if (word === 'stop') {
    await db
      .from('site_contacts')
      .update({ whatsapp_ok: false, whatsapp_ok_at: new Date().toISOString(), whatsapp_ok_by: null })
      .in('id', t.people.map((p) => p.id))
      .then(
        () => null,
        () => null
      );
  }
  await logEach(db, t.jobs, 'trade', 'trade_reply', { wa_message_id: m.id, from: m.from, body: body.slice(0, 1000), ...(word ? { word } : {}) });

  const lines = [body.slice(0, 140)];
  if (word === 'stop') lines.push('They replied STOP: job messages to them now go by email only.');
  else if (word === 'start') lines.push('They replied START: tick WhatsApp on their contact if they should get job messages there again.');
  const nameOf = (contactId?: string) => t.people.find((p) => p.id === contactId)?.name || t.people[0].name || `+${m.from}`;
  const told = new Set<string>();
  let anyone = false;
  for (const a of t.jobs) {
    const { data: p } = await db.from('crm_projects').select('owner_id').eq('id', a.project_id).maybeSingle();
    const owner = (p?.owner_id as string | null | undefined) ?? null;
    if (!owner || told.has(`${owner}:${a.project_id}`)) continue;
    told.add(`${owner}:${a.project_id}`);
    anyone = true;
    await notify({
      userId: owner,
      kind: 'whatsapp',
      title: `WhatsApp from ${nameOf(a.contact_id)} (${TRADE_WORD[a.trade] ?? 'trade'})`,
      body: lines.join('\n'),
      href: `/admin/projects/${a.project_id}?tab=site`,
      tag: `site-reply-${a.id}`,
    }).catch(() => {});
  }
  if (!anyone) {
    const who = t.people[0];
    await notifyTeam(`WhatsApp from ${nameOf(who.id)} (trade)`, lines.join('\n'), who.subcontractor_id ? `/admin/subcontractors/${who.subcontractor_id}` : '/admin/subcontractors', { tag: `site-reply-${who.id}` }).catch(() => {});
  }
  return true;
}

/** A message typed to a trade in the WhatsApp Business app (coexistence): on their job's history, not a new customer. */
export async function tradeEcho(db: Db, m: InboundMessage & { to: string }): Promise<boolean> {
  const t = await tradeOn(db, m.to);
  if (!t) return false;
  const { data: seen } = await db.from('site_events').select('id').eq('type', 'office_whatsapp').contains('detail', { wa_message_id: m.id }).limit(1);
  if (seen?.length) return true;
  const { body } = describeMessage(m);
  await logEach(db, t.jobs, 'office', 'office_whatsapp', { wa_message_id: m.id, to: m.to, body: body.slice(0, 1000) });
  return true;
}
