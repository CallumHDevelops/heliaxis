'use client';

import { ChatPane, type ChatPaneProps } from '@/components/admin/whatsapp/ChatPane';

/**
 * One chat in the WhatsApp inbox: the shared chat (src/components/admin/whatsapp/ChatPane.tsx) as a
 * full page, with the ← back to the inbox. The CRM's own chat page (/admin/crm/chats/{id}) uses the
 * same, with its own back link.
 */
export function ChatThread({
  id,
  me,
  job = null,
  back = { href: '/admin/enquiries/inbox', label: 'Back to inbox', short: 'Inbox' },
  canInbox = true,
  canCrm = false,
  customerRef = null,
}: {
  id: string;
  me: string;
  job?: ChatPaneProps['job'];
  back?: ChatPaneProps['back'];
  canInbox?: boolean;
  /** CRM access: "+ Add task" for a call-back reminder, task or note on their job. */
  canCrm?: boolean;
  /** Their HX-0042 for the header (customer-refs.sql), null until it's been run. */
  customerRef?: string | null;
}) {
  return <ChatPane threadId={id} me={me} variant="page" active back={back} job={job} canInbox={canInbox} canCrm={canCrm} customerRef={customerRef} />;
}
