/**
 * Web Push on this device (browser side): is it on, and turn it on. Shared by the header bell and
 * the WhatsApp "don't miss a message" banner. Server side is src/lib/notify.ts.
 *
 * Inside the Android app, notifications are native instead (Firebase): 'native' means the app is
 * delivering them, 'native-off' that they're switched off in Android's settings for the app.
 */
export type PushState = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'blocked' | 'working' | 'native' | 'native-off';

export const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/** Fired on window when this device's push state changes, so every toggle on the page agrees. */
export const PUSH_CHANGED = 'hx-push-changed';

export function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/admin');
  return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/admin' });
}

export async function getPushState(): Promise<PushState> {
  const native = readNative();
  if (native) return native.enabled ? 'native' : 'native-off';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/admin');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask permission (must run from a tap), subscribe, and save the subscription for this user. */
export async function enablePush(): Promise<PushState> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
    const reg = await swRegistration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
    const r = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    const state: PushState = r.ok ? 'on' : 'off';
    window.dispatchEvent(new CustomEvent(PUSH_CHANGED, { detail: state }));
    return state;
  } catch {
    return 'off';
  }
}

// --- Android app: native notifications -------------------------------------------------------

const NATIVE_KEY = 'hx.native';
const NATIVE_SYNCED = 'hx.native.synced';
/** Chrome sets this referrer when the Heliaxis app opens a page (Trusted Web Activity). */
const APP_REFERRER = 'android-app://uk.co.heliaxis.app';
/** Fragment keys the app adds: its Firebase token, whether Android lets it notify, and the notification tapped. */
const FRAGMENT_KEYS = ['hx-fcm', 'hx-np', 'hx-n'];

type Native = { token: string; enabled: boolean };

export function readNative(): Native | null {
  try {
    const n = JSON.parse(localStorage.getItem(NATIVE_KEY) || 'null');
    return n && typeof n.token === 'string' ? { token: n.token, enabled: n.enabled !== false } : null;
  } catch {
    return null;
  }
}

/**
 * Runs on every admin page load. The Android app opens pages with
 * #hx-fcm=<token>&hx-np=<1|0>[&hx-n=<notification id>]; we take those off the address, mark a
 * tapped notification read, and register the token for whoever is signed in. Only accepted
 * when the app itself opened the page, so a crafted link can't route someone's notifications
 * to another device. The phone's web push is then switched off so nothing arrives twice.
 */
export async function syncNativePush(appVersion: number | null) {
  const parts = location.hash.replace(/^#/, '').split('&').filter(Boolean);
  const ours = new URLSearchParams(parts.filter((p) => FRAGMENT_KEYS.includes(p.split('=')[0])).join('&'));
  if ([...ours.keys()].length) {
    const rest = parts.filter((p) => !FRAGMENT_KEYS.includes(p.split('=')[0])).join('&');
    history.replaceState(history.state, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`);
  }

  const tapped = ours.get('hx-n');
  if (tapped && /^[0-9a-f-]{36}$/i.test(tapped)) {
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [tapped] }),
    }).catch(() => {});
  }

  // Exactly one token, from the app itself (the app also strips any it didn't add).
  const tokens = ours.getAll('hx-fcm');
  const token = tokens.length === 1 ? tokens[0] : null;
  if (token && /^[\w:.-]{20,4096}$/.test(token) && document.referrer.startsWith(APP_REFERRER)) {
    try {
      localStorage.setItem(NATIVE_KEY, JSON.stringify({ token, enabled: ours.get('hx-np') !== '0' }));
    } catch {
      return;
    }
  }

  const native = readNative();
  if (!native) return;
  const stamp = `${native.token}|${native.enabled}`;
  try {
    if (sessionStorage.getItem(NATIVE_SYNCED) === stamp) return;
  } catch {
    /* ignore */
  }
  const r = await fetch('/api/push/native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: native.token, enabled: native.enabled, appVersion }),
  }).catch(() => null);
  if (!r?.ok) return;
  try {
    sessionStorage.setItem(NATIVE_SYNCED, stamp);
  } catch {
    /* ignore */
  }

  // Web Push on this phone would duplicate every notification.
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/admin');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PUSH_CHANGED, { detail: native.enabled ? 'native' : 'native-off' }));
}

/** On sign-out: this phone stops getting the signed-out person's notifications. */
export function forgetNativePush() {
  const native = readNative();
  if (!native) return;
  try {
    sessionStorage.removeItem(NATIVE_SYNCED);
  } catch {
    /* ignore */
  }
  fetch('/api/push/native', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: native.token }),
    keepalive: true,
  }).catch(() => {});
}
