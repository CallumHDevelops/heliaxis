import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { toWaId } from '@/lib/whatsapp/shared';
import { grantPermission } from '@/lib/whatsapp/permission';
import { guessProducts } from './stages';
import { aliasCustomer } from './aliases';

/**
 * Bringing in people from before the CRM: old Meta lead-form leads, chats exported from the
 * WhatsApp Business app. Unlike a live enquiry (ingestLead / ensureOpportunity) nothing here
 * notifies anyone, messages the customer, rotates the lead to someone or starts the follow-up
 * sequence: the enquiry, its opportunity and its timeline all keep their original dates, and the
 * opportunity is marked so the speed-to-lead alert and follow-ups never pick it up.
 */

export type ExistingEnquiry = {
  id: string;
  name: string;
  meta_lead_id: string | null;
  wa_id: string | null;
  /** Found by what a merge kept on them (src/lib/crm/merge.ts): their old Meta lead id, another number or email. */
  viaAlias?: 'meta_lead' | 'phone' | 'email';
};

/** Same person already in the CRM? By Meta lead id, then phone (any format), then email, then what a merge kept on them. */
export async function findExistingEnquiry(p: {
  metaLeadId?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<ExistingEnquiry | null> {
  const db = createAdminClient();
  const cols = 'id, name, phone, email, meta_lead_id, wa_id';
  type Row = ExistingEnquiry & { phone: string | null; email: string | null };

  if (p.metaLeadId) {
    const { data } = await db.from('enquiries').select(cols).eq('meta_lead_id', p.metaLeadId).limit(1);
    if (data?.length) return data[0] as Row;
  }
  const wa = toWaId(p.phone);
  if (wa) {
    // Phones are stored as typed (07…, +44 …), so narrow by the last 9 digits, then compare properly.
    const tail = wa.slice(-9);
    const { data } = await db.from('enquiries').select(cols).or(`wa_id.eq.${wa},phone.ilike.%${tail.slice(0, 3)}%${tail.slice(3, 6)}%${tail.slice(6)}%`).limit(50);
    const hit = ((data ?? []) as Row[]).find((r) => r.wa_id === wa || toWaId(r.phone) === wa);
    if (hit) return hit;
  }
  const email = p.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Ignoring case, with LIKE's wildcards escaped (PostgREST reads * as %, so that's one character),
    // then compare properly: sam_jones@ mustn't match sam.jones@.
    const like = email.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
    const { data } = await db.from('enquiries').select(cols).ilike('email', like).limit(20);
    const hit = ((data ?? []) as Row[]).find((r) => r.email?.trim().toLowerCase() === email);
    if (hit) return hit;
  }
  const alias = await aliasCustomer(p, db);
  if (alias) {
    const { data } = await db.from('enquiries').select(cols).eq('id', alias.enquiry_id).maybeSingle();
    if (data) return { ...(data as Row), viaAlias: alias.via };
  }
  return null;
}

export type ImportedEnquiryInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  postcode?: string | null;
  interest?: string | null;
  /** e.g. 'meta: Solar Oct ad' or 'whatsapp-import'. */
  source: string;
  /** When they first got in touch (ISO). */
  createdAt: string;
  metaLeadId?: string | null;
  whatsappOptIn?: boolean;
  /** 'contacted' when we've already spoken to them (e.g. a WhatsApp chat with our replies in it). */
  status?: 'new' | 'contacted';
  /** When we first replied, if known (ISO). */
  firstContactAt?: string | null;
  /** First line on their timeline, e.g. 'Imported from Meta lead form “Solar quote”'. */
  activity: string;
  byId?: string | null;
};

let quietReady = false;

/**
 * The crm-v2.sql columns that keep an imported opportunity out of the alerts and follow-ups. That
 * migration adds them empty, so an opportunity saved without them would look like a live lead once
 * it's run. (No CRM tables at all is fine: nothing would pick it up.)
 */
async function checkQuietColumns() {
  if (quietReady) return;
  const { error } = await createAdminClient().from('crm_projects').select('first_response_alerted_at, sequence_stopped_at, first_contact_at').limit(1);
  if (error && /column/i.test(error.message)) throw new Error('Run supabase/crm-v2.sql in Supabase first, so imported people aren’t sent follow-ups.');
  quietReady = !error;
}

/** Add someone from the past: enquiry + opportunity + timeline line, all at their original date. */
export async function createImportedEnquiry(e: ImportedEnquiryInput): Promise<{ id: string; projectId: string | null }> {
  await checkQuietColumns();
  const db = createAdminClient();
  const at = new Date(e.createdAt);
  const when = Number.isFinite(at.getTime()) && at.getTime() <= Date.now() ? at.toISOString() : new Date().toISOString();
  const stage = e.status === 'contacted' ? 'contacted' : 'lead';

  const { data: row, error } = await db
    .from('enquiries')
    .insert({
      name: e.name.trim().slice(0, 200) || 'Unknown',
      email: e.email?.trim().slice(0, 200) || '',
      phone: e.phone?.trim().slice(0, 40) || null,
      postcode: e.postcode?.trim().toUpperCase().slice(0, 12) || null,
      interest: e.interest?.slice(0, 2000) || null,
      source: e.source.slice(0, 120),
      status: e.status ?? 'new',
      meta_lead_id: e.metaLeadId || null,
      wa_id: toWaId(e.phone),
      whatsapp_opt_in: !!e.whatsappOptIn,
      created_at: when,
    })
    .select('id, name, postcode, interest')
    .single();
  if (error || !row) throw new Error(error?.message || 'Could not add the enquiry');
  // How they agreed to WhatsApp (crm-v3.sql columns, a separate step that can't lose the enquiry).
  if (e.whatsappOptIn) await grantPermission(row.id as string, 'import', { at: when });

  const projectId = await addImportedOpportunity(row, { stage, when, firstContactAt: e.firstContactAt ?? null });
  await db.from('crm_activities').insert({
    enquiry_id: row.id,
    project_id: projectId,
    kind: 'system',
    body: e.activity,
    by_id: e.byId ?? null,
    at: when,
  });
  return { id: row.id as string, projectId };
}

async function addImportedOpportunity(
  e: { id: string; name: string; postcode: string | null; interest: string | null },
  o: { stage: 'lead' | 'contacted'; when: string; firstContactAt: string | null }
): Promise<string | null> {
  const db = createAdminClient();
  const base = {
    enquiry_id: e.id,
    title: `${e.name}${e.postcode ? ` · ${e.postcode}` : ''}`,
    stage: o.stage,
    postcode: e.postcode,
    products: guessProducts(e.interest),
    created_at: o.when,
    updated_at: o.when,
    stage_changed_at: o.when,
  };
  const now = new Date().toISOString();
  // Already handled: no "hasn't been contacted" alert, no follow-up sequence (crm-v2.sql columns,
  // checked by checkQuietColumns).
  const quiet = { first_response_alerted_at: now, sequence_stopped_at: now, first_contact_at: o.firstContactAt };
  const { data, error } = await db.from('crm_projects').insert({ ...base, ...quiet }).select('id').single();
  return error ? null : ((data?.id as string) ?? null);
}

/** Opportunity for an enquiry that's already in the CRM (null if it has none). */
export async function opportunityFor(enquiryId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('crm_projects').select('id').eq('enquiry_id', enquiryId).limit(1);
  return (data?.[0]?.id as string) ?? null;
}

/**
 * Are crm.sql and crm-v2.sql in? Without them an import can't mark its opportunities as handled,
 * and once they're run the new-lead alert and follow-ups would treat old leads as new ones.
 */
export async function importReady(): Promise<boolean> {
  const db = createAdminClient();
  const [projects, activities] = await Promise.all([
    db.from('crm_projects').select('id, first_contact_at, first_response_alerted_at, sequence_stopped_at', { head: true }).limit(1),
    db.from('crm_activities').select('id', { head: true }).limit(1),
  ]);
  return !projects.error && !activities.error;
}
