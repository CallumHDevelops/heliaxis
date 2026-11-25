import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { duplicateGroups } from '@/lib/projects/duplicates';
import { leadSourceLabel } from '@/lib/lead-source';
import { DuplicateCards } from './DuplicateCards';
import './duplicates.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Possible duplicates · Heliaxis', robots: { index: false, follow: false } };

/** CRM › Possible duplicates: customers who look like the same person (the same email or number, or the same name), each pair one tap from the merge screen. */
export default async function DuplicatesPage() {
  const s = await requirePortal('crm');
  if (!s) redirect('/admin?denied=1');
  const groups = (await duplicateGroups()).map((g) => ({ ...g, people: g.people.map((p) => ({ ...p, source: p.source ? leadSourceLabel(p.source) : null })) }));
  return (
    <AdminShell active="crm">
      <div className="dp-page">
        <p className="dp-back">
          <Link href="/admin/crm">← CRM</Link>
        </p>
        <h1>Possible duplicates</h1>
        <p className="dp-lead">
          Customers who look like the same person: the same email, the same phone number, or the same first and last name. Check each pair, then merge them (everything
          moves to the one you keep) or say they aren’t the same person, so they stop being flagged.
        </p>
        {groups.length === 0 ? <p className="dp-empty">No possible duplicates. When two customers share an email, a number or a name, they’ll be listed here.</p> : <DuplicateCards groups={groups} />}
      </div>
    </AdminShell>
  );
}
