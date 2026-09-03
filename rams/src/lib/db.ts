import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { normaliseContent } from '@/lib/content/defaults';
import type {
  Briefing,
  Certification,
  CompanySettings,
  Profile,
  Project,
  ProjectFile,
  RamsDocument,
  ShareLink,
} from '@/lib/types';

// --- Company ---------------------------------------------------------------

export async function getCompany(): Promise<CompanySettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('company_settings').select('*').eq('id', 1).single();
  return (data as CompanySettings | null) ?? null;
}

// --- Profiles --------------------------------------------------------------

export async function listProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });
  return (data as Profile[]) ?? [];
}

export async function listApprovedProfiles(): Promise<Profile[]> {
  return (await listProfiles()).filter((p) => p.status === 'approved');
}

// --- Certifications --------------------------------------------------------

export async function listCertifications(): Promise<Certification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('certifications')
    .select('*')
    .order('expiry_date', { ascending: true, nullsFirst: false });
  return (data as Certification[]) ?? [];
}

export async function getCertifications(ids: string[]): Promise<Certification[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('certifications').select('*').in('id', ids);
  return (data as Certification[]) ?? [];
}

// --- Projects --------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Project[]) ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  return (data as Project | null) ?? null;
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return (data as ProjectFile[]) ?? [];
}

// --- RAMS ------------------------------------------------------------------

function hydrate(row: Record<string, unknown>): RamsDocument {
  const doc = row as unknown as RamsDocument;
  return { ...doc, content: normaliseContent(doc.content, doc.technology, doc.sector) };
}

export async function listRams(projectId?: string): Promise<RamsDocument[]> {
  const supabase = await createClient();
  let query = supabase.from('rams_documents').select('*');
  if (projectId) query = query.eq('project_id', projectId);
  const { data } = await query.order('updated_at', { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map(hydrate);
}

export async function getRams(id: string): Promise<RamsDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('rams_documents').select('*').eq('id', id).maybeSingle();
  return data ? hydrate(data as Record<string, unknown>) : null;
}

/** RAMS rows joined to their project, for the index list. */
export async function listRamsWithProjects(): Promise<
  (RamsDocument & { project: Pick<Project, 'id' | 'reference' | 'name' | 'site_postcode'> | null })[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rams_documents')
    .select('*, project:projects(id, reference, name, site_postcode)')
    .order('updated_at', { ascending: false });

  return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
    ...hydrate(row),
    project: (row.project as Project | null) ?? null,
  }));
}

export async function listShareLinks(ramsId: string): Promise<ShareLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('share_links')
    .select('*')
    .eq('rams_id', ramsId)
    .order('created_at', { ascending: false });
  return (data as ShareLink[]) ?? [];
}

export async function listBriefings(ramsId: string): Promise<Briefing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rams_briefings')
    .select('*')
    .eq('rams_id', ramsId)
    .order('created_at', { ascending: true });
  return (data as Briefing[]) ?? [];
}

// --- Storage ---------------------------------------------------------------

/** Short-lived signed URL for a private storage object. */
export async function signedUrl(
  bucket: string,
  path: string,
  seconds = 600
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
