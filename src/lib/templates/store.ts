import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addressLines } from '@/lib/handover/facts';
import type { JobHead } from '@/lib/handover/inputs';
import type { FormRow, FormStore } from './forms';

/** The forms' storage in the database (supabase/template-documents.sql). The rules are in forms.ts. */
export function supabaseStore(db: SupabaseClient): FormStore {
  const T = 'template_documents';
  return {
    async live(projectId, code) {
      const { data } = await db.from(T).select('*').eq('project_id', projectId).eq('template_code', code).neq('status', 'superseded').maybeSingle();
      return (data as FormRow | null) ?? null;
    },
    async insert(r) {
      const { data, error } = await db.from(T).insert({ project_id: r.project_id, template_code: r.template_code, issue: r.issue, created_by: r.created_by, updated_by: r.created_by }).select('*').single();
      if (error) {
        if (error.code === '23505') return 'exists';
        throw new Error(error.message);
      }
      return data as FormRow;
    },
    async update(id, seen, patch, by) {
      const { data, error } = await db.from(T).update({ ...patch, updated_by: by }).eq('id', id).eq('updated_at', seen).select('*');
      if (error) throw new Error(error.message);
      return (data?.[0] as FormRow | undefined) ?? null;
    },
    async revise(id, by) {
      const { data, error } = await db.rpc('revise_template_document', { p_id: id, p_by: by });
      if (error) throw new Error(error.message);
      return String(data);
    },
    async get(id) {
      const { data } = await db.from(T).select('*').eq('id', id).maybeSingle();
      return (data as FormRow | null) ?? null;
    },
  };
}

let ready = false;
/** Has supabase/template-documents.sql been run? (The code copes with it not having been, like the other tables.) */
export async function formsReady(db: SupabaseClient): Promise<boolean> {
  if (ready) return true;
  const { error } = await db.from('template_documents').select('id').limit(1);
  if (error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message))) return false;
  ready = true;
  return true;
}

/** The job's details a document is headed with: its reference, the customer and the site. */
export async function jobHeadFor(db: SupabaseClient, projectId: string, variant?: 'digital' | 'print'): Promise<JobHead | null> {
  const { data: p } = await db.from('crm_projects').select('project_ref, address, postcode, enquiry_id').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const { data: c } = await db.from('enquiries').select('name, postcode').eq('id', p.enquiry_id).maybeSingle();
  const postcode = (p.postcode as string | null) ?? (c?.postcode as string | null) ?? null;
  return {
    ref: (p.project_ref as string | null) ?? null,
    issued: new Date().toISOString().slice(0, 10),
    customer: (c?.name as string | null) ?? '–',
    address: addressLines((p.address as string | null) ?? null, postcode),
    postcode,
    variant,
  };
}
