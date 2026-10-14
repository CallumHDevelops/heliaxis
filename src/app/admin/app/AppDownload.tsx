'use client';

import { useSyncExternalStore } from 'react';

type Release = {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  releasedAt: string;
  notes: string[];
  apk: string;
  sizeBytes: number;
  sha256: string;
};

const noop = () => () => {};

/** Build number of the installed Android app (it opens /admin?app=android-N; AppRuntime saves it). */
function installedVersion(): number | null {
  try {
    const saved = JSON.parse(localStorage.getItem('hx.app') || 'null');
    return saved?.v ? Number(saved.v) : null;
  } catch {
    return null;
  }
}

export function AppDownload({ release }: { release: Release }) {
  const android = useSyncExternalStore(noop, () => /android/i.test(navigator.userAgent), () => true);
  const installed = useSyncExternalStore(noop, installedVersion, () => null);

  const upToDate = installed !== null && installed >= release.versionCode;
  const href = `${release.apk}?v=${release.versionCode}`;
  const size = release.sizeBytes ? `${(release.sizeBytes / 1024 / 1024).toFixed(1)} MB` : null;
  const released = new Date(`${release.releasedAt}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="ad-page">
      <h1>Heliaxis for Android</h1>
      <p className="ad-lede">
        Your dashboard, Tasks and the other Heliaxis tools as an app on your phone or tablet. Tasks keeps working
        offline and syncs when you&apos;re back online.
      </p>

      <section className="ad-card">
        <div className="ad-ver">
          <div>
            <b>Version {release.versionName}</b>
            <span>
              Released {released}
              {size ? ` · ${size}` : ''}
            </span>
          </div>
          {installed !== null && (
            <span className={`ad-status${upToDate ? ' is-ok' : ''}`}>
              {upToDate ? 'You’re up to date' : `Update available (you have build ${installed})`}
            </span>
          )}
        </div>
        <a className="ad-btn" href={href} download="heliaxis.apk">
          {installed !== null && !upToDate ? 'Download update' : 'Download the app'}
        </a>
        {!android && (
          <p className="ad-hint">
            You&apos;re not on an Android device — open this page on your phone or tablet (heliaxis.co.uk/admin/app)
            to install.
          </p>
        )}
        {release.notes.length > 0 && (
          <>
            <h2>What&apos;s new</h2>
            <ul>
              {release.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="ad-card">
        <h2>Installing</h2>
        <ol>
          <li>Tap <b>Download the app</b> and open the file when it finishes.</li>
          <li>
            The first time, Android asks to allow installs from your browser — tap <b>Settings</b>, turn on{' '}
            <b>Allow from this source</b>, then go back.
          </li>
          <li>Tap <b>Install</b>, then <b>Open</b>, and sign in as usual.</li>
        </ol>
        <h2>Updates</h2>
        <p>
          Most changes reach the app automatically. When a new version of the app itself is out, it shows an
          <b> Update</b> banner — tap it, download, and tap <b>Install</b>. Your data stays as it is.
        </p>
        <h2>What works where</h2>
        <ul>
          <li>Phone: dashboard, Tasks, Enquiries, Subcontractors, Social media studio, RAMS.</li>
          <li>Tablet or computer recommended: the Website CMS (page editor needs a larger screen).</li>
          <li>Offline: the dashboard and Tasks. Everything else needs a connection.</li>
        </ul>
        {release.sha256 && (
          <p className="ad-hint">
            SHA-256: <code>{release.sha256}</code>
          </p>
        )}
      </section>

      <style>{`
        .ad-page { max-width: 640px; color: #211f18; }
        .ad-page h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
        .ad-lede { color: #6e6a5e; margin: .35rem 0 1.25rem; line-height: 1.5; }
        .ad-card { background: #fffdf8; border: 1px solid rgba(33,31,24,.14); border-radius: 4px; padding: 18px; margin-bottom: 16px; }
        .ad-card h2 { font-size: 1rem; margin: 1.1rem 0 .4rem; }
        .ad-card p, .ad-card li { color: #4a473e; line-height: 1.55; font-size: .92rem; }
        .ad-card ol, .ad-card ul { padding-left: 1.2rem; margin: 0; }
        .ad-ver { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .ad-ver b { display: block; font-size: 1.05rem; }
        .ad-ver span { color: #6e6a5e; font-size: .85rem; }
        .ad-status { font-family: ui-monospace, Menlo, monospace; font-size: .7rem !important; text-transform: uppercase;
          font-weight: 700; padding: 4px 8px; border-radius: 2px; background: rgba(248,188,30,.2); color: #c77f04 !important; }
        .ad-status.is-ok { background: rgba(63,125,78,.14); color: #3f7d4e !important; }
        .ad-btn { display: block; text-align: center; background: #f8bc1e; color: #211f18; font-weight: 800; font-size: 1rem;
          padding: .85rem 1rem; border-radius: 2px; text-decoration: none; }
        .ad-hint { font-size: .82rem !important; color: #6e6a5e !important; margin: .75rem 0 0; overflow-wrap: anywhere; }
      `}</style>
    </div>
  );
}
