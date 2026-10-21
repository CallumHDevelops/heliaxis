import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanAssignment, vatFor } from '@/lib/site/assign';
import { isElectricianForm } from '@/lib/site/forms';
import { livePo, refreshDraftPo } from '@/lib/site/labour-po';
import { reviewOf } from '@/lib/site/review';
import { getSiteSettings } from '@/lib/site/settings';
import { firmsById, logJob, logSiteEvent, moneyFacts, notReady, readAssignment, siteReady, siteTabData, type ContactRow } from '@/lib/site/server';
import { TRADE_LABEL } from '@/lib/site/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The review drawer (D4): answers by step, photos, reads, the sign-off evidence, the PO and documents, the history. */
export async function GET(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const review = await reviewOf(createAdminClient(), id);
  return review ? json(review) : json({ error: 'That trade isn’t on the job any more.' }, 404);
}

/** What decides the PO: fixed once the trade has signed off (the office reopens the sign-off to change it). */
const MONEY = ['rate_pence', 'rate_basis', 'rate_qty', 'raise_po', 'vat_treatment', 'vat_note', 'cis_override'];

/**
 * Change a trade on the job: scope, dates, the agreed rate, basis and quantity, VAT, CIS for this job,
 * whether a PO is raised, the note to the trade, sharing the customer's phone, and (electricians)
 * the paperwork ticks and certificate route. Replies with the Site tab.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'cancelled') return json({ error: 'This trade was cancelled.' }, 409);
  const signed = a.status === 'signed' || a.status === 'done';
  // Signed off: the money can still be put right while the PO waits for the office; once it has
  // gone, reopen the sign-off to change it.
  if (signed && MONEY.some((k) => k in b)) {
    const po = await livePo(db, a.id);
    if (po && (po.status !== 'draft' || (po.labour?.version ?? 0) > 0)) return json({ error: 'The PO has gone, so the rate is fixed. Reopen the sign-off to change it.' }, 409);
  }

  const clean = cleanAssignment(b, true, a);
  if (!clean.ok) return json({ error: clean.error }, 400);
  const u: Record<string, unknown> = { ...clean.fields, updated_at: new Date().toISOString() };
  delete u.trade; // the trade itself never changes: cancel and add the right one

  if ('vat_treatment' in b || 'vat_note' in b) {
    const { data: c } = await db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle();
    const contact = c as ContactRow | null;
    const firm = contact?.subcontractor_id ? ((await firmsById(db, [contact.subcontractor_id])).get(contact.subcontractor_id) ?? null) : null;
    const facts = moneyFacts(contact ?? { vat_number: null, cis_rate: null, cis_verified_on: null }, firm);
    if ('vat_treatment' in b) {
      const vat = vatFor(facts.vatRegistered, b.vat_treatment, (await getSiteSettings()).vatDefault);
      if (!vat.ok) return json({ error: vat.error }, 422);
      u.vat_treatment = vat.value;
    }
    if ('vat_note' in b) u.vat_note = String(b.vat_note ?? '').trim().slice(0, 200) || null;
  }
  if ('forms' in b) {
    if (a.trade !== 'electrician') return json({ error: 'Only the electrician has paperwork to choose.' }, 400);
    u.forms = (Array.isArray(b.forms) ? b.forms : []).filter(isElectricianForm);
  }

  const { error } = await db.from('site_assignments').update(u).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  const changed = Object.keys(u).filter((k) => k !== 'updated_at');
  await logSiteEvent(db, id, s.user.email ?? s.user.id, 'edited', { fields: changed });
  if (signed && changed.some((k) => MONEY.includes(k))) {
    const now = await readAssignment(db, id);
    if (now) await refreshDraftPo(db, now);
  }
  return json(await siteTabData(db, a.project_id));
}

/** Cancel a trade on the job: its link stops working straight away. Not once it's signed off (reopen it, or cancel its PO in Orders). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'signed' || a.status === 'done') return json({ error: 'It’s signed off. Reopen it first, or cancel its PO in Orders.' }, 409);
  if (a.status !== 'cancelled') {
    const now = new Date().toISOString();
    const { error } = await db.from('site_assignments').update({ status: 'cancelled', cancelled_at: now, link_hash: null, updated_at: now }).eq('id', id);
    if (error) return json({ error: error.message }, 500);
    // Messages still waiting to go are stopped too.
    await db.from('site_messages').update({ status: 'cancelled' }).eq('assignment_id', id).eq('status', 'queued');
    await logSiteEvent(db, id, s.user.email ?? s.user.id, 'cancelled', null);
    const { data: c } = await db.from('site_contacts').select('name').eq('id', a.contact_id).maybeSingle();
    await logJob(db, a.project_id, `${c?.name ?? 'Trade'} (${a.trade === 'other' ? a.trade_label || 'other trade' : TRADE_LABEL[a.trade].toLowerCase()}) taken off the job`, { assignment: id }, s.user.id);
  }
  return json(await siteTabData(db, a.project_id));
}
