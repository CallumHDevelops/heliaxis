import 'server-only';
import { addWorkingDays, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { schemaReady } from '@/lib/schema-ready';
import { addSourceTask } from '@/lib/surveys/server';
import { appWordsFor } from './forms/electrician/shared';
import { siteShort } from './messages';
import { logJob, type AssignmentRow, type Db } from './server';
import { registerSignoff, type SignoffRow } from './signoff-plugins';
import { firstNameOf, valuesOf } from './types';

/**
 * What the electrician's sign-off does (SPEC 2.13), all of it safe to run again (the cron does, until
 * the documents are made):
 *
 * 1. commissioned_at from the sign-off, when they confirmed it's commissioned (EF1), only if empty;
 * 2. the job moves on to Paperwork & handover (the 'commissioned' stage event);
 * 3. the deadline tasks (MCS, G98/G99, Building Regs) now there's a commissioning date, and the DNO
 *    to-do for an EV charger or heat pump;
 * 4. (the labour PO, as every trade's: signoff.ts)
 * 5. the handover call: "Handover call: go through the pack and the solar app with Jane", due the
 *    next working day, for the job owner (site-call:<assignment>);
 * 6. "Set up the monitoring remotely" when it couldn't go on the customer's internet;
 * 7. the paperwork, after the reply (electrician-docs.ts).
 *
 * Their test instruments are remembered on their contact for next time.
 */

/** A calendar day n days on (YYYY-MM-DD, noon UTC so the clocks changing can't move it). */
const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function electricianJob(db: Db, a: AssignmentRow, s: SignoffRow): Promise<void> {
  if (s.stage !== 'main') return;
  const { data: p } = await db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle();
  if (!p) return;
  const project = p as Record<string, unknown>;
  const v = valuesOf(a.answers);
  const products = (Array.isArray(project.products) ? project.products : []) as string[];
  const day = ukDay(new Date(s.signed_at));
  const owner = (project.owner_id as string | null) ?? null;
  // Loaded when an electrician signs, not with every sign-off (they bring the CRM's stage moves and deadlines).
  const [{ applyStageEvent }, { ensureDeadlineTasks }] = await Promise.all([import('@/lib/crm/move-stage'), import('@/lib/projects/server')]);
  const where = siteShort(String(project.address ?? ''), (project.postcode as string | null) ?? null) || (project.project_ref as string | null) || 'the job';

  // 1. Commissioned, from their confirmation.
  if (v.EF1 === true) {
    const { data } = await db.from('crm_projects').update({ commissioned_at: s.signed_at, updated_at: new Date().toISOString() }).eq('id', a.project_id).is('commissioned_at', null).select('id');
    if (data?.length) await logJob(db, a.project_id, `Commissioned on ${day} (the electrician’s sign-off)`, { assignment: a.id, commissioned_at: s.signed_at }, null);
  }
  // 2. On to the paperwork and handover.
  await applyStageEvent(a.project_id, 'commissioned', { note: 'the electrician signed off' });
  // 3. The deadlines that run from commissioning.
  await ensureDeadlineTasks(a.project_id);
  const hols = await ukBankHolidays();
  for (const [key, what, ref] of [
    ['ev_dno', 'EV charger', 'ev_dno_ref'],
    ['hp_dno', 'heat pump', 'hp_dno_ref'],
  ] as const) {
    if (v[key] === 'notify') {
      await addSourceTask(db, {
        projectId: a.project_id,
        key: `site-dno-${key.slice(0, 2)}:${a.id}`,
        title: `Notify the DNO about the ${what} (connect and notify) · ${where}`,
        notes: `The electrician says it’s 60 A or less after installation, so the DNO is notified within 28 days of the install (by ${plusDays(day, 28)}).`,
        assigneeId: owner,
        dueDate: plusDays(day, 21),
      });
    } else if (v[key] === 'apply') {
      await addSourceTask(db, {
        projectId: a.project_id,
        key: `site-dno-${key.slice(0, 2)}:${a.id}`,
        title: `Check the DNO accepted the ${what} application · ${where}`,
        notes: `Over 60 A, so it was applied for before installing${typeof v[ref] === 'string' && v[ref] ? ` (reference ${v[ref]})` : ''}. Keep the acceptance with the job.`,
        assigneeId: owner,
        dueDate: addWorkingDays(day, 1, hols),
      });
    }
  }
  // 5. Tomorrow's handover call.
  const { data: cust } = await db.from('enquiries').select('name').eq('id', String(project.enquiry_id ?? '')).maybeSingle();
  const first = firstNameOf((cust as { name?: string } | null)?.name) || 'the customer';
  await addSourceTask(db, {
    projectId: a.project_id,
    key: `site-call:${a.id}`,
    title: `Handover call: go through the pack and ${appWordsFor(products)} with ${first}`,
    notes: `${s.signed_name} told ${first} one of the team would be in touch today. The paperwork is on the job’s ${(await schemaReady()).handover ? 'Handover' : 'Docs'} tab.`,
    assigneeId: owner,
    dueDate: addWorkingDays(day, 1, hols),
  });
  // 6. Monitoring the office sets up.
  if (v.EF2 === 'not_possible') {
    await addSourceTask(db, {
      projectId: a.project_id,
      key: `site-monitoring:${a.id}`,
      title: `Set up monitoring remotely · ${where}`,
      notes: `It couldn’t go on the customer’s internet${typeof v.EF2n === 'string' && v.EF2n.trim() ? `: ${v.EF2n.trim()}` : ''}.`,
      assigneeId: owner,
      dueDate: addWorkingDays(day, 1, hols),
    });
  }
  // Their instruments, offered on their next job.
  if (typeof v.f43_instruments === 'string' && v.f43_instruments.trim()) {
    await db.from('site_contacts').update({ instruments: [{ text: v.f43_instruments.trim().slice(0, 300), at: s.signed_at }], updated_at: new Date().toISOString() }).eq('id', a.contact_id);
  }
}

registerSignoff('electrician', {
  job: electricianJob,
  // The job updates again (only what's missing), then the paperwork: if either fails, the cron tries both again.
  docs: async (db, a, s) => {
    await electricianJob(db, a, s);
    const { saveElectricianDocs } = await import('./electrician-docs');
    return saveElectricianDocs(db, a.id);
  },
});
