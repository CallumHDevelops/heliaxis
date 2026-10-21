import 'server-only';
import { addWorkingDays, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { addSourceTask } from '@/lib/surveys/server';
import { sendStrikeRequest } from './send';
import { assignmentRow, type ContactRow, type Db } from './server';
import { getSiteSettings } from './settings';

/**
 * Asking the scaffolder for the strike photos (FORMS 3.2): from the working day after the job's
 * scaffold_down_on, then again on the owner's reminder days (working days after that date; 1, 3 and
 * 5 unless changed), each message once (its dedupe key). A working day after the last one with
 * still no strike sign-off, the job owner gets a Review task. Run by /api/cron/site.
 */
export async function strikeReminders(db: Db, now = new Date()): Promise<{ asked: number; tasks: number }> {
  const out = { asked: 0, tasks: 0 };
  // Signed = the erection is signed off and the strike isn't (that moves it to done).
  const { data } = await db.from('site_assignments').select('*').eq('trade', 'scaffolder').eq('status', 'signed').limit(200);
  const list = (data ?? []).map(assignmentRow);
  if (!list.length) return out;
  const [{ data: projects }, { data: contacts }, hols, settings] = await Promise.all([
    db.from('crm_projects').select('id, scaffold_down_on, owner_id, project_ref, address').in('id', [...new Set(list.map((a) => a.project_id))]),
    db.from('site_contacts').select('*').in('id', [...new Set(list.map((a) => a.contact_id))]),
    ukBankHolidays(),
    getSiteSettings(),
  ]);
  const days = settings.strikeReminderDays.length ? settings.strikeReminderDays : [1];
  const today = ukDay(now);
  const jobOf = new Map(((projects ?? []) as { id: string; scaffold_down_on: string | null; owner_id: string | null; project_ref: string | null; address: string | null }[]).map((p) => [p.id, p]));
  const personOf = new Map(((contacts ?? []) as ContactRow[]).map((c) => [c.id, c]));
  for (const a of list) {
    const job = jobOf.get(a.project_id);
    const person = personOf.get(a.contact_id);
    const down = job?.scaffold_down_on ? String(job.scaffold_down_on).slice(0, 10) : null;
    if (!job || !person || !down) continue;
    const due = days.filter((d) => addWorkingDays(down, d, hols) <= today);
    if (!due.length) continue;
    // The latest one due: a missed cron run doesn't send the earlier ones in a burst.
    const sent = await sendStrikeRequest(db, a, person, Math.max(...due), now);
    out.asked += sent.length;
    if (today >= addWorkingDays(down, Math.max(...days) + 1, hols)) {
      const where = job.project_ref || (job.address ?? '').split('\n')[0] || 'the job';
      const made = await addSourceTask(db, {
        projectId: a.project_id,
        key: `site-strike:${a.id}`,
        title: `Scaffold strike photos not in yet · ${where}`,
        notes: `The scaffold was due down on ${down}. ${person.name} has been asked for the strike photos ${days.length === 1 ? 'once' : `${days.length} times`}.`,
        assigneeId: job.owner_id,
      });
      if (made) out.tasks++;
    }
  }
  return out;
}
