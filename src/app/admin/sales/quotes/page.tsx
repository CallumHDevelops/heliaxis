import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanContent, profitOf, totalsOf } from '@/lib/quotes/types';
import { QuotesList, type QuoteListRow } from './QuotesList';

export const dynamic = 'force-dynamic';

/** Sales › Quotes: every quote, newest first, and + New quote. */
export default async function QuotesPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const ready = (await schemaReady()).quotes;
  let rows: QuoteListRow[] = [];
  if (ready) {
    const db = createAdminClient();
    const { data } = await db.from('crm_quotes').select('id, number, title, status, enquiry_id, project_id, updated_at, sent_at, content').order('updated_at', { ascending: false }).limit(200);
    const ids = [...new Set((data ?? []).map((q) => q.enquiry_id as string))];
    const { data: people } = ids.length ? await db.from('enquiries').select('id, name').in('id', ids) : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
    rows = (data ?? []).map((q) => ({
      id: q.id as string,
      number: q.number as string,
      title: q.title as string,
      status: q.status as string,
      customer: name.get(q.enquiry_id as string) ?? 'Customer',
      project_id: q.project_id as string,
      total: totalsOf(cleanContent(q.content)).gross,
      profit: profitOf(cleanContent(q.content)),
      updated_at: q.updated_at as string,
    }));
  }
  return (
    <AdminShell active="sales" fluid>
      <QuotesList ready={ready} initial={rows} admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
