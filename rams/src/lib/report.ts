import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportData } from '@/components/report/RamsReport';
import { normaliseContent } from '@/lib/content/defaults';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Briefing, Certification, CompanySettings, Profile, Project, RamsDocument } from '@/lib/types';

/**
 * Assemble everything the report renders. Parameterised by client so the same
 * loader serves an authenticated print view (anon client, RLS enforced) and an
 * anonymous share view (service-role client, after the token has been proven).
 */
async function load(supabase: SupabaseClient, ramsId: string): Promise<ReportData | null> {
  const { data: row } = await supabase
    .from('rams_documents')
    .select('*')
    .eq('id', ramsId)
    .maybeSingle();
  if (!row) return null;

  const doc = row as unknown as RamsDocument;
  doc.content = normaliseContent(doc.content, doc.technology, doc.sector);

  const certIds = doc.content.attachedCertificationIds ?? [];
  const operativeIds = doc.content.operativeIds ?? [];
  const profileIds = [...new Set([...operativeIds, doc.author_id, doc.approved_by].filter(Boolean))] as string[];

  const [projectRes, companyRes, certRes, profileRes, briefingRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', doc.project_id).maybeSingle(),
    supabase.from('company_settings').select('*').eq('id', 1).maybeSingle(),
    certIds.length
      ? supabase.from('certifications').select('*').in('id', certIds)
      : Promise.resolve({ data: [] as Certification[] }),
    profileIds.length
      ? supabase.from('profiles').select('*').in('id', profileIds)
      : Promise.resolve({ data: [] as Profile[] }),
    supabase
      .from('rams_briefings')
      .select('*')
      .eq('rams_id', ramsId)
      .order('created_at', { ascending: true }),
  ]);

  const profiles = (profileRes.data as Profile[]) ?? [];
  const certifications = (certRes.data as Certification[]) ?? [];

  return {
    doc,
    project: (projectRes.data as Project | null) ?? null,
    company: (companyRes.data as CompanySettings | null) ?? null,
    // Keep the author's ordering rather than whatever the database returns.
    certifications: certIds
      .map((id) => certifications.find((c) => c.id === id))
      .filter((c): c is Certification => !!c),
    operatives: operativeIds
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is Profile => !!p),
    briefings: ((briefingRes.data as Briefing[]) ?? []),
    author: profiles.find((p) => p.id === doc.author_id) ?? null,
    approver: profiles.find((p) => p.id === doc.approved_by) ?? null,
  };
}

/** For signed-in staff. RLS decides what they can see. */
export async function loadReport(ramsId: string): Promise<ReportData | null> {
  return load(await createClient(), ramsId);
}

/**
 * For an anonymous holder of a valid share token. Only call once
 * resolveShareToken has confirmed the link is live — this bypasses RLS.
 */
export async function loadSharedReport(ramsId: string): Promise<ReportData | null> {
  return load(createAdminClient(), ramsId);
}
