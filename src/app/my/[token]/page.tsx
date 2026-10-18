import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPortal } from '@/lib/crm/portal';
import { PortalView } from './PortalView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your project',
  robots: { index: false, follow: false },
};

/** The customer's private portal: progress, dates, documents, photos, booking, quote acceptance, deposit. */
export default async function CustomerPortal({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;
  const data = await loadPortal(token);
  if (!data) notFound();
  return <PortalView data={data} paid={paid !== undefined} />;
}
