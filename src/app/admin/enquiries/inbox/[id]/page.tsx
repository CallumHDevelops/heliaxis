import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { chatJob } from '@/lib/whatsapp/active';
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
  const from = await chatJob(job, tab, canAccess(profile, 'crm'));
  return (
    <AdminShell active="whatsapp">
      {/* key: a fresh thread (scroll, read state) when a notification opens another chat. */}
      <ChatThread key={id} id={id} me={user?.id ?? ''} job={from} />
    </AdminShell>
  );
}
