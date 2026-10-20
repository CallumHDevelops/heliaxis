import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearLeadNotifications } from '@/lib/notify';
import { chunks } from './delete-customer';
import { catchUpPick, contactNote, contactPlan, GRACE_MS, type CatchUpCustomer, type CatchUpJob, type RuleJob } from './contacted-rule';
import { logActivity, markContacted } from './server';

/**
 * The contacted rule for chats imported from the WhatsApp Business app (the rules are in
 * contacted-rule.ts): straight after an import, and as a one-tap catch-up for chats imported before
 * the rule was there (the banner on the CRM home and the import page, /api/crm/contacted-catch-up).
 * Nothing here messages anyone or sends anything to Meta (Contacted isn't a Meta event).
 */

/** Messages from us written by a person: imported, typed in the WhatsApp Business app, or sent by someone on the team. */
const BY_PERSON = 'via.eq.import,via.eq.whatsapp-app,sent_by.not.is.null';
const PAGE = 1000;
/** The most it looks through: far more people than are ever at Lead at once. */
const MAX_ROWS = 5000;
/** Customers moved per request, so each one finishes well inside Vercel's time limit. */
export const CATCH_UP_BATCH = 15;

/** Each step a few at a time, so a big catch-up doesn't swamp the database. */
async function inTurns<T, R>(items: T[], n: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const part of chunks(items, n)) out.push(...(await Promise.all(part.map(run))));
  return out;
}

/** A customer without a job, at New: Contacted, with a line on their timeline. */
async function looseContacted(enquiryId: string, at: string, byId: string | null): Promise<boolean> {
  const { data } = await createAdminClient().from('enquiries').update({ status: 'contacted' }).eq('id', enquiryId).eq('status', 'new').select('id');
  if (!data?.length) return false;
  await Promise.all([
    logActivity({ enquiryId, kind: 'system', body: `Moved to Contacted: ${contactNote(at)}`, byId }).catch(() => null),
    clearLeadNotifications(enquiryId, []).catch(() => null),
  ]);
  return true;
}

/**
 * Straight after an import: `ours` is when each of our messages in it was sent. Returns whether the
 * customer (any of their jobs, or the customer without one) moved to Contacted.
 */
export async function contactedFromChat(enquiryId: string, ours: string[], byId: string | null): Promise<boolean> {
  if (!ours.length) return false;
  const db = createAdminClient();
  const [jobs, { data: e }] = await Promise.all([
    db
      .from('crm_projects')
      .select('id, stage, created_at, first_contact_at')
      .eq('enquiry_id', enquiryId)
      .then(
        (r) => (r.error ? null : ((r.data ?? []) as RuleJob[])),
        () => null
      ),
    db.from('enquiries').select('status, created_at').eq('id', enquiryId).maybeSingle(),
  ]);
  // No CRM tables (or before crm-v2.sql): nothing to move.
  if (!jobs) return false;
  const plan = contactPlan(jobs, e as { status: string; created_at: string } | null, ours);
  let moved = false;
  for (const j of plan.jobs) {
    if ((await markContacted({ projectId: j.id }, j.at, { note: contactNote(j.at), byId })) > 0) moved = true;
  }
  if (plan.enquiryAt && (await looseContacted(enquiryId, plan.enquiryAt, byId))) moved = true;
  return moved;
}

/** Every row a read gives, PAGE at a time (up to MAX_ROWS); none if it fails (a table or column not there yet). */
async function allRows<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) return [];
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

/** Each customer's newest message from us (written by a person), by enquiry id. */
async function latestOurs(enquiryIds: string[]): Promise<Map<string, string>> {
  const db = createAdminClient();
  const latest = new Map<string, string>();
  await inTurns(chunks(enquiryIds, 50), 4, async (batch) => {
    const { data } = await db
      .from('whatsapp_messages')
      .select('enquiry_id, created_at')
      .in('enquiry_id', batch)
      .eq('direction', 'out')
      .or(BY_PERSON)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const rows = (data ?? []) as { enquiry_id: string; created_at: string }[];
    for (const m of rows) if (!latest.has(m.enquiry_id)) latest.set(m.enquiry_id, m.created_at);
    // A full page: someone with a long chat filled it, so ask for the others one by one.
    if (rows.length === PAGE) {
      await Promise.all(
        batch
          .filter((id) => !latest.has(id))
          .map(async (id) => {
            const { data: one } = await db
              .from('whatsapp_messages')
              .select('created_at')
              .eq('enquiry_id', id)
              .eq('direction', 'out')
              .or(BY_PERSON)
              .order('created_at', { ascending: false })
              .limit(1);
            if (one?.[0]) latest.set(id, one[0].created_at as string);
          })
      );
    }
  });
  return latest;
}

/** Who the catch-up would move now: jobs at Lead nobody has contacted, and customers at New without a job. */
async function catchUpNow() {
  const db = createAdminClient();
  const [jobs, news] = await Promise.all([
    allRows<CatchUpJob>((from, to) =>
      db.from('crm_projects').select('id, enquiry_id, created_at').eq('stage', 'lead').is('first_contact_at', null).order('id').range(from, to)
    ),
    allRows<CatchUpCustomer>((from, to) =>
      db.from('enquiries').select('id, created_at').eq('status', 'new').not('wa_last_message_at', 'is', null).order('id').range(from, to)
    ),
  ]);
  // A customer with a job is moved by their job.
  const withJob = new Set<string>();
  await inTurns(chunks(news.map((e) => e.id), 100), 4, async (batch) => {
    const { data } = await db.from('crm_projects').select('enquiry_id').in('enquiry_id', batch);
    for (const p of (data ?? []) as { enquiry_id: string }[]) withJob.add(p.enquiry_id);
  });
  const loose = news.filter((e) => !withJob.has(e.id));
  const ids = [...new Set([...jobs.map((j) => j.enquiry_id), ...loose.map((e) => e.id)])];
  return catchUpPick({ jobs, loose, latest: ids.length ? await latestOurs(ids) : new Map() });
}

/** How many customers the catch-up would move (the banner's number). */
export async function catchUpCount(): Promise<number> {
  return (await catchUpNow()).customers.length;
}

/** The first message from us to this customer since `since` (the job or enquiry came in). */
async function firstOurs(enquiryId: string, since: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('whatsapp_messages')
    .select('created_at')
    .eq('enquiry_id', enquiryId)
    .eq('direction', 'out')
    .or(BY_PERSON)
    .gte('created_at', new Date(Date.parse(since) - GRACE_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(1);
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

/**
 * Moves the next CATCH_UP_BATCH customers to Contacted, each job from the first message we sent since
 * it came in ("Lead → Contacted (messaged on WhatsApp on 3 Sep)" on its timeline). Safe to run again
 * and again: anyone already moved, or past Lead, isn't picked. `tried`: how many it tried this time;
 * `remaining`: still to do after these.
 */
export async function catchUpRun(byId: string | null): Promise<{ moved: number; tried: number; remaining: number }> {
  const pick = await catchUpNow();
  const batch = pick.customers.slice(0, CATCH_UP_BATCH);
  const results = await inTurns(batch, 3, async (enquiryId) => {
    let moved = false;
    for (const j of pick.jobs.filter((x) => x.enquiry_id === enquiryId)) {
      const at = await firstOurs(enquiryId, j.created_at);
      if (at && (await markContacted({ projectId: j.id }, at, { note: contactNote(at), byId })) > 0) moved = true;
    }
    const loose = pick.loose.find((e) => e.id === enquiryId);
    if (loose) {
      const at = await firstOurs(enquiryId, loose.created_at);
      if (at && (await looseContacted(enquiryId, at, byId))) moved = true;
    }
    return moved;
  });
  return { moved: results.filter(Boolean).length, tried: batch.length, remaining: pick.customers.length - batch.length };
}
