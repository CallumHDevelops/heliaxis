'use client';

import { useEffect, useState } from 'react';
import { enablePush, getPushState, PUSH_CHANGED, type PushState } from '@/lib/push-client';

/** "Don't miss a WhatsApp message": shown until phone notifications are on for this device. */
export function PushBanner({ what = 'WhatsApp messages' }: { what?: string }) {
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    let live = true;
    getPushState().then((s) => live && setState(s));
    const onChange = (e: Event) => setState((e as CustomEvent<PushState>).detail);
    window.addEventListener(PUSH_CHANGED, onChange);
    return () => {
      live = false;
      window.removeEventListener(PUSH_CHANGED, onChange);
    };
  }, []);

  if (!state || state === 'on') return null;
  const iPhone = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="push-banner" role="status">
      <span className="push-banner__icon" aria-hidden="true">🔔</span>
      <div className="push-banner__text">
        {state === 'off' || state === 'working' ? (
          <>
            <b>Turn on notifications</b> so {what} reach this phone straight away.
          </>
        ) : state === 'blocked' ? (
          <>
            <b>Notifications are blocked.</b> Allow them in your phone’s Settings → Apps → Heliaxis → Notifications.
          </>
        ) : state === 'unconfigured' ? (
          <>
            <b>Phone notifications aren’t set up yet</b> (VAPID keys missing in Vercel). Alerts only appear in the bell
            for now.
          </>
        ) : iPhone ? (
          <>
            <b>On iPhone:</b> tap Share → <b>Add to Home Screen</b>, open Heliaxis from there, then turn on notifications.
          </>
        ) : (
          <>This browser can’t show notifications — use the Heliaxis app or Chrome.</>
        )}
      </div>
      {(state === 'off' || state === 'working') && (
        <button
          type="button"
          className="push-banner__btn"
          disabled={state === 'working'}
          onClick={async () => {
            setState('working');
            setState(await enablePush());
          }}
        >
          {state === 'working' ? '…' : 'Turn on'}
        </button>
      )}
    </div>
  );
}
