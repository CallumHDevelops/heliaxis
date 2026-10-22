import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AdminShell } from '@/components/admin/AdminShell';
import { ThemeChoice } from '@/components/theme/ThemeChoice';
import { getSessionProfile } from '@/lib/auth';
import { APP_LINK_TTL_DAYS, appLinkUrl, createAppLinkToken, qrSvg } from '@/lib/app-link';
import { themeContext } from '@/lib/theme/server';
import { THEME_GROUP_LABEL } from '@/lib/theme/shared';
import release from '../../../../public/app/version.json';
import { AppDownload } from './AppDownload';
import { SendToPhone } from './SendToPhone';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Phone app · Heliaxis',
  robots: { index: false, follow: false },
};

export default async function AppPage() {
  const { user, profile } = await getSessionProfile();
  const name = profile?.full_name || profile?.email || '';
  // The QR carries the same personal link as the email.
  const h = await headers();
  const origin = h.get('host') ? `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}` : null;
  const link = user ? appLinkUrl(createAppLinkToken(user.id, name.split(/[\s@]/)[0] || ''), origin) : null;
  const qr = link ? await qrSvg(link) : '';
  // This person's Light / Dark / Match phone (also in the avatar menu on every page).
  const { pref } = await themeContext();

  return (
    <AdminShell active="app">
      <AppDownload
        release={release}
        appearance={
          <section className="ad-card ad-appearance" aria-labelledby="ad-appearance">
            <h2 id="ad-appearance">{THEME_GROUP_LABEL}</h2>
            <p>Match phone follows your phone’s light or dark setting.</p>
            <ThemeChoice serverPref={pref} />
          </section>
        }
        sendToPhone={qr ? <SendToPhone qrSvg={qr} email={profile?.email || user?.email || ''} days={APP_LINK_TTL_DAYS} /> : null}
      />
    </AdminShell>
  );
}
