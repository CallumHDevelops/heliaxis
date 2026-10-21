import 'server-only';
import { DOCS_BUCKET } from '@/lib/crm/server';
import type { Db } from './server';

/**
 * Joining two jobs moves the merged-away job's signatures folder (crm-docs signatures/<job>/) to the
 * kept job's (crm/merge.ts moveFolder). The site app and the handover pack keep signatures there that
 * are named in rows of their own, not the columns MERGE_TABLES lists, so they're pointed at the new
 * folder here, once every file is across:
 *
 * - site_signoffs.signature_path (the trade's sign-off) and extra (the customer's, on the electrician's phone);
 * - site_assignments.answers (the EIC's design part, signed in the office);
 * - handover_slots.data (F78's design part, the customer's portal signatures).
 *
 * crm_merge() has already moved these rows to the kept job, so only its rows are read. Safe to run
 * again: a value that no longer names the old folder is left alone. → how many rows couldn't be
 * updated (the every-minute job tries the folder again). Before site-commissioning.sql: nothing.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function moveSitePaths(db: Db, m: { bucket: string; from: string; to: string }): Promise<number> {
  if (m.bucket !== DOCS_BUCKET || !m.from.startsWith('signatures/')) return 0;
  const kept = UUID.exec(m.to)?.[0];
  if (!kept) return 0;
  // A path, or one inside a jsonb value: every mention of the old folder, as the new one (ids can't collide).
  const moved = (v: unknown): unknown => {
    const s = JSON.stringify(v ?? null);
    return s.includes(m.from) ? JSON.parse(s.split(m.from).join(m.to)) : undefined;
  };
  let stuck = 0;
  const done = (r: { error: unknown }) => {
    if (r.error) stuck++;
  };

  const { data: rows, error } = await db.from('site_assignments').select('id, answers').eq('project_id', kept);
  if (error) return 0;
  const assignments = (rows ?? []) as { id: string; answers: unknown }[];
  for (const a of assignments) {
    const answers = moved(a.answers);
    if (answers !== undefined) done(await db.from('site_assignments').update({ answers }).eq('id', a.id));
  }
  if (assignments.length) {
    const { data: so } = await db.from('site_signoffs').select('id, signature_path, extra').in('assignment_id', assignments.map((a) => a.id));
    for (const s of (so ?? []) as { id: string; signature_path: string | null; extra: unknown }[]) {
      const path = s.signature_path?.startsWith(m.from) ? m.to + s.signature_path.slice(m.from.length) : null;
      const extra = moved(s.extra);
      if (path || extra !== undefined) done(await db.from('site_signoffs').update({ ...(path ? { signature_path: path } : {}), ...(extra !== undefined ? { extra } : {}) }).eq('id', s.id));
    }
  }
  // The handover pack (handover.sql may not have been run).
  const { data: slots, error: noSlots } = await db.from('handover_slots').select('slot, data').eq('project_id', kept);
  if (!noSlots) {
    for (const h of (slots ?? []) as { slot: string; data: unknown }[]) {
      const data = moved(h.data);
      if (data !== undefined) done(await db.from('handover_slots').update({ data }).eq('project_id', kept).eq('slot', h.slot));
    }
  }
  return stuck;
}
