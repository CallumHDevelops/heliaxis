/**
 * Web Push on this device (browser side): is it on, and turn it on. Shared by the header bell and
 * the WhatsApp "don't miss a message" banner. Server side is src/lib/notify.ts.
 */
export type PushState = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'blocked' | 'working';

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
