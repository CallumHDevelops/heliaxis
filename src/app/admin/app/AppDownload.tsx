"use client";

import { useSyncExternalStore } from "react";

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
    const saved = JSON.parse(localStorage.getItem("hx.app") || "null");
    return saved?.v ? Number(saved.v) : null;
  } catch {
    return null;
  }
}

// iPadOS reports itself as a Mac, so check for touch too.
const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isHomeScreenApp = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia("(display-mode: standalone)").matches;

/** iPhone/iPad: no APK, the site itself installs from Safari's Share menu (/admin.webmanifest). */
function IphoneSteps({ installed }: { installed: boolean }) {
  return (
    <section className="ad-card">
      {installed ? (
        <p className="ad-ok">
          You&apos;re using the Heliaxis app from your Home Screen.
        </p>
      ) : (
        <ol>
          <li>
            Open <b>heliaxis.co.uk/admin</b> in <b>Safari</b> and sign in.
            (Chrome on iPhone can&apos;t add it with notifications.)
          </li>
          <li>
            Tap the <b>Share</b> button (the square with an arrow), scroll down
            and tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>
            Open <b>Heliaxis</b> from your Home Screen and sign in again. The
            app keeps its own sign-in, separate from Safari.
          </li>
          <li>
            Tap <b>Turn on</b> in the notifications banner on the dashboard,
            then <b>Allow</b>. Needs iOS 16.4 or newer (Settings → General →
            About → iOS Version).
          </li>
        </ol>
      )}
      <h2>Good to know</h2>
      <ul>
        <li>
          Notifications only work from the Home Screen app, not from a Safari
          tab.
        </li>
        <li>
          If an older Heliaxis icon opens the website homepage, delete it and
          add it again from the dashboard.
        </li>
        <li>Updates arrive by themselves. There&apos;s nothing to download.</li>
      </ul>
    </section>
  );
}

export function AppDownload({
  release,
  sendToPhone,
  appearance,
}: {
  release: Release;
  sendToPhone?: React.ReactNode;
  /** Light / Dark / Match phone for this person (the page's first card). */
  appearance?: React.ReactNode;
}) {
  const android = useSyncExternalStore(
    noop,
    () => /android/i.test(navigator.userAgent),
    () => true,
  );
  const ios = useSyncExternalStore(noop, isIos, () => false);
  const homeScreen = useSyncExternalStore(noop, isHomeScreenApp, () => false);
  const installed = useSyncExternalStore(noop, installedVersion, () => null);

  const upToDate = installed !== null && installed >= release.versionCode;
  const href = `${release.apk}?v=${release.versionCode}`;
  const size = release.sizeBytes
    ? `${(release.sizeBytes / 1024 / 1024).toFixed(1)} MB`
    : null;
  const released = new Date(
    `${release.releasedAt}T12:00:00Z`,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (ios) {
    return (
      <div className="ad-page">
        <h1>Heliaxis for iPhone</h1>
        <p className="ad-lede">
          Add Heliaxis to your Home Screen and it works like an app: full
          screen, its own icon, notifications and an unread count on the icon.
        </p>
        {appearance}
        <IphoneSteps installed={homeScreen} />
        <AppStyles />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <h1>Heliaxis for Android</h1>
      <p className="ad-lede">
        Your dashboard, Tasks and the other Heliaxis tools as an app on your
        phone or tablet. Tasks keeps working offline and syncs when you&apos;re
        back online.
      </p>

      {appearance}

      <section className="ad-card">
        <div className="ad-ver">
          <div>
            <b>Version {release.versionName}</b>
            <span>
              Released {released}
              {size ? ` · ${size}` : ""}
            </span>
          </div>
          {installed !== null && (
            <span className={`ad-status${upToDate ? " is-ok" : ""}`}>
              {upToDate
                ? "You’re up to date"
                : `Update available (you have build ${installed})`}
            </span>
          )}
        </div>
        <a className="ad-btn" href={href} download="heliaxis.apk">
          {installed !== null && !upToDate
            ? "Download update"
            : "Download the app"}
        </a>
        {!android && (
          <p className="ad-hint">
            You&apos;re not on an Android device — scan the code or email
            yourself the link below to install it on your phone.
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

      {sendToPhone}

      <section className="ad-card">
        <h2>Installing</h2>
        <ol>
          <li>
            Tap <b>Download the app</b> and open the file when it finishes.
          </li>
          <li>
            The first time, Android asks to allow installs from your browser —
            tap <b>Settings</b>, turn on <b>Allow from this source</b>, then go
            back.
          </li>
          <li>
            Tap <b>Install</b>, then <b>Open</b>, and sign in as usual.
          </li>
        </ol>
        <h2>Updates</h2>
        <p>
          Most changes reach the app automatically. When a new version of the
          app itself is out, it shows an
          <b> Update</b> banner — tap it, download, and tap <b>Install</b>. Your
          data stays as it is.
        </p>
        <h2>What works where</h2>
        <ul>
          <li>
            Phone: dashboard, Tasks, Enquiries, Subcontractors, Social media
            studio, RAMS.
          </li>
          <li>
            Tablet or computer recommended: the Website CMS (page editor needs a
            larger screen).
          </li>
          <li>
            Offline: the dashboard and Tasks. Everything else needs a
            connection.
          </li>
        </ul>
        {release.sha256 && (
          <p className="ad-hint">
            SHA-256: <code>{release.sha256}</code>
          </p>
        )}
      </section>

      <h2 className="ad-sub">On an iPhone or iPad?</h2>
      <IphoneSteps installed={false} />
      <AppStyles />
    </div>
  );
}

function AppStyles() {
  return (
    <style>{`
        .ad-page { max-width: 640px; color: var(--text); }
        .ad-page h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
        .ad-lede { color: var(--muted); margin: .35rem 0 1.25rem; line-height: 1.5; }
        .ad-card { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 18px; margin-bottom: 16px; }
        .ad-card h2 { font-size: 1rem; margin: 1.1rem 0 .4rem; }
        .ad-card p, .ad-card li { color: var(--text-2); line-height: 1.55; font-size: .92rem; }
        .ad-card ol, .ad-card ul { padding-left: 1.2rem; margin: 0; }
        .ad-ver { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .ad-ver b { display: block; font-size: 1.05rem; }
        .ad-ver span { color: var(--muted); font-size: .85rem; }
        .ad-status { font-family: ui-monospace, Menlo, monospace; font-size: .7rem !important; text-transform: uppercase;
          font-weight: 700; padding: 4px 8px; border-radius: 2px; background: var(--warn-soft); color: var(--warn) !important; }
        .ad-status.is-ok { background: var(--ok-soft); color: var(--ok) !important; }
        .ad-btn { display: block; text-align: center; background: var(--accent); color: var(--accent-ink); font-weight: 800; font-size: 1rem;
          padding: .85rem 1rem; border-radius: 2px; text-decoration: none; }
        .ad-hint { font-size: .82rem !important; color: var(--muted) !important; margin: .75rem 0 0; overflow-wrap: anywhere; }
        .ad-sub { font-size: 1.1rem; margin: 1.5rem 0 .6rem; }
        .ad-ok { color: var(--ok) !important; font-weight: 700; margin: 0; }
        .ad-appearance h2 { margin-top: 0; }
        .ad-appearance p { margin: 0 0 12px; }
      `}</style>
  );
}
