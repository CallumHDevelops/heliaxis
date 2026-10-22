'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CONSENT_COOKIE, CONSENT_MAX_AGE } from '@/lib/attribution';

/**
 * The cookie banner (rendered by PublicTrackers, so it's on every page that could load trackers).
 * Accept and Reject are the same size. The choice goes in hx_consent (strictly necessary, so it needs
 * no consent itself). Accept loads Google Analytics and remembers which ad or campaign the visitor
 * landed from (hx_attr, via /api/attr); Reject removes both. Any link to #cookie-settings (the site
 * footer, CMS footers) opens it again.
 */

export type Consent = 'yes' | 'no' | 'unset' | 'unknown'; // unknown = on the server / before hydration

const EVENT = 'hx:consent';
// The page the visitor arrived on, read once when the page's scripts first load (not on later
// client-side navigations), so Accept can label them with the ad that brought them.
const LANDING = typeof window === 'undefined' ? '' : window.location.href;

function readConsent(): Consent {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=(yes|no)(?:;|$)`));
  return m ? (m[1] as 'yes' | 'no') : 'unset';
}
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** The visitor's cookie choice, updated as soon as they make it. */
export function useConsent(): Consent {
  return useSyncExternalStore(subscribe, readConsent, () => 'unknown');
}

function saveConsent(v: 'yes' | 'no') {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${v}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(EVENT));
}

/** Google Analytics' own cookies, on this host and the parent domains it may have used. */
function clearAnalyticsCookies() {
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === '_ga' || n.startsWith('_ga_') || n === '_gid' || n === '_gat');
  const parts = window.location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`.${parts.slice(i).join('.')}`);
  for (const n of names) for (const d of domains) document.cookie = `${n}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}`;
}

const CSS = `
.hxc{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:1000;max-width:560px;margin:0 auto;
  background:#211F18;color:#F7F2E7;border:1px solid rgba(247,242,231,.16);border-radius:10px;box-shadow:0 18px 40px -18px rgba(0,0,0,.6);
  padding:16px;font-family:'Hanken Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:.92rem;line-height:1.45}
.hxc h2{font:inherit;font-weight:700;font-size:1rem;margin:0 0 4px;color:#F7F2E7;letter-spacing:0}
.hxc p{margin:0 0 12px}
.hxc a{color:#F8BC1E;text-decoration:underline}
.hxc-actions{display:flex;gap:10px}
.hxc-actions button{flex:1 1 0;min-height:48px;border-radius:6px;border:1.5px solid #F8BC1E;background:#F8BC1E;color:#211F18;
  font:inherit;font-weight:700;font-size:.95rem;cursor:pointer}
.hxc-actions button:focus-visible{outline:3px solid #F7F2E7;outline-offset:2px}
@media print{.hxc{display:none}}
`;

export function CookieBanner({ consent }: { consent: Consent }) {
  const [reopened, setReopened] = useState(false);
  const first = useRef<HTMLButtonElement>(null);

  // "Cookie settings" links anywhere on the page open the banner again.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="#cookie-settings"]');
      if (!a) return;
      e.preventDefault();
      setReopened(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  useEffect(() => {
    if (reopened) first.current?.focus();
  }, [reopened]);

  if (consent === 'unknown' || (consent !== 'unset' && !reopened)) return null;

  const accept = () => {
    saveConsent('yes');
    setReopened(false);
    void fetch('/api/attr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: LANDING || window.location.href, referrer: document.referrer }),
      cache: 'no-store',
    }).catch(() => null);
  };
  const reject = () => {
    saveConsent('no');
    setReopened(false);
    clearAnalyticsCookies();
    void fetch('/api/attr', { method: 'DELETE', cache: 'no-store' }).catch(() => null);
  };

  return (
    <div className="hxc hx-moment" role="region" aria-label="Cookie choice">
      <style>{CSS}</style>
      <h2>Cookies</h2>
      <p>
        Can we use cookies to see how people use our website (Google Analytics) and which of our adverts brought you here? Nothing
        is stored unless you say yes, and the website works the same either way.{' '}
        <Link href="/privacy-policy#cookies">How we use cookies</Link>
        {consent !== 'unset' && <> · You chose {consent === 'yes' ? 'Accept' : 'Reject'}.</>}
      </p>
      <div className="hxc-actions">
        <button type="button" ref={first} onClick={reject}>
          Reject
        </button>
        <button type="button" onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  );
}
