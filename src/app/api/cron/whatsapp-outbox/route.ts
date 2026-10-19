import { NextResponse } from 'next/server';
import { processOutbox, remindUnanswered } from '@/lib/whatsapp/inbox';
import { remindNextSteps } from '@/lib/crm/server';
import { runCrmAutomations } from '@/lib/crm/automation';
import { remindDueTasks } from '@/lib/tasks-server';
import { runBookingJobs } from '@/lib/booking/jobs';
import { pollMailbox } from '@/lib/ms365';
import { notifyEnquiryTeam } from '@/lib/whatsapp/inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Every minute (Supabase pg_cron → see supabase/whatsapp.sql): CRM automations (reminders, reviews,
 * lead alerts, sequences), new emails from Microsoft 365, and WhatsApp smart replies, intros and
 * chasers that are due, remind the team about customers left waiting, push CRM next steps that
 * have fallen due, the morning task round-up, and survey booking's background jobs (lapsed holds,
 * reminders, the Outlook copy). Booking starts no new work after 40 s, inside the 60 s limit; a
 * failure in either of those two never stops the rest.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const result = await processOutbox();
  const reminded = await remindUnanswered().catch(() => 0);
  const followUps = await remindNextSteps().catch(() => 0);
  const tasksDue = await remindDueTasks().catch(() => 0);
  const booking = await runBookingJobs({ until: started + 40_000 }).catch((e) => ({ error: String(e) }));
  const crm = await runCrmAutomations().catch((e) => ({ error: e instanceof Error ? e.message : 'failed' }));
  const emails = await pollMailbox((enquiryId, name, subject) =>
    notifyEnquiryTeam(`Email from ${name}`, subject, `/admin/crm?enquiry=${enquiryId}`, { tag: `em-${enquiryId}` })
  ).catch((e) => `error: ${e instanceof Error ? e.message : 'failed'}`);
  return NextResponse.json({ ok: true, ...result, reminded, followUps, tasksDue, booking, crm, emails });
}
