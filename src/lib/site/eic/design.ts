import 'server-only';
import { DOCS_BUCKET, ensureDocsBucket } from '@/lib/crm/server';
import { validSignature } from '@/lib/subcontractors/server';
import type { DesignSign } from '../forms/electrician/eic';
import { logJob, logSiteEvent, readAssignment, type AssignmentRow, type Db } from '../server';
import type { Answer } from '../types';
import { saveCertificate } from './server';

/**
 * The design part of the EIC, signed in the office by Heliaxis's designer (SPEC 3.2.9, Site tab →
 * Sign the design part): their particulars, the next inspection (years or months: there's no
 * default, REGS 1.2), any departures from BS 7671 in the design, and the signature. Stored on the
 * assignment as answers.eic_design (never a key the phone writes, and not part of what the
 * electrician signed), the signature in crm-docs. Signing again replaces it. The certificate is
 * made again straight after, final once the electrician has signed off too.
 */

export type DesignInput = { name?: unknown; company?: unknown; address?: unknown; postcode?: unknown; tel?: unknown; next_n?: unknown; next_unit?: unknown; departures?: unknown; signature?: unknown };

const clean = (v: unknown, max = 160) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function cleanDesign(b: DesignInput): { ok: true; v: Omit<DesignSign, 'signed_at' | 'path' | 'by'> } | { ok: false; error: string } {
  const name = clean(b.name, 120);
  if (!name) return { ok: false, error: 'Put the designer’s name.' };
  const company = clean(b.company);
  const address = clean(b.address, 240);
  const postcode = clean(b.postcode, 12).toUpperCase();
  const tel = clean(b.tel, 40);
  if (!company || !address || !postcode || !tel) return { ok: false, error: 'Fill in the company, address, postcode and phone.' };
  const unit = b.next_unit === 'months' ? 'months' : b.next_unit === 'years' ? 'years' : null;
  const n = Number(b.next_n);
  if (!unit || !Number.isInteger(n) || n < 1 || n > (unit === 'years' ? 25 : 120)) return { ok: false, error: 'Say when it should next be inspected: a whole number of years or months.' };
  const departures = b.departures === null || b.departures === undefined || clean(b.departures, 2000) === '' ? null : clean(b.departures, 2000);
  return { ok: true, v: { name, company, address, postcode, tel, next_n: n, next_unit: unit, departures } };
}

/** Write one answer key from the office, safely beside the phone's own writes (the rev must not have moved under it). */
async function setOfficeAnswer(db: Db, id: string, key: string, a: Answer): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const now = await readAssignment(db, id);
    if (!now) return false;
    const answers = { ...now.answers, [key]: a };
    const { data } = await db
      .from('site_assignments')
      .update({ answers, rev: now.rev + 1, answers_saved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('rev', now.rev)
      .select('id');
    if (data?.length) return true;
  }
  return false;
}

export async function signDesign(db: Db, a: AssignmentRow, b: DesignInput, staff: { id: string; name: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (a.trade !== 'electrician') return { ok: false, status: 400, error: 'Only an electrician’s certificate has a design part.' };
  if (a.status === 'cancelled') return { ok: false, status: 409, error: 'This electrician was taken off the job.' };
  const c = cleanDesign(b);
  if (!c.ok) return { ok: false, status: 400, error: c.error };
  if (!validSignature(b.signature)) return { ok: false, status: 400, error: 'Draw the signature to sign.' };
  await ensureDocsBucket();
  const signedAt = new Date().toISOString();
  const path = `signatures/${a.project_id}/eic-design-${a.id}-${Date.parse(signedAt)}.png`;
  const png = Buffer.from(String(b.signature).split(',')[1] ?? '', 'base64');
  const up = await db.storage.from(DOCS_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
  if (up.error) return { ok: false, status: 503, error: 'The signature didn’t save. Try again.' };
  const v: DesignSign = { ...c.v, signed_at: signedAt, path, by: staff.id };
  if (!(await setOfficeAnswer(db, a.id, 'eic_design', { v, src: 'typed', at: signedAt, dev: `office:${staff.id}` }))) {
    await db.storage.from(DOCS_BUCKET).remove([path]).catch(() => null);
    return { ok: false, status: 409, error: 'The electrician’s phone is sending right now. Try again in a moment.' };
  }
  await logSiteEvent(db, a.id, staff.name, 'eic_design_signed', { name: v.name, next: `${v.next_n} ${v.next_unit}`, departures: v.departures });
  await logJob(db, a.project_id, `EIC design part signed by ${v.name} (next inspection within ${v.next_n} ${v.next_unit})`, { assignment: a.id }, staff.id);
  await saveCertificate(db, a.id, staff.id);
  return { ok: true };
}
