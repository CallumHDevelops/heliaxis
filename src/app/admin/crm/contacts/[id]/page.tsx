import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { readContact } from '@/lib/organisations/contacts-server';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { ContactView } from './ContactView';

export const dynamic = 'force-dynamic';

/** One contact: their details, organisation (if any) and the jobs they're dealt with through. Read here too, so the first paint has them. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const { id } = await params;
  if (!(await schemaReady()).organisations) redirect('/admin/crm/contacts');
  if (!isUuid(id)) notFound();
  const initial = await readContact(createAdminClient(), id).catch(() => undefined);
  if (initial === null) notFound();
  return (
    <AdminShell active="crm" wide>
      <ContactView key={id} id={id} initial={initial ?? null} canInbox={canAccess(session.profile, 'enquiries')} />
    </AdminShell>
  );
}
