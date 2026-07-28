import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { getUmamiConfig } from '@/lib/umami';
import './analytics.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analytics — Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  const { profile } = await getSessionProfile();
  const umami = getUmamiConfig();
  const isAdmin = profile?.role === 'admin';
  const shareUrl = umami.shareUrl;

  return (
    <AdminShell active="analytics" isAdmin={isAdmin} flush={Boolean(shareUrl)}>
      {!shareUrl ? (
        <div className="ua ua--setup">
          <ApiSetupCard hasWebsiteId={umami.configured} />
        </div>
      ) : (
        <iframe
          className="ua-full__frame"
          src={shareUrl}
          title="Umami analytics"
          loading="eager"
          referrerPolicy="no-referrer-when-downgrade"
          allow="clipboard-write"
        />
      )}
    </AdminShell>
  );
}

function ApiSetupCard({ hasWebsiteId }: { hasWebsiteId: boolean }) {
  return (
    <section className="ua__setup">
      <h2>Connect free Umami share link</h2>
      <p>Add your share URL — the full Umami dashboard embeds here (no paid API key).</p>
      <ol>
        <li>
          In{' '}
          <a href="https://cloud.umami.is" target="_blank" rel="noopener noreferrer">
            cloud.umami.is
          </a>
          , open your website → enable <strong>Share</strong>.
        </li>
        <li>
          Put this in <code>.env</code>:
        </li>
      </ol>
      <pre>{`NEXT_PUBLIC_UMAMI_WEBSITE_ID=${hasWebsiteId ? '✓ set' : 'your-website-uuid'}
NEXT_PUBLIC_UMAMI_SHARE_URL=https://cloud.umami.is/share/…
NEXT_PUBLIC_UMAMI_TRACK_DEV=1`}</pre>
      <p style={{ marginTop: 12, marginBottom: 0 }}>
        Restart <code>npm run dev</code>, then refresh this page.
      </p>
    </section>
  );
}
