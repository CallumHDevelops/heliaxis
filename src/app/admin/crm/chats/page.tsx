import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { WhatsAppChats } from '@/components/admin/whatsapp/WhatsAppPanel';
import { requirePortal } from '@/lib/auth';
import '@/app/admin/enquiries/whatsapp.css';

export const dynamic = 'force-dynamic';

/**
 * WhatsApp for CRM staff without the Enquiries inbox: chats with customers who have a job, each
 * opening as a full page (/admin/crm/chats/{id}). The dock is hidden here (this is the list).
 */
export default async function CrmChatsPage() {
  const s = await requirePortal('crm');
  if (!s) redirect('/admin');
  return (
    <AdminShell active="whatsapp" fluid>
      <div className="wa-page">
        <h1 className="wa-h1">WhatsApp chats</h1>
        <p className="wa-muted" style={{ marginTop: '-0.4rem' }}>
          Chats with customers who have a job in the CRM.
        </p>
        <WhatsAppChats canCrm />
      </div>
    </AdminShell>
  );
}
