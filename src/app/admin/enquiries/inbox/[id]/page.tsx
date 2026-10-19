import { AdminShell } from '@/components/admin/AdminShell';
import { customerRefs } from '@/lib/enquiries-server';
import { isUuid, session } from '@/lib/whatsapp/routes';
import { ChatThread } from './ChatThread';

export const dynamic = 'force-dynamic';

export default async function WhatsAppChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Their HX-0042 for the header, for anyone who can open the chat (none until customer-refs.sql is run).
  const customerRef = isUuid(id) && (await session()) ? ((await customerRefs([id])).get(id) ?? null) : null;
  return (
    <AdminShell active="whatsapp">
      {/* key: a fresh thread (scroll, read state) when a notification opens another chat. */}
      <ChatThread key={id} id={id} customerRef={customerRef} />
    </AdminShell>
  );
}
