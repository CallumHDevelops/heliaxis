import type { Metadata } from 'next';
import Link from 'next/link';
import { readAppLinkToken } from '@/lib/app-link';
import release from '../../../public/app/version.json';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Get the Heliaxis app',
  robots: { index: false, follow: false },
};

/** Landing page for the personal link emailed from /admin/app — opened on the phone, no sign-in. */
export default async function GetAppPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const link = readAppLinkToken(t);
  const size = release.sizeBytes ? ` · ${(release.sizeBytes / 1048576).toFixed(1)} MB` : '';

  return (
    <main className="ga">
      <div className="ga-card">
        <div className="ga-icon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={72} height={72} />
        </div>
        {link ? (
          <>
            <h1>{link.firstName ? `Hi ${link.firstName} — here’s your app` : 'Get the Heliaxis app'}</h1>
            <p className="ga-lede">Your dashboard and Tasks on your phone. Works offline, and lets you know when you’re given a task.</p>
            <a className="ga-btn" href={`${release.apk}?v=${release.versionCode}`} download="heliaxis.apk">
              Download the app
            </a>
            <p className="ga-meta">
              Version {release.versionName}
              {size} · Android 7 or newer
            </p>
            <ol className="ga-steps">
              <li>Tap <b>Download the app</b>, then open the file when it finishes.</li>
              <li>
                If Android asks, tap <b>Settings</b>, turn on <b>Allow from this source</b>, then go back.
              </li>
              <li>Tap <b>Install</b>, then <b>Open</b> and sign in as usual.</li>
            </ol>
            <p className="ga-note">On an iPhone? The app is Android-only for now — use heliaxis.co.uk/admin in Safari.</p>
          </>
        ) : (
          <>
            <h1>This link has expired</h1>
            <p className="ga-lede">
              Download links last a week. Sign in on your phone and open the app page to get the app, or send yourself
              a new link from there.
            </p>
            <Link className="ga-btn" href="/admin/app">
              Sign in to get the app
            </Link>
          </>
        )}
      </div>

      <style>{`
        .ga { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box;
          background: #f7f2e7; color: #211f18; font-family: 'Segoe UI', system-ui, sans-serif; }
        .ga-card { width: 100%; max-width: 440px; background: #fffdf8; border: 1px solid rgba(33,31,24,.14); border-radius: 6px;
          padding: 28px 22px; box-sizing: border-box; text-align: center; }
        .ga-icon img { border-radius: 16px; box-shadow: 0 6px 18px rgba(0,0,0,.12); }
        .ga h1 { font-size: 1.4rem; line-height: 1.25; margin: 16px 0 8px; }
        .ga-lede { color: #6e6a5e; line-height: 1.5; margin: 0 0 20px; }
        .ga-btn { display: block; background: #f8bc1e; color: #211f18; font-weight: 800; font-size: 1.05rem;
          padding: 15px 16px; border-radius: 3px; text-decoration: none; }
        .ga-meta { font-size: .8rem; color: #6e6a5e; margin: 10px 0 18px; }
        .ga-steps { text-align: left; margin: 0; padding: 14px 14px 14px 32px; background: #f7f2e7; border-radius: 4px;
          font-size: .9rem; line-height: 1.55; color: #4a473e; }
        .ga-steps li + li { margin-top: 6px; }
        .ga-note { font-size: .78rem; color: #6e6a5e; margin: 16px 0 0; }
      `}</style>
    </main>
  );
}
