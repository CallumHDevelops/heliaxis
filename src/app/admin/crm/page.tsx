import { AdminShell } from '@/components/admin/AdminShell';
import { CrmBoard } from './CrmBoard';

export const dynamic = 'force-dynamic';

export default function CrmPage() {
  return (
    <AdminShell active="crm" wide>
      <CrmBoard />
    </AdminShell>
  );
}
