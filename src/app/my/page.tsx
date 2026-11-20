import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { projectByToken } from '@/lib/crm/portal';
import { InstallApp } from './InstallApp';
import { PortalLogin } from './PortalLogin';
import './[token]/portal.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your project',
  description: 'Open your Heliaxis project with your inverter serial number and postcode.',
  robots: { index: false, follow: false },
  manifest: '/my/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'My Heliaxis', statusBarStyle: 'black-translucent' },
  icons: { apple: [{ url: '/my/apple-touch-icon.png', sizes: '180x180' }] },
};

/**
 * heliaxis.co.uk/my: the customer opens their portal with the last 6 of their inverter serial number and their postcode
 * (or the link we sent). A phone that has opened a project before (the hx_my cookie, set by the portal) goes straight
 * back to it: this is also where the home-screen app starts. ?signout: forget it and show the form.
 */
export default async function PortalSignIn({ searchParams }: { searchParams: Promise<{ signout?: string }> }) {
  const { signout } = await searchParams;
  if (signout === undefined) {
    const remembered = (await cookies()).get('hx_my')?.value ?? '';
    if (remembered && (await projectByToken(remembered).catch(() => null))) redirect(`/my/${remembered}`);
  }
  return (
    <div className="pt pt-signin">
      <header className="pt-head">
        <BrandLogo width={118} />
        <span className="pt-head-tag">Your project</span>
      </header>
      <main className="pt-main">
        <section className="pt-hero">
          <span className="pt-hero-kicker">Heliaxis customer portal</span>
          <h1>Your project, in your pocket</h1>
          <p className="pt-hero-sub">Your quote, dates, documents, payments and help, all in one place.</p>
        </section>
        <PortalLogin forget={signout !== undefined} />
        <InstallApp />
      </main>
    </div>
  );
}
