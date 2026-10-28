import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** The people linked to a job besides its customer (supabase/job-people.sql). */
export type JobPerson = { contact_id: string; role: string | null; name: string; mobile: string | null; email: string | null; organisation: string | null };

/** Null until job-people.sql has run. */
export async function listJobPeople(projectId: string): Promise<JobPerson[] | null> {
  const db = createAdminClient();
  const { data: links, error } = await db.from('crm_project_contacts').select('contact_id, role, created_at').eq('project_id', projectId).order('created_at');
  if (error) return null;
  const ids = (links ?? []).map((l) => l.contact_id as string);
  if (!ids.length) return [];
  const { data: people } = await db.from('crm_contacts').select('id, name, mobile, email, organisation_id').in('id', ids);
  const orgIds = [...new Set((people ?? []).map((p) => p.organisation_id as string | null).filter(Boolean) as string[])];
  const { data: orgs } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] };
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
  const byId = new Map((people ?? []).map((p) => [p.id as string, p]));
  return (links ?? []).flatMap((l) => {
    const p = byId.get(l.contact_id as string);
    return p ? [{ contact_id: p.id as string, role: (l.role as string | null) ?? null, name: p.name as string, mobile: (p.mobile as string | null) ?? null, email: (p.email as string | null) ?? null, organisation: p.organisation_id ? (orgName.get(p.organisation_id as string) ?? null) : null }] : [];
  });
}

export const cleanRole = (v: unknown) => String(v ?? '').trim().slice(0, 60) || null;
