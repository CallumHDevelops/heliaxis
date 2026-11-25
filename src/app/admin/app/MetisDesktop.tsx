import type { MetisRelease } from '@/lib/metis-release';

const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(0)} MB` : null);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : null);

/**
 * Metis for Windows and Mac, on the App page. The files live in the update folder (METIS_UPDATE_URL), not in the site, so a
 * new version is a new upload and never a new deploy. Until the installers are signed the page says what the warning will be.
 */
export function MetisDesktop({ release, signed }: { release: MetisRelease | null; signed: boolean }) {
  return (
    <section className="ad-card" aria-labelledby="ad-metis">
      <h2 id="ad-metis">Metis for your computer</h2>
      <p>
        Metis, the Heliaxis assistant, as an app for Windows and Mac. Press <b>Ctrl+Shift+H</b> anywhere to ask her something. It is the same Metis as in HAP, with the same chats, and what she makes appears in HAP straight away.
      </p>
      {release ? (
        <>
          <div className="ad-ver">
            <div>
              <b>Version {release.version}</b>
              <span>{day(release.releasedAt) ? `Released ${day(release.releasedAt)}` : ''}</span>
            </div>
          </div>
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {release.windows ? (
              <a className="ad-btn" href={release.windows.url} download={release.windows.file}>
                Download for Windows{mb(release.windows.sizeBytes) ? ` (${mb(release.windows.sizeBytes)})` : ''}
              </a>
            ) : (
              <span className="ad-hint">Windows version not published yet.</span>
            )}
            {release.mac ? (
              <a className="ad-btn" href={release.mac.url} download={release.mac.file}>
                Download for Mac{mb(release.mac.sizeBytes) ? ` (${mb(release.mac.sizeBytes)})` : ''}
              </a>
            ) : (
              <span className="ad-hint">Mac version not published yet.</span>
            )}
          </p>
          <h2>Installing</h2>
          <ol>
            <li>Download it, open the file and follow the steps. Windows 10 or newer; macOS 11 or newer.</li>
            <li>Sign in with your usual HAP email and password.</li>
            <li>
              It lives in the system tray (Windows) or menu bar (Mac). It updates itself and shows a <b>Restart to update</b> banner when a new version is ready.
            </li>
          </ol>
          {!signed && (
            <p className="ad-hint">
              This version is not code-signed yet. <b>Windows</b> may show a blue “Windows protected your PC” screen: choose <b>More info</b>, then <b>Run anyway</b>. <b>Mac</b> may say it cannot verify the developer: right-click the app, choose <b>Open</b>, then <b>Open</b> again.
            </p>
          )}
        </>
      ) : (
        <p className="ad-hint">Not published yet. An admin publishes it from the desktop folder (see desktop/README.md); it will appear here as soon as it is.</p>
      )}
    </section>
  );
}
