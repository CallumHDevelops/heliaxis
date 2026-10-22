import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { readOrganisation } from '@/lib/organisations/server';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { OrganisationView } from './OrganisationView';

export const dynamic = 'force-dynamic';

/** One organisation: its details, contacts, jobs and notes. Read here too, so the first paint has them. */
export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const { id } = await params;
  if (!(await schemaReady()).organisations) redirect('/admin/crm/organisations');
  if (!isUuid(id)) notFound();
  const initial = await readOrganisation(createAdminClient(), id).catch(() => undefined);
  if (initial === null) notFound();
  return (
    <AdminShell active="crm" wide>
      <OrganisationView key={id} id={id} initial={initial ?? null} canInbox={canAccess(session.profile, 'enquiries')} />
    </AdminShell>
  );
}
