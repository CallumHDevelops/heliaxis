import { SiteApp } from '../ui/SiteApp';

export const dynamic = 'force-static';

/**
 * The same app with nothing in the address. The service worker keeps this page and serves it for
 * any /portal/site page it has no copy of (a job, a step), so the app opens after a cold start
 * with no signal: SiteApp reads where it is from the address.
 */
export default function SiteShellPage() {
  return <SiteApp />;
}
