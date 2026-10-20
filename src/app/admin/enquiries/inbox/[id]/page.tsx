import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { customerRefs } from '@/lib/enquiries-server';
import { canAccess } from '@/lib/portals';
import { chatJob } from '@/lib/whatsapp/active';
import { chatSession, isUuid } from '@/lib/whatsapp/routes';
import { ChatThread } from './ChatThread';

export const dynamic = 'force-dynamic';

export default async function WhatsAppChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string; tab?: string }>;
}) {
  const [{ id }, { job, tab }, { user, profile }] = await Promise.all([params, searchParams, getSessionProfile()]);
  // Opened from a job's green WhatsApp button: a "Back to job" chip.
  const canCrm = canAccess(profile, 'crm');
  const from = await chatJob(job, tab, canCrm);
  // Their HX-0042 for the header, for anyone who can open the chat (none until customer-refs.sql is run).
  const customerRef = isUuid(id) && (await chatSession(id)) ? ((await customerRefs([id])).get(id) ?? null) : null;
  return (
    <AdminShell active="whatsapp">
      {/* key: a fresh thread (scroll, read state) when a notification opens another chat. */}
      <ChatThread key={id} id={id} me={user?.id ?? ''} job={from} canCrm={canCrm} customerRef={customerRef} />
    </AdminShell>
  );
}
