import { AdminShell } from '@/components/admin/AdminShell';
import { TemplatesManager } from './TemplatesManager';

export const dynamic = 'force-dynamic';

export default function WhatsAppTemplatesPage() {
  return (
    <AdminShell active="whatsapp">
      <TemplatesManager />
    </AdminShell>
  );
}
