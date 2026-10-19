'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile ("I'm not a robot") for the website booking form. Only rendered when the
 * site key is set (the env-turnstile to-do); without it the form still works, with limits. Each
 * token can be used once, so bump `resetKey` after every hold attempt to get a fresh one.
 */

type TurnstileApi = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile ?? null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let gone = false;
    loadTurnstile().then((api) => {
      if (gone || !api || !box.current || widget.current) return;
      widget.current = api.render(box.current, {
        sitekey: siteKey,
        theme: 'light',
        size: 'flexible',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    });
    return () => {
      gone = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetKey]);

  return <div ref={box} className="bk-turnstile" />;
}
