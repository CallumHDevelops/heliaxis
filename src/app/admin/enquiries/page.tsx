import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { enrichLeadsWithGeo, rowToCrmLead } from '@/lib/enquiries';
import { listEnquiryRows } from '@/lib/enquiries-server';
import { canAccess } from '@/lib/portals';
import { EnquiriesCrm } from './EnquiriesCrm';

export const dynamic = 'force-dynamic';

export default async function EnquiriesPage() {
  const { profile } = await getSessionProfile();
  const { rows } = await listEnquiryRows();

  const leads = await enrichLeadsWithGeo(rows.map(rowToCrmLead));

  return (
    <AdminShell active="enquiries" isAdmin={profile?.role === 'admin'} fluid>
      <EnquiriesCrm
        initialLeads={leads}
        canCrm={canAccess(profile, 'crm')}
        canImport={profile?.role === 'admin'}
        canDelete={profile?.role === 'admin'}
      />
    </AdminShell>
  );
}
