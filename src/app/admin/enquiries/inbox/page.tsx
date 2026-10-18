import { AdminShell } from '@/components/admin/AdminShell';
import { InboxList } from './InboxList';

export const dynamic = 'force-dynamic';

export default function WhatsAppInboxPage() {
  return (
    <AdminShell active="whatsapp">
      <InboxList />
    </AdminShell>
  );
}
