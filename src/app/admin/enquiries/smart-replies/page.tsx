import { AdminShell } from '@/components/admin/AdminShell';
import { SmartReplies } from './SmartReplies';

export const dynamic = 'force-dynamic';

export default function SmartRepliesPage() {
  return (
    <AdminShell active="whatsapp">
      <SmartReplies />
    </AdminShell>
  );
}
