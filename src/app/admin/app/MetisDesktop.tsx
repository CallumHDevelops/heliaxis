import type { MetisRelease } from '@/lib/metis-release';

const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(0)} MB` : null);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : null);

type Os = 'windows' | 'mac';
const NAME: Record<Os, string> = { windows: 'Windows', mac: 'Mac' };

/**
 * One device's Metis download on the App page: Windows or Mac. The files live in the update folder (METIS_UPDATE_URL), not in
 * the site, so a new version is a new upload and never a new deploy. Until the installers are signed the page says what the
 * warning will be and how to get past it.
 */
export function MetisDesktop({ os, release, signed }: { os: Os; release: MetisRelease | null; signed: boolean }) {
  const file = release?.[os === 'windows' ? 'windows' : 'mac'] ?? null;
  return (
    <section className="ad-card" aria-labelledby={`ad-metis-${os}`}>
      <h2 id={`ad-metis-${os}`}>Metis for {NAME[os]}</h2>
      <p>
        Metis is the Heliaxis assistant. With this app she is one key press away: press <b>Ctrl+Shift+H</b> anywhere on your {os === 'windows' ? 'PC' : 'Mac'}, ask her something, and what she makes shows up in HAP straight away.
      </p>
      {file && release ? (
        <>
          <div className="ad-ver">
            <div>
              <b>Version {release.version}</b>
              <span>{day(release.releasedAt) ? `Released ${day(release.releasedAt)}` : ''}</span>
            </div>
          </div>
          <a className="ad-btn" href={file.url} download={file.file}>
            Download for {NAME[os]}
            {mb(file.sizeBytes) ? ` (${mb(file.sizeBytes)})` : ''}
          </a>
          <h2>Installing</h2>
          {os === 'windows' ? (
            <ol>
              <li>Open the file you downloaded and follow the steps (Windows 10 or newer).</li>
              <li>Sign in with your usual HAP email and password.</li>
              <li>
                Metis sits in the tray by the clock. Click it, or press <b>Ctrl+Shift+H</b>.
              </li>
            </ol>
          ) : (
            <ol>
              <li>Open the downloaded disk image and drag <b>Metis</b> into your <b>Applications</b> folder (macOS 11 or newer).</li>
              <li>Open Metis from Applications and sign in with your usual HAP email and password.</li>
              <li>
                Metis sits in the menu bar at the top of the screen. Click it, or press <b>Ctrl+Shift+H</b>.
              </li>
            </ol>
          )}
          <p className="ad-hint">It updates itself. When a new version is ready it shows a <b>Restart to update</b> bar.</p>
          {!signed && (
            <p className="ad-hint">
              {os === 'windows' ? (
                <>
                  This version is not code-signed yet, so Windows may show a blue “Windows protected your PC” screen. Choose <b>More info</b>, then <b>Run anyway</b>.
                </>
              ) : (
                <>
                  This version is not code-signed yet, so your Mac may say it cannot verify the developer. Right-click the app, choose <b>Open</b>, then <b>Open</b> again. You only need to do this once.
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="ad-hint">
          The {NAME[os]} version isn’t ready to download yet. Ask an admin to publish it (the steps are in <code>desktop/README.md</code>); this page will show the download as soon as they do.
        </p>
      )}
    </section>
  );
}
