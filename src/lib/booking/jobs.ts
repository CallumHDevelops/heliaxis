import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { logActivity } from '@/lib/crm/server';
import { runCalendarSync } from './calendar-sync';
import { pushStaff, setNextStep, whenText } from './book';
import { firstName, parseRange, type BookingRow, type ProjectRow } from './diary';

/**
 * Survey booking's every-minute jobs (called from the cron with `until` = its start + 40 s): lapse
 * holds and unconfirmed requests, keep bookings in step with dates changed in the CRM, nudge staff
 * about requests waiting over 2 hours, copy changes to Outlook, and tidy up. A lease in cms_kv
 * means two cron calls never run them at the same time. Sends customers nothing.
 */

const LEASE = 'booking-jobs-lease';
const MIN = 60_000;

export type BookingJobsResult = {
  skipped?: string;
  expiredHolds: number;
  expiredRequests: number;
  cancelled: number;
  reminded: number;
  synced: number;
  errors: number;
};

/** 55-second lease: the value is "<expiry ISO>|<random>", so a compare on the value is enough. */
async function takeLease(): Promise<string | null> {
  const db = createAdminClient();
  const now = Date.now();
  const mine = `${new Date(now + 55_000).toISOString()}|${randomUUID()}`;
  const at = new Date(now).toISOString();
  const { data, error } = await db.from('cms_kv').update({ value: mine, updated_at: at }).eq('key', LEASE).lt('value', at).select('key');
  if (error) return null;
  if (data?.length) return mine;
  const ins = await db.from('cms_kv').insert({ key: LEASE, value: mine, updated_at: at });
  return ins.error ? null : mine;
}

async function dropLease(mine: string) {
  await createAdminClient().from('cms_kv').update({ value: new Date(0).toISOString() }).eq('key', LEASE).eq('value', mine);
}

async function customerName(enquiryId: string | null): Promise<string> {
  if (!enquiryId) return 'the customer';
  const { data } = await createAdminClient().from('enquiries').select('name').eq('id', enquiryId).maybeSingle();
  return (data?.name as string) || 'the customer';
}

export async function runBookingJobs({ until }: { until: number }): Promise<BookingJobsResult> {
  const out: BookingJobsResult = { expiredHolds: 0, expiredRequests: 0, cancelled: 0, reminded: 0, synced: 0, errors: 0 };
  if (!(await schemaReady()).booking) return { ...out, skipped: 'survey-booking.sql not run yet' };
  const lease = await takeLease();
  if (!lease) return { ...out, skipped: 'already running' };
  const db = createAdminClient();
  try {
    // 1. Lapse holds and requests nobody confirmed in time.
    const ex = await db.rpc('survey_slot_expire').then(
      (r) => r,
      () => ({ data: null, error: { message: 'missing' } })
    );
    const res = (ex.data ?? {}) as { holds?: number; requests?: { id: string; project_id: string | null }[] };
    out.expiredHolds = res.holds ?? 0;
    for (const r of res.requests ?? []) {
      out.expiredRequests++;
      if (!r.project_id) continue;
      const { data: b } = await db.from('survey_bookings').select('*').eq('id', r.id).maybeSingle();
      const booking = b as BookingRow | null;
      const when = booking ? parseRange(booking.onsite) : null;
      const name = await customerName(booking?.enquiry_id ?? null);
      const first = firstName(name) || name;
      if (booking?.enquiry_id) {
        await logActivity({
          enquiryId: booking.enquiry_id,
          projectId: r.project_id,
          kind: 'system',
          body: `Survey request for ${when ? whenText(when.start) : 'the time asked for'} wasn’t confirmed in time, so it lapsed`,
        }).catch(() => null);
      }
      await setNextStep(r.project_id, `Call ${first} to arrange the survey (request not confirmed)`);
      await pushStaff({ projectId: r.project_id, surveyorKey: booking?.surveyor_key, title: `Survey request lapsed: ${name}`, body: 'Call them to arrange a time', href: `/admin/crm/${r.project_id}`, tag: `crm-${r.project_id}` });
    }

    // 2. Confirmed bookings whose job changed in the CRM since (10 minutes' grace for the confirm to land).
    const now = Date.now();
    const { data: conf } = await db
      .from('survey_bookings')
      .select('*')
      .eq('status', 'confirmed')
      .lt('confirmed_at', new Date(now - 10 * MIN).toISOString())
      .gte('day', new Date(now - 24 * 60 * MIN).toISOString().slice(0, 10))
      .limit(500);
    const live = ((conf ?? []) as BookingRow[]).filter((b) => (parseRange(b.onsite)?.end ?? 0) > now);
    const ids = [...new Set(live.map((b) => b.project_id).filter((x): x is string => !!x))];
    const jobs = new Map<string, ProjectRow>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await db.from('crm_projects').select('*').in('id', ids.slice(i, i + 100));
      for (const p of (data ?? []) as ProjectRow[]) jobs.set(p.id, p);
    }
    for (const b of live) {
      const p = b.project_id ? jobs.get(b.project_id) : undefined;
      const start = parseRange(b.onsite)?.start;
      const gone = !p || p.stage === 'lost' || p.survey_booking_id !== b.id;
      const edited = !gone && (!p.survey_at || Date.parse(p.survey_at) !== start);
      if (!gone && !edited) continue;
      const { data: done } = await db
        .from('survey_bookings')
        .update({ status: 'cancelled', cancel_reason: 'changed in the CRM', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', b.id)
        .eq('status', 'confirmed')
        .select('id');
      if (!done?.length) continue;
      out.cancelled++;
      // The date staff set stays; the job just stops pointing at the old booking.
      if (edited && p) await db.from('crm_projects').update({ survey_booking_id: null }).eq('id', p.id).eq('survey_booking_id', b.id);
    }

    // 3. Requests waiting over 2 hours: one more nudge (not in quiet hours).
    const { getSettings } = await import('@/lib/whatsapp/settings');
    const { isQuiet } = await import('@/lib/whatsapp/schedule');
    const wa = await getSettings();
    if (!isQuiet(new Date(), wa.quietFrom, wa.quietTo)) {
      const { data: waiting } = await db
        .from('survey_bookings')
        .select('*')
        .eq('status', 'requested')
        .is('reminded_at', null)
        .lt('created_at', new Date(now - 120 * MIN).toISOString())
        .limit(50);
      for (const b of (waiting ?? []) as BookingRow[]) {
        const { data: marked } = await db.from('survey_bookings').update({ reminded_at: new Date().toISOString() }).eq('id', b.id).is('reminded_at', null).select('id');
        if (!marked?.length) continue;
        const when = parseRange(b.onsite);
        await pushStaff({
          projectId: b.project_id,
          surveyorKey: b.surveyor_key,
          title: `Still waiting: ${await customerName(b.enquiry_id)}’s survey request`,
          body: `${when ? whenText(when.start) : ''}. Tap to confirm or offer another time`,
          href: '/admin/surveys',
          tag: b.project_id ? `crm-${b.project_id}` : undefined,
        });
        out.reminded++;
      }
    }

    // 4. The Outlook copy.
    if (Date.now() < until) {
      const sync = await runCalendarSync({ until });
      out.synced = sync.synced;
      out.errors = sync.errors;
    }

    // 5. Tidy, twice an hour: old rate-limit buckets, and website holds that never became a booking.
    if (new Date().getUTCMinutes() % 30 === 0 && Date.now() < until) {
      await db.from('public_rate_limits').delete().lt('bucket', new Date(now - 24 * 60 * MIN).toISOString());
      await db
        .from('survey_bookings')
        .delete()
        .is('project_id', null)
        .in('status', ['held', 'expired', 'cancelled'])
        .lt('created_at', new Date(now - 7 * 24 * 60 * MIN).toISOString());
    }
  } finally {
    await dropLease(lease);
  }
  return out;
}
