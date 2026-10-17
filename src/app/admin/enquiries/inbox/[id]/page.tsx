import { AdminShell } from '@/components/admin/AdminShell';
import { ChatThread } from './ChatThread';

export const dynamic = 'force-dynamic';

export default async function WhatsAppChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell active="whatsapp">
      <ChatThread id={id} />
    </AdminShell>
  );
}
