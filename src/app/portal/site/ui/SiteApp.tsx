'use client';

import { useEffect, useState } from 'react';
import { getDevice } from '@/lib/site/offline';
// The sign-off's sender on the outbox: registered before the first send, whatever screen opens first.
import '@/lib/site/signoff-client';
// The electrician's: certificate files and the customer's signatures.
import '@/lib/site/electrician-client';
import { refreshJobs } from '@/lib/site/packs';
import { isDraining, startSync } from '@/lib/site/sync';
import { ProblemScreen, Splash } from './bits';
import { Home } from './Home';
import { JobScreen } from './JobScreen';
import { Landing } from './Landing';
import { parseRoute, useLive, usePath } from './nav';

/**
 * The site app (every /portal/site page is this one shell). It draws the screen for the address
 * from what's on the phone (IndexedDB, src/lib/site/offline.ts), sends what's waiting
 * (src/lib/site/sync.ts) and registers its own service worker, scoped to /portal/site.
 */
export function SiteApp() {
  const route = parseRoute(usePath());
  const device = useLive(getDevice, 'device');
  const update = useServiceWorker();

  useEffect(() => {
    startSync();
  }, []);

  // The list (and a pack for any job not on the phone yet: a second job for the same person
  // arrives this way) whenever there's signal, at most once a minute.
  const signedIn = !!device && !device.revoked;
  useEffect(() => {
    if (signedIn && route.name !== 'link') void refreshJobs();
  }, [signedIn, route.name]);

  let screen: React.ReactNode;
  if (route.name === 'loading') screen = <Splash />;
  else if (route.name === 'link') screen = <Landing token={route.token} />;
  else if (device === undefined) screen = <Splash />;
  else if (!device || device.revoked)
    screen = (
      <ProblemScreen
        title={device?.revoked ? 'This phone has been signed out' : 'Open your link first'}
        message={device?.revoked ? 'Open the link in your message again.' : 'Open the link in your message from Heliaxis on this phone. It signs this phone in for all your Heliaxis jobs.'}
      />
    );
  else if (route.name === 'job') screen = <JobScreen key={route.id} id={route.id} rest={route.rest} />;
  else screen = <Home />;

  return (
    <>
      {update && (
        <button type="button" className="sa-update" onClick={update}>
          A new version of the app is ready. Tap to update.
        </button>
      )}
      {screen}
    </>
  );
}

/** Register the service worker (production only: in development it would keep old scripts), and offer its updates. */
function useServiceWorker(): (() => void) | null {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reg: ServiceWorkerRegistration | null = null;
    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
        });
      });
    };
    navigator.serviceWorker
      .register('/portal/site/sw.js', { scope: '/portal/site' })
      .then((r) => {
        reg = r;
        watch(r);
      })
      .catch(() => {});
    const check = () => {
      if (document.visibilityState === 'visible') void reg?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  if (!waiting) return null;
  return () => {
    // Never mid-send: wait for the send to finish, then swap and reload.
    const swap = () => {
      if (isDraining()) return void setTimeout(swap, 500);
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    };
    swap();
  };
}
