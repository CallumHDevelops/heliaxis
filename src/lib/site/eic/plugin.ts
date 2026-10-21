import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { isRoute } from '../forms/electrician/eic-model';
import { logJob, type AssignmentRow, type Db } from '../server';
import type { SignoffPlugin, SignoffRow } from '../signoff';
import { saveCertificate } from './server';

/**
 * What the electrician's sign-off does for the certificate (registered in signoff.ts):
 * - job: paperwork.eic_on (the day it was signed) when the certificate was made in the app, only
 *   where it's empty; and the test instruments remembered on the contact for their next job;
 * - docs: the EIC (or the Minor Works sheets) made and filed, after the reply.
 */

const routeIn = (a: AssignmentRow) => {
  const v = (a.answers.eic_route as { v?: unknown } | undefined)?.v;
  return isRoute(v) ? v : isRoute(a.cert_route) ? a.cert_route : 'eic';
};

async function eicOn(db: Db, a: AssignmentRow, s: SignoffRow) {
  if (routeIn(a) === 'own') return;
  const { data: p } = await db.from('crm_projects').select('paperwork').eq('id', a.project_id).maybeSingle();
  const paperwork = ((p as { paperwork?: Record<string, unknown> } | null)?.paperwork ?? {}) as Record<string, unknown>;
  if (paperwork.eic_on) return;
  const day = ukDay(new Date(s.signed_at));
  await db.from('crm_projects').update({ paperwork: { ...paperwork, eic_on: day } }).eq('id', a.project_id);
  await logJob(db, a.project_id, `EIC done ${day} (from the electrician’s sign-off)`, { assignment: a.id, eic_on: day }, null);
}

/** The instruments on this certificate, kept on the contact ({ k: 'eic_mft', v }), alongside anything else kept there. */
async function rememberInstruments(db: Db, a: AssignmentRow) {
  const inst = (a.answers.eic_inst as { v?: unknown } | undefined)?.v;
  if (!inst || typeof inst !== 'object') return;
  const { data: c } = await db.from('site_contacts').select('instruments').eq('id', a.contact_id).maybeSingle();
  const was = Array.isArray((c as { instruments?: unknown } | null)?.instruments) ? ((c as { instruments: unknown[] }).instruments as { k?: unknown }[]) : [];
  const mine = Object.entries(inst as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => ({ k: `eic_${k}`, v: String(v).trim().slice(0, 120) }));
  if (!mine.length) return;
  const keep = was.filter((x) => !(typeof x?.k === 'string' && x.k.startsWith('eic_')));
  await db.from('site_contacts').update({ instruments: [...keep, ...mine], updated_at: new Date().toISOString() }).eq('id', a.contact_id);
}

export const EIC_SIGNOFF: SignoffPlugin = {
  job: async (db, a, s) => {
    if (s.stage !== 'main') return;
    await eicOn(db, a, s);
    await rememberInstruments(db, a).catch(() => null);
  },
  docs: async (db, a) => saveCertificate(db, a.id),
};
