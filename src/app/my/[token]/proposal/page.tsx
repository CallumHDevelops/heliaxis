import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { interactiveForToken } from '@/lib/quotes/interactive';
import { InteractiveProposal } from './InteractiveProposal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your proposal', robots: { index: false, follow: false } };

/** The customer's interactive proposal: the design, and their own energy prices worked into the savings. */
export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await interactiveForToken(token);
  if (!data) notFound();
  return <InteractiveProposal data={data} back={{ href: `/my/${token}`, label: 'Back to your quote' }} />;
}
