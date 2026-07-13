import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { enrichLeadsWithGeo, rowToCrmLead, type EnquiryRow } from '@/lib/enquiries';
import { EnquiriesCrm } from './EnquiriesCrm';

export const dynamic = 'force-dynamic';

export default async function EnquiriesPage() {
  const { profile } = await getSessionProfile();
  const admin = createAdminClient();
  const { data } = await admin
    .from('enquiries')
    .select('id, name, email, phone, postcode, interest, property_type, source, status, created_at')
    .order('created_at', { ascending: false });

  const leads = await enrichLeadsWithGeo(((data ?? []) as EnquiryRow[]).map(rowToCrmLead));

  return (
    <AdminShell active="enquiries" isAdmin={profile?.role === 'admin'}>
      <EnquiriesCrm initialLeads={leads} />
    </AdminShell>
  );
}
