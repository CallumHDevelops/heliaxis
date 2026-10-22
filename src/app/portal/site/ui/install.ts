'use client';

import { useSyncExternalStore } from 'react';

/**
 * Getting the site app onto the Home Screen (P1). It has to be opened from the icon to work with no
 * signal: Android's install prompt, iPhone's Share → Add to Home Screen, and a way out of the
 * in-app browsers (WhatsApp, Facebook), which can't install anything.
 */

export type InstallEnv = 'standalone' | 'android' | 'android-inapp' | 'ios-safari' | 'ios-other' | 'desktop';

export function installEnv(): InstallEnv {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'standalone';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|; wv\)/.test(ua);
  if (ios) return inApp || /CriOS|FxiOS|EdgiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return inApp ? 'android-inapp' : 'android';
  return 'desktop';
}

export const isStandalone = () => typeof window !== 'undefined' && installEnv() === 'standalone';

/** This page in Chrome, from an Android in-app browser. */
export const chromeIntent = () => `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
/** This page in Safari, from an iPhone in-app browser (iOS 17 and later; older ones use the menu). */
export const safariLink = () => `x-safari-https://${window.location.host}${window.location.pathname}`;

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: PromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

// Listening from the moment the app's script loads: Chrome fires this once, early.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    tell();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    tell();
  });
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};
/** 'ready' once Chrome will install it with one tap; 'installed' after it has. */
export const useInstallPrompt = () => useSyncExternalStore(subscribe, () => (installed ? 'installed' : deferred ? 'ready' : 'none'), () => 'none' as const);

export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  tell();
  return outcome === 'accepted';
}

/** "Not now, use it in the browser", remembered on this phone. */
const LATER = 'hx-site-install-later';
export function installLater(): boolean {
  try {
    return localStorage.getItem(LATER) === '1';
  } catch {
    return false;
  }
}
export function setInstallLater() {
  try {
    localStorage.setItem(LATER, '1');
  } catch {
    // Private browsing: it asks again next time.
  }
}
