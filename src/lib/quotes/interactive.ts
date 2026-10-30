import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { projectByToken } from '@/lib/crm/portal';
import { quoteRow, type QuoteRow } from './server';
import { totalsOf, type ProposalOption } from './types';

/** What the interactive proposal page needs: the chosen design option, its pictures (as short-lived links) and what the quote costs. */
export type InteractiveData = {
  first: string;
  quoteNumber: string;
  title: string;
  priceGbp: number;
  showFinancials: boolean;
  option: Omit<ProposalOption, 'images'>;
  pictures: Partial<Record<'roof' | 'inverter' | 'battery' | 'sunpath', string>>;
  /** The customer's link, to track what they do on the page (absent when staff preview it). */
  token: string | null;
};

async function build(q: QuoteRow, first: string, token: string | null): Promise<InteractiveData | null> {
  const proposal = q.content.proposal;
  const option = proposal?.options[proposal.chosen];
  if (!proposal || !option) return null;
  const { images, ...rest } = option;
  const paths = Object.entries(images ?? {});
  const pictures: InteractiveData['pictures'] = {};
  if (paths.length) {
    const { data } = await createAdminClient().storage.from(DOCS_BUCKET).createSignedUrls(paths.map(([, p]) => p), 3600);
    for (const [kind, path] of paths) {
      const hit = data?.find((x) => x.path === path);
      if (hit?.signedUrl) pictures[kind as keyof InteractiveData['pictures']] = hit.signedUrl;
    }
  }
  return { first, quoteNumber: q.number, title: q.title, priceGbp: Math.round(totalsOf(q.content).gross) / 100, showFinancials: proposal.showFinancials, option: rest, pictures, token };
}

/** The customer's view: their link's newest quote that has been sent (or signed). */
export async function interactiveForToken(token: string): Promise<InteractiveData | null> {
  const p = await projectByToken(token);
  if (!p) return null;
  const db = createAdminClient();
  const [{ data: row }, { data: c }] = await Promise.all([
    db.from('crm_quotes').select('*').eq('project_id', p.id).in('status', ['sent', 'accepted']).order('sent_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle(),
  ]);
  if (!row) return null;
  return build(quoteRow(row), ((c?.name as string) || '').split(/\s+/)[0] || 'there', token);
}

/** Staff preview, by quote. */
export async function interactiveForQuote(q: QuoteRow, customerName: string): Promise<InteractiveData | null> {
  return build(q, customerName.split(/\s+/)[0] || 'there', null);
}
