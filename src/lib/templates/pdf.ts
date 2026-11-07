import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { docFileName, variantOf } from '@/lib/documents/pdf-kit';
import { renderTemplate } from '@/lib/documents/templates/render';
import { templateByCode } from './registry';
import { jobHeadFor, supabaseStore } from './store';

/**
 * A form as a PDF in the Heliaxis document style: a draft (with its banner, and "Not answered" where empty) until it is
 * signed, then as the record. A form not started is the empty template for this job. One place, so the form's own page,
 * its Download button and a pack's ZIP all draw the same thing.
 */
export async function formPdf(db: SupabaseClient, projectId: string, code: string, print = false): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; status: number; error: string }> {
  const template = templateByCode(code);
  if (!template) return { ok: false, status: 404, error: 'No such form' };
  const variant = variantOf(print ? 'print' : 'digital');
  const job = await jobHeadFor(db, projectId, variant);
  if (!job) return { ok: false, status: 404, error: 'Not found' };
  const row = await supabaseStore(db).live(projectId, template.code);
  const signed = Object.fromEntries(Object.entries(row?.signed ?? {}).map(([k, v]) => [k, { name: v.name, at: v.at, png: v.image ?? null }]));
  try {
    const bytes = await renderTemplate({ template, job, answers: row?.answers, signed, draft: row?.status !== 'signed', revision: row?.issue ?? null });
    return { ok: true, bytes, fileName: docFileName(job.ref, template.code, template.title, row?.revision ?? 1) };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : 'Could not make the PDF' };
  }
}
