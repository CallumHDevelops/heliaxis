import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY, safeFileName } from './documents';
import { DOCS_BUCKET, logEvent } from './server';
import type { DocumentRow, SubcontractorRow } from './types';

/**
 * Pushes subcontractors from this portal into the RAMS app (rams.heliaxis.co.uk),
 * which is a separate Supabase project. RAMS then lets staff name a firm on a
 * RAMS document, which freezes a copy of their cover and cards onto it.
 *
 * Direction is one-way: the portal is the source of truth for who a firm is and
 * what they've uploaded; RAMS only reads. Only documents Heliaxis has APPROVED
 * are sent, and only the kinds RAMS has a home for — insurance (company cover)
 * and cards / qualifications (held by a named operative). Photo ID never leaves
 * this database: RAMS documents can be shared with clients by link.
 *
 * Needs RAMS_SUPABASE_URL + RAMS_SUPABASE_SERVICE_ROLE_KEY. Without them sync is
 * simply off. The shapes written here are the contract the RAMS schema
 * (sections 3B / 7A) and its UI expect — keep them in step.
 */

const RAMS_INSURANCE_BUCKET = 'subcontractor-docs';
const RAMS_CERT_BUCKET = 'certifications';
/** RAMS buckets cap files at 15 MB; the portal upload limit matches. */
const RAMS_MAX_BYTES = 15 * 1024 * 1024;

const INSURANCE_KIND: Record<string, string> = {
  insurance_pl: 'public_liability',
  insurance_el: 'employers_liability',
  insurance_pi: 'professional_indemnity',
  insurance_tools: 'other',
};
const COMPETENCY_CATEGORY: Record<string, string> = {
  card: 'card',
  qualification: 'qualification',
};

export function ramsConfigured() {
  return !!(process.env.RAMS_SUPABASE_URL && process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY);
}

export function ramsAppUrl() {
  return (process.env.RAMS_APP_URL || 'https://rams.heliaxis.co.uk').replace(/\/$/, '');
}

function ramsClient(): SupabaseClient {
  return createClient(process.env.RAMS_SUPABASE_URL!, process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** "£2,000,000", "2m", "5 million", "500k" → whole pounds. */
export function parseCover(raw: string | null | undefined): number | null {
  const s = (raw || '').toLowerCase().replace(/[£,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(m|million|k|thousand)?/);
  if (!m) return null;
  const mult = m[2]?.startsWith('m') ? 1_000_000 : m[2] ? 1_000 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function postcodeOf(address: string | undefined) {
  return address?.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)?.[1]?.toUpperCase() ?? null;
}

function ramsStatus(sub: SubcontractorRow): { status: string; archived: boolean } {
  switch (sub.status) {
    case 'active':
      return { status: 'approved', archived: false };
    case 'suspended':
      return { status: 'suspended', archived: false };
    case 'terminated':
      return { status: 'suspended', archived: true };
    default:
      // Not countersigned yet: visible in RAMS as an application, but the RAMS
      // naming function refuses anything that isn't approved.
      return { status: 'applied', archived: false };
  }
}

type SyncResult = { ok: true; copied: number; removed: number; skipped: string[] } | { ok: false; error: string };

/** Remove a document's RAMS row (not the file — an issued RAMS may cite it). */
async function unsyncRow(rams: SupabaseClient, doc: Pick<DocumentRow, 'id'> & RamsDocFields) {
  if (!doc.rams_table || !doc.rams_row_id) return false;
  if (doc.rams_table !== 'subcontractor_insurances' && doc.rams_table !== 'certifications') return false;
  const { error } = await rams.from(doc.rams_table).delete().eq('id', doc.rams_row_id);
  if (error) throw new Error(`RAMS: could not remove ${doc.rams_table} row (${error.message})`);
  return true;
}

type RamsDocFields = { rams_table?: string | null; rams_row_id?: string | null; rams_path?: string | null };

/** Called before a portal document is deleted, so RAMS stops listing it as held. */
export async function unsyncDocument(doc: DocumentRow & RamsDocFields) {
  if (!ramsConfigured() || !doc.rams_row_id) return;
  try {
    await unsyncRow(ramsClient(), doc);
  } catch (e) {
    console.error('[rams-sync] unsync failed', e);
  }
}

export async function syncSubcontractorToRams(subId: string, actor = 'system'): Promise<SyncResult> {
  if (!ramsConfigured()) return { ok: false, error: 'RAMS is not connected (RAMS_SUPABASE_URL / RAMS_SUPABASE_SERVICE_ROLE_KEY not set).' };

  const admin = createAdminClient();
  const rams = ramsClient();
  const { data: subData, error: subErr } = await admin.from('subcontractors').select('*').eq('id', subId).single();
  if (subErr || !subData) return { ok: false, error: subErr?.message || 'Subcontractor not found' };
  const sub = subData as SubcontractorRow & { rams_id?: string | null };
  if (!('rams_id' in sub)) {
    return { ok: false, error: 'Run supabase/rams-sync.sql in the Heliaxis Supabase project first.' };
  }

  const fail = async (error: string): Promise<SyncResult> => {
    await admin.from('subcontractors').update({ rams_sync_error: error.slice(0, 500) }).eq('id', subId);
    await logEvent(subId, actor, 'rams_sync_failed', { error });
    return { ok: false, error };
  };

  try {
    const d = sub.details || {};
    const { status, archived } = ramsStatus(sub);
    const row = {
      company_name: sub.company_name,
      trading_name: d.legalName && d.legalName !== sub.company_name ? d.legalName : null,
      contact_name: d.primaryContact || sub.contact_name,
      email: sub.email,
      phone: d.phone || sub.phone,
      address: d.registeredAddress || null,
      postcode: postcodeOf(d.registeredAddress),
      reg_number: d.companyNumber || null,
      vat_number: d.vatNumber || null,
      cis_number: d.cisNumber || null,
      trades: sub.trade,
      status,
      archived_at: archived ? new Date().toISOString() : null,
      source: 'portal',
      notes: `Synced from Heliaxis portal ${sub.ref}. Managed at heliaxis.co.uk/admin/subcontractors.`,
      updated_at: new Date().toISOString(),
    };

    // ---- the firm ----
    let ramsId = sub.rams_id ?? null;
    if (ramsId) {
      const { data: existing } = await rams.from('subcontractors').select('id, status, approved_at').eq('id', ramsId).maybeSingle();
      if (!existing) ramsId = null; // deleted on the RAMS side — recreate
      else {
        const approvedAt = status === 'approved' ? existing.approved_at || new Date().toISOString() : existing.approved_at;
        const { error } = await rams.from('subcontractors').update({ ...row, approved_at: approvedAt }).eq('id', ramsId);
        if (error) throw new Error(`RAMS subcontractor update: ${error.message}`);
      }
    }
    if (!ramsId) {
      const { data, error } = await rams
        .from('subcontractors')
        .insert({ ...row, approved_at: status === 'approved' ? new Date().toISOString() : null })
        .select('id')
        .single();
      if (error || !data) throw new Error(`RAMS subcontractor insert: ${error?.message}`);
      ramsId = data.id as string;
    }
    await admin.from('subcontractors').update({ rams_id: ramsId }).eq('id', subId);

    // ---- documents ----
    const { data: docData } = await admin.from('subcontractor_documents').select('*').eq('subcontractor_id', subId);
    const docs = (docData ?? []) as (DocumentRow & RamsDocFields)[];

    // Rejected (or un-approved) since it was sent: RAMS must stop showing it as held.
    let removed = 0;
    for (const doc of docs.filter((x) => x.status !== 'approved' && x.rams_row_id)) {
      if (await unsyncRow(rams, doc)) removed++;
      await admin
        .from('subcontractor_documents')
        .update({ rams_table: null, rams_row_id: null, rams_path: null, rams_synced_at: null })
        .eq('id', doc.id);
    }

    // ---- operatives (people the firm sends) ----
    const wanted = new Map<string, string>(); // lower(name) → name
    for (const n of (d.operatives || '').split('\n')) if (n.trim()) wanted.set(n.trim().toLowerCase(), n.trim());
    for (const doc of docs)
      if (doc.status === 'approved' && COMPETENCY_CATEGORY[doc.category] && doc.operative_name?.trim())
        wanted.set(doc.operative_name.trim().toLowerCase(), doc.operative_name.trim());

    const { data: opData, error: opErr } = await rams
      .from('operatives')
      .select('id, full_name')
      .eq('subcontractor_id', ramsId);
    if (opErr) throw new Error(`RAMS operatives: ${opErr.message}`);
    const opIds = new Map<string, string>((opData ?? []).map((o) => [String(o.full_name).trim().toLowerCase(), o.id as string]));
    for (const [key, name] of wanted) {
      if (opIds.has(key)) continue;
      const { data, error } = await rams
        .from('operatives')
        .insert({
          full_name: name,
          employer: sub.company_name,
          subcontractor_id: ramsId,
          notes: `Operative for ${sub.company_name} (Heliaxis portal ${sub.ref}).`,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`RAMS operative ${name}: ${error?.message}`);
      opIds.set(key, data.id as string);
    }

    // ---- approved documents not yet in RAMS ----
    let copied = 0;
    const skipped: string[] = [];
    for (const doc of docs.filter((x) => x.status === 'approved' && !x.rams_row_id)) {
      const kind = INSURANCE_KIND[doc.category];
      const certCategory = COMPETENCY_CATEGORY[doc.category];
      if (!kind && !certCategory) continue; // photo ID, registrations, RAMS, other — stay here
      const label = doc.label || CATEGORY_BY_KEY[doc.category]?.label || doc.file_name;

      if ((doc.size_bytes ?? 0) > RAMS_MAX_BYTES) {
        skipped.push(`${label}: over 15 MB`);
        continue;
      }
      const { data: blob, error: dlErr } = await admin.storage.from(DOCS_BUCKET).download(doc.storage_path);
      if (dlErr || !blob) {
        skipped.push(`${label}: file missing`);
        continue;
      }

      const bucket = kind ? RAMS_INSURANCE_BUCKET : RAMS_CERT_BUCKET;
      const path = `${kind ? '' : 'subcontractors/'}${ramsId}/${doc.id}-${safeFileName(doc.file_name)}`;
      const { error: upErr } = await rams.storage
        .from(bucket)
        .upload(path, blob, { contentType: doc.mime || blob.type || 'application/pdf', upsert: true });
      if (upErr) {
        skipped.push(`${label}: ${upErr.message}`);
        continue;
      }

      let table: string;
      let inserted: { id: string } | null = null;
      if (kind) {
        table = 'subcontractor_insurances';
        const { data, error } = await rams
          .from(table)
          .insert({
            subcontractor_id: ramsId,
            kind,
            policy_number: doc.reference,
            cover_amount: parseCover(doc.cover_amount),
            expiry_date: doc.expires_on,
            file_path: path,
            file_name: doc.file_name,
            notes: kind === 'other' ? `Tools & equipment${doc.label ? ` — ${doc.label}` : ''}` : doc.label,
          })
          .select('id')
          .single();
        if (error) throw new Error(`RAMS insurance ${label}: ${error.message}`);
        inserted = data as { id: string };
      } else {
        table = 'certifications';
        const holder = doc.operative_name?.trim() || sub.contact_name;
        const { data, error } = await rams
          .from(table)
          .insert({
            owner_type: 'user',
            holder_name: holder,
            operative_id: opIds.get(holder.toLowerCase()) ?? null,
            title: label,
            category: certCategory,
            reference: doc.reference,
            expiry_date: doc.expires_on,
            file_path: path,
            file_name: doc.file_name,
            notes: `From Heliaxis subcontractor portal (${sub.company_name}, ${sub.ref}).`,
          })
          .select('id')
          .single();
        if (error) throw new Error(`RAMS certification ${label}: ${error.message}`);
        inserted = data as { id: string };
      }

      await admin
        .from('subcontractor_documents')
        .update({ rams_table: table, rams_row_id: inserted!.id, rams_path: path, rams_synced_at: new Date().toISOString() })
        .eq('id', doc.id);
      copied++;
    }

    await admin
      .from('subcontractors')
      .update({ rams_synced_at: new Date().toISOString(), rams_sync_error: skipped.length ? `Not copied: ${skipped.join('; ')}`.slice(0, 500) : null })
      .eq('id', subId);
    await logEvent(subId, actor, 'rams_synced', { copied, removed, skipped: skipped.length ? skipped : undefined });
    return { ok: true, copied, removed, skipped };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Fire-and-record: never lets a RAMS problem break the portal action that
 * triggered it (the error is stored on the record and shown in admin). Firms
 * are only sent once countersigned — invites in progress would just be clutter
 * in RAMS — and kept in step after that, including suspension / termination.
 */
export async function syncQuietly(subId: string, actor: string) {
  if (!ramsConfigured()) return;
  try {
    const { data } = await createAdminClient().from('subcontractors').select('*').eq('id', subId).maybeSingle();
    const sub = data as (SubcontractorRow & { rams_id?: string | null }) | null;
    if (!sub || (sub.status !== 'active' && !sub.rams_id)) return;
    await syncSubcontractorToRams(subId, actor);
  } catch (e) {
    console.error('[rams-sync]', e);
  }
}
