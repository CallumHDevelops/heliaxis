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

/** This device's Web Push notifications still on screen (none where that isn't supported). */
export async function shownNotifications(): Promise<Notification[]> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/admin');
    return (await reg?.getNotifications()) ?? [];
  } catch {
    return []; // e.g. inside the Android app, where notifications are native
  }
}

/**
 * Close the ones that `match` (a chat that's now open, or ones read elsewhere). The server can't
 * take them down itself: a browser must show a notification for every push it gets.
 */
export async function closeShownNotifications(match: (n: Notification) => boolean) {
  for (const n of await shownNotifications()) if (match(n)) n.close();
}

// --- Android app: native notifications -------------------------------------------------------

const NATIVE_KEY = 'hx.native';
/** Set in the app's own tab (sessionStorage), so Chrome on the same phone keeps normal Web Push. */
const NATIVE_TAB = 'hx.native.tab';
/** Chrome's referrer when the Heliaxis app opens a page (Trusted Web Activity). */
const APP_REFERRER = /^android-app:\/\/uk\.co\.heliaxis\.app(\/|$)/;
/** Fragment keys the app adds: its Firebase token, whether Android lets it notify, the notification tapped. */
const FRAGMENT_KEYS = ['hx-fcm', 'hx-np', 'hx-n'];
const TOKEN = /^[\w:.-]{20,4096}$/;

/** `live`: the server confirmed it can send to this token (Firebase is set up in Vercel). */
type Native = { token: string; enabled: boolean; live: boolean };

function readStored(): Native | null {
  try {
    const n = JSON.parse(localStorage.getItem(NATIVE_KEY) || 'null');
    return n && typeof n.token === 'string' ? { token: n.token, enabled: n.enabled !== false, live: n.live === true } : null;
  } catch {
    return null;
  }
}

function store(n: Native) {
  try {
    localStorage.setItem(NATIVE_KEY, JSON.stringify(n));
  } catch {
    /* ignore */
  }
}

function inAppTab() {
  try {
    return sessionStorage.getItem(NATIVE_TAB) === '1';
  } catch {
    return false;
  }
}

/** Native notifications are in charge on this page: inside the app, and the server can send them. */
export function readNative(): Native | null {
  const n = readStored();
  return n?.live && inAppTab() ? n : null;
}

/**
 * Takes the app's #hx-fcm=<token>&hx-np=<1|0>[&hx-n=<id>] off the address and keeps the token.
 * Accepted only when the app itself opened the page, so a crafted link can't route someone's
 * notifications to another device. Also runs on /login, so a first launch while signed out still
 * hands the token over. Returns the id of the notification that was tapped, if any.
 */
export function captureNativeFromUrl(): string | null {
  const parts = location.hash.replace(/^#/, '').split('&').filter(Boolean);
  const isOurs = (p: string) => FRAGMENT_KEYS.includes(decodeURIComponent(p.split('=')[0]));
  const ours = new URLSearchParams(parts.filter(isOurs).join('&'));
  if (!parts.some(isOurs)) return null;
  const rest = parts.filter((p) => !isOurs(p)).join('&');
  // null state: Next.js then syncs its router to the new URL (passing history.state would not).
  history.replaceState(null, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`);

  // Exactly one token (the app strips any it didn't add itself).
  const tokens = ours.getAll('hx-fcm');
  const token = tokens.length === 1 ? tokens[0] : null;
  if (token && TOKEN.test(token) && APP_REFERRER.test(document.referrer)) {
    const prev = readStored();
    store({ token, enabled: ours.get('hx-np') !== '0', live: prev?.token === token && prev.live });
    try {
      sessionStorage.setItem(NATIVE_TAB, '1');
    } catch {
      /* ignore */
    }
  }
  const tapped = ours.get('hx-n');
  return tapped && /^[0-9a-f-]{36}$/i.test(tapped) ? tapped : null;
}

/**
 * Runs on every admin page load (and when the #fragment changes). Registers the app's token for
 * whoever is signed in now. Once the server confirms it can send native notifications, this
 * phone's Web Push is switched off so nothing arrives twice; until then Web Push stays as it is.
 */
export async function syncNativePush(appVersion: number | null) {
  const tapped = captureNativeFromUrl();
  if (tapped) {
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [tapped] }),
    }).catch(() => {});
  }

  const stored = readStored();
  if (!stored || !inAppTab()) return;
  const r = await fetch('/api/push/native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: stored.token, enabled: stored.enabled, appVersion }),
  }).catch(() => null);
  if (!r?.ok) return;
  const live = (await r.json().catch(() => null))?.native === true;
  store({ ...stored, live });
  if (!live) {
    window.dispatchEvent(new CustomEvent(PUSH_CHANGED, { detail: await getPushState() }));
    return;
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
  window.dispatchEvent(new CustomEvent(PUSH_CHANGED, { detail: stored.enabled ? 'native' : 'native-off' }));
}

/**
 * Signing out: the sign-out form carries this phone's token so the server action removes it for
 * the person signing out, in the same request (a separate fetch would race the sign-out).
 */
export function nativeTokenForSignOut(): string | null {
  return readStored()?.token ?? null;
}
