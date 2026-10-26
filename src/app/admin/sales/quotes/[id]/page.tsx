import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { imageUrls, readQuote } from '@/lib/quotes/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QuoteBuilder } from './QuoteBuilder';
import '../quotes.css';

export const dynamic = 'force-dynamic';

/** One quote, in the builder. */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const q = await readQuote(id);
  if (!q) notFound();
  const db = createAdminClient();
  const [{ data: c }, { data: lib }, urls] = await Promise.all([
    db.from('enquiries').select('name, email, phone').eq('id', q.enquiry_id).maybeSingle(),
    db.from('crm_library').select('id, name, mime').eq('mime', 'application/pdf').order('name'),
    imageUrls(q.content.blocks.flatMap((b) => (b.type === 'images' ? b.images.map((i) => i.path) : []))),
  ]);
  return (
    <AdminShell active="sales" fluid>
      <QuoteBuilder
        initial={q}
        customer={{ name: (c?.name as string) || 'Customer', email: (c?.email as string | null) ?? null, phone: (c?.phone as string | null) ?? null }}
        library={(lib ?? []).map((l) => ({ id: l.id as string, name: l.name as string }))}
        imageUrls={urls}
      />
    </AdminShell>
  );
}
