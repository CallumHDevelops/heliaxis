import type { Metadata } from 'next';
import { isLinkToken } from '@/lib/site/manifest';
import { SiteApp } from '../../ui/SiteApp';

/**
 * A trade's link from their message (P1). Opening it does nothing on the server: the page's script
 * swaps the link for a session on this phone (POST /api/site/open), so a link preview changes
 * nothing. Installed from here, the app starts at this link.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return { manifest: isLinkToken(token) ? `/portal/site/j/${token}/manifest.webmanifest` : '/portal/site/manifest.webmanifest' };
}

export default function SiteLinkPage() {
  return <SiteApp />;
}
