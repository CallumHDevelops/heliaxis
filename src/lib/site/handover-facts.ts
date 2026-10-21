import 'server-only';
import type { FactsPlugin } from '@/lib/handover/facts';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import { certRef, routeOf } from './forms/electrician/cert';
import { designOf, eicSummary } from './forms/electrician/eic';
import { circuitsTested } from './forms/electrician/f78';
import { valueOf } from './rules';
import { assignmentRow, type Db } from './server';

/**
 * What the site app tells the handover pack beyond the electrician's answers (handover/facts.ts runs
 * it for every job): the certificate's reference as the other forms print it ("HX-0042-EIC", or
 * "NAPIT EIC 123456" for their own), the next inspection from the EIC (the office's design part, or
 * the electrician's on a single signature), what the certificate still waits for from the office, the
 * EIC's design signature (F78's design part is the same signature), and the answers the forms work
 * out for them (F78's initial or periodic verification follows F43's, its circuits tested).
 * Read the same way as the gate reads them (serverCtx), for the job's latest live electrician.
 */
export const siteHandoverFacts: FactsPlugin = async (db: Db, projectId: string) => {
  const { data } = await db.from('site_assignments').select('*').eq('project_id', projectId).eq('trade', 'electrician').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return null;
  const ctx = await serverCtx(db, assignmentRow(row));
  const route = routeOf(ctx);
  const signed = ctx.signed.includes('main');
  // The answers the forms work out for them (F78's verification from F43's, F44 36–38) unless they answered.
  const worked: Record<string, unknown> = {};
  for (const f of schemaFor(assignmentRow(row)).flatMap((x) => x.steps.flatMap((s) => s.fields))) {
    if (!f.auto || ctx.values[f.key] !== undefined) continue;
    const v = valueOf(f, ctx);
    if (v !== undefined) worked[f.key] = v;
  }
  // F78's circuits tested, when they didn't type it: F43's strings and the EIC's circuits.
  if (ctx.values.f78_p_circuits === undefined) {
    const circuits = circuitsTested(ctx);
    if (circuits) worked.f78_p_circuits = circuits;
  }
  // The EIC's design part, signed in the office (sign-design writes it as office:<staff>): F78's design signature too.
  const d = designOf(ctx);
  const byOffice = String((assignmentRow(row).answers.eic_design as { dev?: unknown } | undefined)?.dev ?? '').startsWith('office:');
  return {
    certRef: certRef(ctx),
    nextInspection: eicSummary(ctx).next,
    certWaits: signed && route === 'eic' && !d ? 'Sign the EIC’s design part (Site tab, the electrician’s card): the certificate and the next inspection come from it.' : null,
    design: d && byOffice ? { name: d.name, signed_at: d.signed_at, path: d.path, by: d.by } : null,
    values: worked,
  };
};
