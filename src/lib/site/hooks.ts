import 'server-only';
import { notify } from '@/lib/notify';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import { flagsFor, lateKeysOf, mergeFlags, newFlags, openForms } from './rules';
import { logJob, logSiteEvent, type AssignmentRow, type Db } from './server';
import { queueRead, runRead } from './vision';
import { TRADE_LABEL, type Flag, type Stage } from './types';

/**
 * What the server does as a trade's answers and photos arrive. The forms engine (forms/index.ts and
 * rules.ts) decides: which keys stay open after a sign-off, and the flags the answers raise.
 * Electrician paperwork (Unit 2) and the EIC (Unit 3) plug in through their forms the same way.
 */

async function signedStages(db: Db, a: AssignmentRow): Promise<Stage[]> {
  const { data } = await db.from('site_signoffs').select('stage').eq('assignment_id', a.id);
  return ((data ?? []) as { stage: Stage }[]).map((s) => s.stage);
}

/** Answer keys and photo slots that still take changes after this assignment's sign-off. */
export async function lateKeysFor(db: Db, a: AssignmentRow): Promise<string[]> {
  if (a.status !== 'signed' && a.status !== 'done') return [];
  return lateKeysOf(schemaFor(a), await signedStages(db, a));
}

/**
 * Work out the flags again from what the server holds, store them (keeping when each was raised and
 * how the office resolved it), and tell the job's owner about new Urgent ones straight away, before
 * any sign-off (push and the job's activity).
 */
export async function afterAnswers(db: Db, a: AssignmentRow): Promise<Flag[]> {
  const forms = schemaFor(a);
  if (!forms.length) return a.flags;
  const ctx = await serverCtx(db, a);
  const raised = openForms(forms, ctx.signed).flatMap((f) => flagsFor(f, ctx));
  const now = mergeFlags(a.flags, raised, new Date().toISOString());
  if (JSON.stringify(now) === JSON.stringify(a.flags)) return a.flags;
  await db.from('site_assignments').update({ flags: now }).eq('id', a.id);
  const added = newFlags(a.flags, now);
  const gone = a.flags.filter((f) => !now.some((x) => x.code === f.code));
  for (const f of added) await logSiteEvent(db, a.id, 'system', 'flag_raised', { code: f.code, severity: f.severity, text: f.text });
  for (const f of gone) await logSiteEvent(db, a.id, 'system', 'flag_cleared', { code: f.code });
  const urgent = added.filter((f) => f.severity === 'urgent');
  if (urgent.length) await tellOwner(db, a, urgent);
  return now;
}

async function tellOwner(db: Db, a: AssignmentRow, urgent: Flag[]) {
  const { data: p } = await db.from('crm_projects').select('owner_id, project_ref, address').eq('id', a.project_id).maybeSingle();
  const project = p as { owner_id: string | null; project_ref: string | null; address: string | null } | null;
  const where = project?.project_ref || (project?.address ?? '').split('\n')[0] || 'a job';
  const who = TRADE_LABEL[a.trade];
  const body = urgent.map((f) => f.text).join(' · ');
  await logJob(db, a.project_id, `${who} flagged on site: ${body}`, { assignment: a.id, flags: urgent.map((f) => f.code) }, null);
  if (project?.owner_id) {
    await notify({ userId: project.owner_id, kind: 'site_flag', title: `Urgent from the ${who.toLowerCase()} · ${where}`, body, href: `/admin/projects/${a.project_id}?tab=site`, tag: `site-flag-${a.id}` }).catch(() => {});
  }
}

/** A photo has arrived. Label and data-badge photos are queued for a read and read now (after the reply). */
export async function afterPhoto(db: Db, a: AssignmentRow, photo: { id: string; slot: string; read: boolean }): Promise<void> {
  if (!photo.read) return;
  await queueRead(db, a.id, photo.id, photo.slot.split(':')[0]);
  await runRead(db, photo.id);
}
