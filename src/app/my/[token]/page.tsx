import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPortal } from '@/lib/crm/portal';
import { themeContext } from '@/lib/theme/server';
import { PortalView } from './PortalView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your project',
  robots: { index: false, follow: false },
};

/**
 * The customer's private link: a quote-only page while the quote waits to be signed (Quote sent),
 * then their portal from Won: progress, dates, documents, photos, quote acceptance and the deposit.
 */
export default async function CustomerPortal({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; accepted?: string; accept?: string }>;
}) {
  const { token } = await params;
  const { paid, accepted, accept } = await searchParams;
  const data = await loadPortal(token);
  if (!data) notFound();
  // Their Light / Dark / Match phone from this phone's cookie, so the toggle's first paint is right.
  const { pref } = await themeContext();
  return <PortalView data={data} paid={paid !== undefined} justAccepted={accepted !== undefined} openAccept={accept !== undefined} themePref={pref} />;
}
