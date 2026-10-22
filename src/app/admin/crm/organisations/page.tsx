import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { listOrganisations } from '@/lib/organisations/server';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { OrganisationsList } from './OrganisationsList';

export const dynamic = 'force-dynamic';

/** CRM › Organisations: every organisation, searchable and by type. Read here too, so the first paint has them. */
export default async function OrganisationsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const ready = (await schemaReady()).organisations;
  const initial = ready ? await listOrganisations(createAdminClient()).catch(() => null) : [];
  return (
    <AdminShell active="crm" wide>
      <OrganisationsList ready={ready} initial={initial} />
    </AdminShell>
  );
}
