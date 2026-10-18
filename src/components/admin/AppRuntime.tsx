'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { forgetNativePush, syncNativePush } from '@/lib/push-client';
import { clearTaskStorage } from '@/lib/tasks-offline';

/**
 * Staff-app plumbing, mounted on every admin page:
 * - registers the service worker (/sw.js, scope /admin) for offline use;
 * - "Heliaxis has been updated" banner when a new deploy's worker is waiting;
 * - Android app: the APK opens /admin?app=android-<versionCode>, which we remember,
 *   then compare with /app/version.json to offer (or require) the new APK; it also hands
 *   over its Firebase token for native notifications (syncNativePush);
 * - offline pill;
 * - clears cached pages and local task data on sign-out.
 */

type Release = { versionCode: number; versionName: string; minVersionCode: number; notes?: string[] };

const APP_KEY = 'hx.app';
const DISMISS_KEY = 'hx.app.dismissed';

function readInstalledVersion(): number | null {
  try {
    const m = /^android-(\d+)$/.exec(new URLSearchParams(location.search).get('app') || '');
    if (m) localStorage.setItem(APP_KEY, JSON.stringify({ platform: 'android', v: Number(m[1]) }));
    const saved = JSON.parse(localStorage.getItem(APP_KEY) || 'null');
    return saved?.v ? Number(saved.v) : null;
  } catch {
    return null;
  }
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function AppRuntime() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [apkUpdate, setApkUpdate] = useState<{ release: Release; forced: boolean } | null>(null);

  // Service worker + web updates.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/admin' })
      .then((reg) => {
        const track = (sw: ServiceWorker | null) => {
          if (!sw) return;
          const check = () => sw.state === 'installed' && navigator.serviceWorker.controller && setWaiting(sw);
          check();
          sw.addEventListener('statechange', check);
        };
        track(reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Check for a new deploy when the app comes back to the foreground.
        const onVisible = () => document.visibilityState === 'visible' && reg.update().catch(() => {});
        document.addEventListener('visibilitychange', onVisible);

        // Keep this page's scripts/styles so it also works offline next time.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'CACHE_URLS', urls });
      })
      .catch(() => {});

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // Android app version check.
  useEffect(() => {
    const installed = readInstalledVersion();
    void syncNativePush(installed);
    // The download page shows its own update status.
    if (!installed || location.pathname.startsWith('/admin/app')) return;
    fetch('/app/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((release: Release | null) => {
        if (!release || release.versionCode <= installed) return;
        const forced = installed < (release.minVersionCode || 0);
        let dismissed = 0;
        try {
          dismissed = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
        } catch {
          /* ignore */
        }
        if (forced || dismissed < release.versionCode) setApkUpdate({ release, forced });
      })
      .catch(() => {});
  }, []);

  // A notification tapped while the app is already on that page only changes the #fragment.
  useEffect(() => {
    const onHash = () => void syncNativePush(readInstalledVersion());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Sign-out cleanup.
  useEffect(() => {
    const onSubmit = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest?.('form[data-signout]')) return;
      clearTaskStorage();
      forgetNativePush();
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR' });
    };
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  const dismissApk = () => {
    try {
      if (apkUpdate) sessionStorage.setItem(DISMISS_KEY, String(apkUpdate.release.versionCode));
    } catch {
      /* ignore */
    }
    setApkUpdate(null);
  };

  return (
    <>
      {apkUpdate?.forced && (
        <div className="hx-rt-modal" role="dialog" aria-modal="true" aria-labelledby="hx-rt-title">
          <div className="hx-rt-card">
            <h2 id="hx-rt-title">Please update the Heliaxis app</h2>
            <p>
              Version {apkUpdate.release.versionName} is required to keep using the app. Download it, then tap
              <b> Install</b> — your data stays as it is.
            </p>
            {apkUpdate.release.notes?.length ? (
              <ul>
                {apkUpdate.release.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <Link className="hx-rt-btn is-primary" href="/admin/app">
              Get the update
            </Link>
          </div>
        </div>
      )}

      {(waiting || (apkUpdate && !apkUpdate.forced) || !online) && (
        <div className="hx-rt-bar" role="status">
          {!online && <span className="hx-rt-pill">Offline — changes will sync when you reconnect</span>}
          {waiting && (
            <span className="hx-rt-note">
              Heliaxis has been updated.
              <button
                type="button"
                className="hx-rt-btn is-primary"
                onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}
              >
                Refresh
              </button>
            </span>
          )}
          {apkUpdate && !apkUpdate.forced && (
            <span className="hx-rt-note">
              App update {apkUpdate.release.versionName} available.
              <Link className="hx-rt-btn is-primary" href="/admin/app">
                Update
              </Link>
              <button type="button" className="hx-rt-btn" onClick={dismissApk}>
                Later
              </button>
            </span>
          )}
        </div>
      )}

      <style>{`
        .hx-rt-bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 50;
          display: flex; flex-direction: column; gap: 6px; align-items: center; width: max-content; max-width: calc(100vw - 32px); }
        .hx-rt-note, .hx-rt-pill { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
          background: #211f18; color: #fffdf8; padding: 10px 14px; border-radius: 4px; font-size: .88rem; font-weight: 600;
          box-shadow: 0 6px 24px rgba(0,0,0,.18); }
        .hx-rt-pill { background: #c77f04; padding: 6px 12px; font-size: .78rem; }
        .hx-rt-btn { font: inherit; font-size: .82rem; font-weight: 700; padding: .35rem .75rem; border-radius: 2px;
          border: 1px solid rgba(255,253,248,.35); background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
        .hx-rt-btn.is-primary { background: #f8bc1e; border-color: #f8bc1e; color: #211f18; }
        .hx-rt-modal { position: fixed; inset: 0; z-index: 60; background: rgba(33,31,24,.6); display: grid; place-items: center; padding: 16px; }
        .hx-rt-card { background: #fffdf8; color: #211f18; max-width: 420px; padding: 24px; border-radius: 4px; }
        .hx-rt-card h2 { margin: 0 0 8px; font-size: 1.2rem; }
        .hx-rt-card p, .hx-rt-card li { color: #6e6a5e; line-height: 1.5; font-size: .92rem; }
        .hx-rt-card .hx-rt-btn { display: inline-block; margin-top: 8px; font-size: .95rem; padding: .6rem 1rem; }
      `}</style>
    </>
  );
}
