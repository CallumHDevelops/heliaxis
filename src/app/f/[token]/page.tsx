import type { Metadata } from 'next';
import { InstallerForm } from './InstallerForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Installer information',
  robots: { index: false, follow: false },
};

/** An installer's private link: a pack item's questions, one at a time (src/lib/requests). */
export default async function InstallerFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InstallerForm token={token} />;
}
