import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { listContacts } from '@/lib/organisations/contacts-server';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { ContactsList } from './ContactsList';

export const dynamic = 'force-dynamic';

/** CRM › Contacts: the people we deal with (in an organisation or on their own), and customers. Read here too, so the first paint has them. */
export default async function ContactsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const ready = (await schemaReady()).organisations;
  const initial = ready ? await listContacts(createAdminClient()).catch(() => null) : [];
  return (
    <AdminShell active="crm" wide>
      <ContactsList ready={ready} initial={initial} />
    </AdminShell>
  );
}
