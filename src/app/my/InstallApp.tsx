'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isCustomerHost } from '@/lib/crm/portal-url';
import { Icon } from './[token]/parts';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const HIDE_KEY = 'hx_my_install_hidden';
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Private mode: fine, the card just shows again next time.
  }
};

/**
 * "Add to your home screen": Chrome / Android / Edge get the browser's own install prompt
 * (beforeinstallprompt); iPhone and iPad Safari get a short how-to sheet (Share, then Add to Home
 * Screen), since iOS has no prompt. Hidden once installed (opened as an app) or dismissed on this
 * phone. The installed icon opens straight to their project: the page's manifest starts there.
 */
/** What this phone is, read once in the browser: installed already, an iPhone/iPad, another phone, or neither; and whether the card was hidden. */
function deviceOf(): string {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return 'none|0';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return `${ios ? 'ios' : /Android/.test(ua) ? 'other' : 'desktop'}|${get(HIDE_KEY) === '1' ? 1 : 0}`;
}
const noSubscribe = () => () => undefined;

export function InstallApp({ compact = false }: { compact?: boolean }) {
  const device = useSyncExternalStore(noSubscribe, deviceOf, () => 'none|0');
  const [kind, hiddenFlag] = device.split('|');
  const [evt, setEvt] = useState<BIP | null>(null);
  const [installed, setInstalled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hidden = dismissed || hiddenFlag === '1';

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const mode: 'none' | 'prompt' | 'ios' | 'other' = installed || kind === 'none' ? 'none' : evt ? 'prompt' : kind === 'ios' ? 'ios' : kind === 'other' ? 'other' : 'none';
  if (mode === 'none' || (hidden && compact)) return null;

  async function install() {
    if (mode === 'prompt' && evt) {
      await evt.prompt();
      const c = await evt.userChoice.catch(() => null);
      if (c?.outcome === 'accepted') setInstalled(true);
      setEvt(null);
      return;
    }
    setSheet(true);
  }

  return (
    <>
      <section className={`pt-install${compact ? ' is-compact' : ''}`} aria-label="Add to your home screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/my/icon-192.png" alt="" width={44} height={44} />
        <div>
          <b>Add your project to your home screen</b>
          <small>One tap to your dates, documents and messages, like an app.</small>
        </div>
        <button type="button" className="pt-btn" onClick={() => void install()}>
          {mode === 'prompt' ? 'Install' : 'How'}
        </button>
        {compact && (
          <button
            type="button"
            className="pt-x"
            aria-label="Hide"
            onClick={() => {
              set(HIDE_KEY, '1');
              setDismissed(true);
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </section>
      {sheet && (
        <div className="pt-sheet" role="dialog" aria-modal="true" aria-label="Add to your home screen" onClick={() => setSheet(false)}>
          <div className="pt-sheet-box" onClick={(e) => e.stopPropagation()}>
            <h2>Add to your home screen</h2>
            {mode === 'ios' ? (
              <ol className="pt-howto">
                <li>
                  <span className="pt-howto-ic">
                    <Icon name="share" size={18} />
                  </span>
                  Tap the <b>Share</b> button in Safari’s toolbar (at the bottom, or top right on iPad).
                </li>
                <li>
                  <span className="pt-howto-ic">
                    <Icon name="plus" size={18} />
                  </span>
                  Scroll down and tap <b>Add to Home Screen</b>.
                </li>
                <li>
                  <span className="pt-howto-ic">
                    <Icon name="check" size={18} />
                  </span>
                  Tap <b>Add</b>. Your project opens from the new Heliaxis icon.
                </li>
              </ol>
            ) : (
              <ol className="pt-howto">
                <li>
                  <span className="pt-howto-ic">⋮</span>
                  Open your browser’s menu (the three dots, top right).
                </li>
                <li>
                  <span className="pt-howto-ic">
                    <Icon name="plus" size={18} />
                  </span>
                  Tap <b>Add to Home screen</b> or <b>Install app</b>.
                </li>
                <li>
                  <span className="pt-howto-ic">
                    <Icon name="check" size={18} />
                  </span>
                  Confirm. Your project opens from the new Heliaxis icon.
                </li>
              </ol>
            )}
            {mode === 'ios' && <p className="pt-muted">Using Chrome on iPhone? Open this page in Safari first, or use Chrome’s Share button the same way.</p>}
            <button type="button" className="pt-btn" onClick={() => setSheet(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** This phone remembers the project (cookie for /my, and storage), so the home-screen icon and /my reopen it. */
export function rememberProject(token: string) {
  try {
    document.cookie = `hx_my=${token}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  } catch {
    // Never in the way.
  }
  set('hx_my_token', token);
}
export function forgetProject() {
  try {
    document.cookie = 'hx_my=; path=/; max-age=0; samesite=lax';
    localStorage.removeItem('hx_my_token');
  } catch {
    // Never in the way.
  }
}
export const rememberedProject = () => get('hx_my_token');

/** The portal's own service worker (scope /my): what lets Chrome offer "Install app". Production only. */
export function registerPortalWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  const here = isCustomerHost(location.host);
  navigator.serviceWorker.register(here ? '/sw.js' : '/my/sw.js', { scope: here ? '/' : '/my' }).catch(() => null);
}
