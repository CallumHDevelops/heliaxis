import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { MetaImport } from './MetaImport';
import { WhatsAppImport } from './WhatsAppImport';
import './import.css';

export const dynamic = 'force-dynamic';

/**
 * Bring people from before the CRM into it: Meta lead-form leads and WhatsApp Business app chats.
 * Admins only. Imports keep their original dates and never message anyone or notify the team
 * (src/lib/crm/import.ts).
 */
export default async function ImportPage() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== 'admin') redirect('/admin/enquiries');
  return (
    <AdminShell active="enquiries" isAdmin>
      <div className="imp-page">
        <Link href="/admin/enquiries" className="imp-back">
          ← Enquiries
        </Link>
        <h1>Import</h1>
        <p className="imp-lede">
          Bring in leads and chats from before the CRM. They keep their original dates, and nobody is messaged or
          notified. Anyone already in the CRM is matched by phone or email, not added twice, and anyone you’ve deleted
          from the CRM is skipped.
        </p>
        <MetaImport />
        <WhatsAppImport />
      </div>
    </AdminShell>
  );
}
