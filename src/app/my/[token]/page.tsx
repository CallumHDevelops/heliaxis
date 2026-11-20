import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { loadPortal } from '@/lib/crm/portal';
import { PREVIEW_MESSAGE, previewJob } from '@/lib/crm/portal-preview';
import { themeContext } from '@/lib/theme/server';
import { PortalView } from './PortalView';

export const dynamic = 'force-dynamic';
/** Its own home-screen app: the project's manifest (installed from here, the icon opens this project) and iPhone's settings. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: 'Your project',
    robots: { index: false, follow: false },
    manifest: `/my/${encodeURIComponent(token)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: 'My Heliaxis', statusBarStyle: 'black-translucent' },
    icons: { apple: [{ url: '/my/apple-touch-icon.png', sizes: '180x180' }] },
  };
}

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
  // Staff using "View as customer": a banner, and the portal's actions are switched off (src/lib/crm/portal-preview.ts).
  const preview = (await previewJob()) && (await requirePortal('crm')) ? true : false;
  return (
    <>
      {preview && (
        <div className="pt-preview" role="status">
          <span>
            <b>Staff preview.</b> {PREVIEW_MESSAGE}
          </span>
          <a className="pt-btn ghost" href="/api/crm/portal-preview/exit">
            Back to the job
          </a>
        </div>
      )}
      <PortalView data={data} paid={paid !== undefined} justAccepted={accepted !== undefined} openAccept={accept !== undefined} themePref={pref} preview={preview} />
    </>
  );
}
