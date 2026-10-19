import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ChatThread } from '@/app/admin/enquiries/inbox/[id]/ChatThread';
import { requirePortal } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { chatJob } from '@/lib/whatsapp/active';

export const dynamic = 'force-dynamic';

/**
 * One WhatsApp chat for CRM staff (the inbox chat, with its back link to the CRM's chat list). Phones
 * open it from a job's green WhatsApp button, with "Back to job" (?job={id}&tab={tab}).
 */
export default async function CrmChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string; tab?: string }>;
}) {
  const s = await requirePortal('crm');
  if (!s) redirect('/admin');
  const [{ id }, { job, tab }] = await Promise.all([params, searchParams]);
  const from = await chatJob(job, tab, true);
  return (
    <AdminShell active="whatsapp">
      {/* key: a fresh chat (scroll, read state) when a notification opens another one. */}
      <ChatThread
        key={id}
        id={id}
        me={s.user.id}
        job={from}
        back={{ href: '/admin/crm/chats', label: 'Back to all chats', short: 'All chats' }}
        canInbox={canAccess(s.profile, 'enquiries')}
      />
    </AdminShell>
  );
}
