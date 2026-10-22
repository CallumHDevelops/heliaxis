import { SiteApp } from './ui/SiteApp';

export const dynamic = 'force-static';

/** Home: "Your Heliaxis jobs". The page carries no job data; SiteApp reads it from the phone. */
export default function SiteHomePage() {
  return <SiteApp />;
}
