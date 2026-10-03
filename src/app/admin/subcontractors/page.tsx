import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { compliance } from '@/lib/subcontractors/documents';
import { SUB_COLUMNS, type DocumentRow, type SubcontractorRow } from '@/lib/subcontractors/types';
import { SubcontractorsList, type ListRow } from './SubcontractorsList';
import './subcontractors.css';

export const dynamic = 'force-dynamic';

export default async function SubcontractorsPage() {
  const { profile } = await getSessionProfile();
  const admin = createAdminClient();
  const [{ data: subs, error }, { data: docs }] = await Promise.all([
    admin.from('subcontractors').select(SUB_COLUMNS).order('created_at', { ascending: false }),
    admin
      .from('subcontractor_documents')
      .select('id, subcontractor_id, category, label, operative_name, expires_on, status, uploaded_at'),
  ]);

  const bySub = new Map<string, DocumentRow[]>();
  for (const d of (docs ?? []) as DocumentRow[]) {
    bySub.set(d.subcontractor_id, [...(bySub.get(d.subcontractor_id) ?? []), d]);
  }

  const rows: ListRow[] = ((subs ?? []) as SubcontractorRow[]).map((s) => {
    const c = compliance(s.details || {}, bySub.get(s.id) ?? []);
    return {
      id: s.id,
      ref: s.ref,
      companyName: s.company_name,
      contactName: s.contact_name,
      email: s.email,
      trade: s.trade,
      status: s.status,
      invitedAt: s.invited_at,
      lastSeenAt: s.last_seen_at,
      docCount: bySub.get(s.id)?.length ?? 0,
      missing: c.missing,
      expired: c.expired.length,
      expiring: c.expiring.length,
      pendingReview: c.pendingReview,
    };
  });

  return (
    <AdminShell active="subcontractors" isAdmin={profile?.role === 'admin'}>
      {error ? (
        <div className="sc-page">
          <h1>Subcontractors</h1>
          <p className="sc-error">
            Couldn&apos;t load subcontractors ({error.message}). If this is the first run, apply{' '}
            <code>supabase/subcontractors.sql</code> in the Supabase SQL editor.
          </p>
        </div>
      ) : (
        <SubcontractorsList rows={rows} />
      )}
    </AdminShell>
  );
}
