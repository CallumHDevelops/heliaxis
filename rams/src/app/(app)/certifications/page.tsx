import { PageHeader } from '@/components/ui';
import { isManager, requireUser } from '@/lib/auth';
import { listApprovedProfiles, listCertifications } from '@/lib/db';
import { CertificationsClient } from './CertificationsClient';

export const metadata = { title: 'Certifications' };

export default async function CertificationsPage() {
  const { user, profile } = await requireUser('/certifications');
  const [certifications, staff] = await Promise.all([
    listCertifications(),
    listApprovedProfiles(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Certifications"
        description="Company accreditations and individual competencies, with expiry tracking. Attach any of these to a RAMS and they appear in its appendix."
      />
      <CertificationsClient
        certifications={certifications}
        staff={staff}
        currentUserId={user.id}
        canManageOthers={isManager(profile)}
      />
    </>
  );
}
