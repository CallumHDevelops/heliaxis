import { Alert, PageHeader, Panel } from '@/components/ui';
import { isManager, requireUser } from '@/lib/auth';
import { getCompany } from '@/lib/db';
import { CompanyForm, ProfileForm } from './CompanyForms';

export const metadata = { title: 'Company' };

export default async function CompanyPage() {
  const { profile } = await requireUser('/company');
  const company = await getCompany();
  const manager = isManager(profile);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Company & profile"
        description="These details appear in the header and footer of every RAMS you issue."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Company details" eyebrow="C/01">
          {manager ? (
            <CompanyForm company={company} />
          ) : (
            <Alert tone="neutral">
              Only managers and administrators can change the company details. Ask a manager if
              something here needs updating.
            </Alert>
          )}
        </Panel>

        <Panel title="Your details" eyebrow="C/02">
          <ProfileForm profile={profile} />
        </Panel>
      </div>
    </>
  );
}
