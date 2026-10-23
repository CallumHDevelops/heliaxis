'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QUEUE_CHANGED, queued } from '@/lib/crm/photo-queue';
import { nativeTokenForSignOut, syncNativePush } from '@/lib/push-client';
import { clearSurveyStorage, SURVEYS_CHANGED, unsyncedSurveyChanges, warmSurveys, watchSurveys } from '@/lib/surveys/offline';
import { clearTaskStorage } from '@/lib/tasks-offline';

/**
 * Staff-app plumbing, mounted on every admin page:
 * - registers the service worker (/sw.js, scope /admin) for offline use;
 * - "Heliaxis has been updated" banner when a new deploy's worker is waiting;
 * - Android app: the APK opens /admin?app=android-<versionCode>, which we remember,
 *   then compare with /app/version.json to offer (or require) the new APK; it also hands
 *   over its Firebase token for native notifications (syncNativePush);
 * - offline pill;
 * - surveys: copies today's and tomorrow's to the phone (open, back to the front, back online) for
 *   people who can use the CRM (`surveys`), and keeps sending survey answers, photos and drawings
 *   that are waiting (src/lib/surveys/offline.ts);
 * - clears cached pages, local task data and surveys on sign-out (warning first if survey changes
 *   or photos haven't uploaded yet).
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

export function AppRuntime({ surveys = false }: { /** Can use the CRM: keep the next two days' surveys on this phone. */ surveys?: boolean }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [apkUpdate, setApkUpdate] = useState<{ release: Release; forced: boolean } | null>(null);
  // What hasn't uploaded yet, kept current so the sign-out warning can be shown straight away.
  const unsent = useRef({ surveys: 0, photos: 0 });

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

  // Surveys on the phone: warm the offline pack (CRM people only; anyone else would be refused on
  // every page) and keep the outbox moving.
  useEffect(() => {
    const warm = () => void (surveys ? warmSurveys().catch(() => null) : null);
    const onVisible = () => document.visibilityState === 'visible' && warm();
    window.addEventListener('online', warm);
    document.addEventListener('visibilitychange', onVisible);
    warm();
    const stop = watchSurveys();
    const count = () =>
      void Promise.all([unsyncedSurveyChanges().catch(() => 0), queued().catch(() => [])]).then(([surveys, photos]) => {
        unsent.current = { surveys, photos: photos.filter((p) => !p.failed && !p.uploadedAs).length };
      });
    window.addEventListener(SURVEYS_CHANGED, count);
    window.addEventListener(QUEUE_CHANGED, count);
    count();
    return () => {
      stop();
      window.removeEventListener('online', warm);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SURVEYS_CHANGED, count);
      window.removeEventListener(QUEUE_CHANGED, count);
    };
  }, [surveys]);

  // Sign-out cleanup.
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = (e.target as HTMLElement)?.closest?.('form[data-signout]');
      if (!form) return;
      const { surveys, photos } = unsent.current;
      if (surveys || photos) {
        const what = [
          surveys ? `${surveys} survey change${surveys === 1 ? '' : 's'}` : '',
          photos ? `${photos} photo${photos === 1 ? '' : 's'}` : '',
        ].filter(Boolean);
        const ok = window.confirm(
          `${what.join(' and ')} ${surveys + photos === 1 ? 'hasn’t' : 'haven’t'} uploaded yet. They stay on this phone and upload when you next sign in. Sign out anyway?`
        );
        if (!ok) {
          // Stop here, before the sign-out form is sent.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      clearTaskStorage();
      // Design studio drafts (keys from src/app/admin/design/lib/api.ts DRAFT_PREFIX): the next person
      // on this computer must never pick up someone else's design.
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('hx-design:draft')) localStorage.removeItem(k);
      } catch {
        /* storage blocked */
      }
      // Wipes surveys from the phone unless some haven't uploaded (those stay).
      void clearSurveyStorage().catch(() => 0);
      // Runs before React reads the form, so signOut() gets the token and unregisters it.
      const token = nativeTokenForSignOut();
      if (token && !form.querySelector('input[name="hx-native"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'hx-native';
        input.value = token;
        form.appendChild(input);
      }
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
            <span className="hx-rt-note hx-moment">
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
            <span className="hx-rt-note hx-moment">
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
        .hx-rt-bar { position: fixed; left: 50%; bottom: var(--hx-rt-bottom, 16px); transform: translateX(-50%); z-index: 50;
          display: flex; flex-direction: column; gap: 6px; align-items: center; width: max-content; max-width: calc(100vw - 32px); }
        /* Ink toasts in both themes (an "ink moment"), with a hairline on dark so they stand off the page. */
        .hx-rt-note, .hx-rt-pill { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
          background: var(--moment); color: var(--moment-text); padding: 10px 14px; border-radius: 4px; font-size: .88rem; font-weight: 600;
          box-shadow: var(--shadow); border: 1px solid var(--border); }
        .hx-rt-pill { background: var(--accent); color: var(--accent-ink); padding: 6px 12px; font-size: .78rem; }
        .hx-rt-btn { font: inherit; font-size: .82rem; font-weight: 700; padding: .35rem .75rem; border-radius: 2px;
          border: 1px solid color-mix(in srgb, var(--moment-text) 35%, transparent); background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
        .hx-rt-btn.is-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
        .hx-rt-modal { position: fixed; inset: 0; z-index: 60; background: var(--scrim); display: grid; place-items: center; padding: 16px; }
        .hx-rt-card { background: var(--raised); color: var(--text); max-width: 420px; padding: 24px; border-radius: 4px; border: 1px solid var(--border); }
        .hx-rt-card h2 { margin: 0 0 8px; font-size: 1.2rem; }
        .hx-rt-card p, .hx-rt-card li { color: var(--muted); line-height: 1.5; font-size: .92rem; }
        .hx-rt-card .hx-rt-btn { display: inline-block; margin-top: 8px; font-size: .95rem; padding: .6rem 1rem; }
      `}</style>
    </>
  );
}
