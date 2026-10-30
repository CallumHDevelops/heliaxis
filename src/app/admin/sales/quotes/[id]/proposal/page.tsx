import { notFound, redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { interactiveForQuote } from '@/lib/quotes/interactive';
import { readQuote } from '@/lib/quotes/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { InteractiveProposal } from '@/app/my/[token]/proposal/InteractiveProposal';

export const dynamic = 'force-dynamic';

/** Staff preview of the interactive proposal the customer will see (nothing here is tracked). */
export default async function ProposalPreview({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePortal('crm'))) redirect('/admin?denied=1');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const q = await readQuote(id);
  if (!q) notFound();
  const { data: c } = await createAdminClient().from('enquiries').select('name').eq('id', q.enquiry_id).maybeSingle();
  const data = await interactiveForQuote(q, (c?.name as string) || '');
  if (!data) notFound();
  return <InteractiveProposal data={data} back={{ href: `/admin/sales/quotes/${id}`, label: 'Back to the quote builder' }} />;
}
