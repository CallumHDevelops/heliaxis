'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isChatNotification, NOTIFICATIONS_CHANGED } from '@/lib/notification-refs';
import { enablePush as subscribePush, PUSH_CHANGED, readNative, shownNotifications, VAPID, type PushState } from '@/lib/push-client';

/**
 * Top-right of the admin header: the notifications bell and the signed-in user's
 * initials (menu with sign-out). The bell lists /api/notifications and can turn on
 * Web Push for this device (see src/lib/notify.ts and the service worker).
 */

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
  ref?: string | null;
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function HeaderUser({
  initials,
  name,
  email,
  signOut,
}: {
  initials: string;
  name: string;
  email: string;
  signOut: () => Promise<void>;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [push, setPush] = useState<PushState>('unsupported');
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      // Notifications on this screen that have been read since (elsewhere too) come off it.
      const shown = await shownNotifications();
      const ids = shown.map((n) => n.data?.id).filter((id): id is string => typeof id === 'string');
      const r = await fetch(`/api/notifications${ids.length ? `?shown=${ids.join(',')}` : ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.notifications ?? []);
      setUnread(d.unread ?? 0);
      const gone = new Set<string>(d.gone ?? []);
      for (const n of shown) if (gone.has(n.data?.id)) n.close();
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  // Initial load, then on focus, every minute while visible, when a push lands, and when this tab
  // changed some (e.g. reading a chat clears its notifications).
  useEffect(() => {
    const first = setTimeout(load, 0);
    const tick = setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    // Focus and visibilitychange arrive together when switching back to the tab: load once.
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastLoad.current > 2000 && load();
    const onSw = (e: MessageEvent) => e.data?.type === 'NOTIFICATION' && load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
      navigator.serviceWorker?.removeEventListener('message', onSw);
    };
  }, [load]);

  // Unread count on the app icon (iPhone Home Screen app; the service worker updates it on each push too).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (unread ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.())?.catch(() => {});
  }, [unread]);

  // What can this device do about push?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let state: PushState;
      const native = readNative();
      if (native) {
        // Android app: notifications are native, managed in Android's settings.
        state = native.enabled ? 'native' : 'native-off';
      } else if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        state = 'unsupported';
      } else if (!VAPID) {
        state = 'unconfigured';
      } else if (Notification.permission === 'denied') {
        state = 'blocked';
      } else {
        const reg = await navigator.serviceWorker.getRegistration('/admin');
        const sub = await reg?.pushManager.getSubscription();
        state = sub && Notification.permission === 'granted' ? 'on' : 'off';
        // Keep the server's copy fresh (subscriptions can rotate).
        if (sub && state === 'on') {
          fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) }).catch(() => {});
        }
      }
      if (!cancelled) setPush(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setPush('working');
    setPush(await subscribePush());
  }

  // Turned on elsewhere on the page (e.g. the WhatsApp banner).
  useEffect(() => {
    const onChange = (e: Event) => setPush((e as CustomEvent<PushState>).detail);
    window.addEventListener(PUSH_CHANGED, onChange);
    return () => window.removeEventListener(PUSH_CHANGED, onChange);
  }, []);

  async function disablePush() {
    setPush('working');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/admin');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setPush('off');
    }
  }

  async function markRead(body: { ids: string[] } | { all: true }) {
    const ids = 'all' in body ? null : new Set(body.ids);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (!n.read_at && (!ids || ids.has(n.id)) ? { ...n, read_at: now } : n)));
    setUnread((u) => (ids ? Math.max(0, u - items.filter((n) => !n.read_at && ids.has(n.id)).length) : 0));
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  const closeBell = useCallback(() => setBellOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const bellRef = useOutsideClose(bellOpen, closeBell);
  const menuRef = useOutsideClose(menuOpen, closeMenu);
  const nudge = push === 'off';
  // Read WhatsApp chat notifications are noise: they go (the server leaves them out too).
  const listed = items.filter((n) => !n.read_at || !isChatNotification(n));

  return (
    <div className="hu">
      <div className="hu-wrap" ref={bellRef}>
        <button
          type="button"
          className="hu-bell"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          aria-expanded={bellOpen}
          onClick={() => {
            setBellOpen((o) => !o);
            setMenuOpen(false);
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
          {unread > 0 && <span className="hu-count">{unread > 9 ? '9+' : unread}</span>}
          {!unread && nudge && <span className="hu-dot" />}
        </button>
        {bellOpen && (
          <div className="hu-panel" role="dialog" aria-label="Notifications">
            <div className="hu-panel-head">
              <b>Notifications</b>
              {unread > 0 && (
                <button type="button" className="hu-link" onClick={() => markRead({ all: true })}>
                  Mark all read
                </button>
              )}
            </div>
            {nudge && (
              <div className="hu-push">
                <span>Get a notification on this device for new WhatsApp messages, enquiries and tasks.</span>
                <button type="button" className="hu-btn" onClick={enablePush}>
                  Turn on
                </button>
              </div>
            )}
            <ul className="hu-list">
              {listed.length === 0 && <li className="hu-empty">Nothing yet — you&apos;re all caught up.</li>}
              {listed.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'is-unread'}>
                  <Link
                    href={n.href || '/admin'}
                    onClick={() => {
                      if (!n.read_at) void markRead({ ids: [n.id] });
                      setBellOpen(false);
                    }}
                  >
                    <span className="hu-title">{n.title}</span>
                    {n.body && <span className="hu-body">{n.body}</span>}
                    <span className="hu-time">{ago(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hu-panel-foot">
              {push === 'on' && (
                <>
                  <span>Notifications are on for this device.</span>
                  <button type="button" className="hu-link" onClick={disablePush}>
                    Turn off
                  </button>
                </>
              )}
              {push === 'blocked' && <span>Notifications are blocked — allow them for this site in your browser or phone settings.</span>}
              {push === 'native' && <span>Notifications come through the Heliaxis app. Change them in Settings → Apps → Heliaxis → Notifications.</span>}
              {push === 'native-off' && <span>Notifications are off for the Heliaxis app. Turn them on in Settings → Apps → Heliaxis → Notifications.</span>}
              {push === 'working' && <span>One moment…</span>}
              {push === 'unsupported' && <span>This browser can&apos;t show notifications — install the app or use Chrome.</span>}
            </div>
          </div>
        )}
      </div>

      <div className="hu-wrap" ref={menuRef}>
        <button
          type="button"
          className="hu-avatar"
          title={name}
          aria-label={`Account: ${name}`}
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((o) => !o);
            setBellOpen(false);
          }}
        >
          {initials}
        </button>
        {menuOpen && (
          <div className="hu-panel hu-menu" role="menu">
            <div className="hu-who">
              <b>{name}</b>
              {email && email !== name && <span>{email}</span>}
            </div>
            <Link href="/admin/app" className="hu-item" role="menuitem" onClick={closeMenu}>
              Android app
            </Link>
            <form action={signOut} data-signout>
              <button type="submit" className="hu-item" role="menuitem">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      <style>{`
        .hu { display: flex; align-items: center; gap: .4rem; margin-left: .25rem; }
        .hu-wrap { position: relative; }
        .hu-bell, .hu-avatar { position: relative; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
          cursor: pointer; font: inherit; }
        .hu-bell { background: transparent; border: 1px solid rgba(33,31,24,.14); color: #211f18; }
        .hu-bell:hover { background: rgba(33,31,24,.05); }
        .hu-avatar { background: #211f18; color: #f8bc1e; border: 0; font-weight: 800; font-size: .8rem; letter-spacing: .02em; }
        .hu-count { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px;
          background: #b3412e; color: #fff; font-size: .66rem; font-weight: 800; display: grid; place-items: center; box-sizing: border-box; }
        .hu-dot { position: absolute; top: 4px; right: 5px; width: 8px; height: 8px; border-radius: 50%; background: #f8bc1e; }
        .hu-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 40; width: 340px; max-width: calc(100vw - 24px);
          background: #fffdf8; border: 1px solid rgba(33,31,24,.14); border-radius: 4px; box-shadow: 0 12px 32px rgba(0,0,0,.14);
          color: #211f18; text-align: left; }
        .hu-panel-head, .hu-panel-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 14px; }
        .hu-panel-head { border-bottom: 1px solid rgba(33,31,24,.1); }
        .hu-panel-foot { border-top: 1px solid rgba(33,31,24,.1); font-size: .78rem; color: #6e6a5e; }
        .hu-panel-foot:empty { display: none; }
        .hu-link { background: none; border: 0; padding: 0; font: inherit; font-size: .78rem; font-weight: 700; color: #c77f04; cursor: pointer; }
        .hu-push { display: flex; gap: 10px; align-items: center; margin: 10px 14px 0; padding: 10px; border-radius: 4px;
          background: rgba(248,188,30,.15); font-size: .82rem; }
        .hu-btn { flex: 0 0 auto; font: inherit; font-size: .8rem; font-weight: 800; padding: .4rem .7rem; border-radius: 2px;
          border: 0; background: #f8bc1e; color: #211f18; cursor: pointer; }
        .hu-list { list-style: none; margin: 0; padding: 6px 0; max-height: 60vh; overflow-y: auto; }
        .hu-list a { display: flex; flex-direction: column; gap: 2px; padding: 9px 14px 9px 26px; text-decoration: none; color: inherit; position: relative; }
        .hu-list a:hover { background: rgba(33,31,24,.04); }
        .hu-list li.is-unread a::before { content: ''; position: absolute; left: 11px; top: 15px; width: 7px; height: 7px; border-radius: 50%; background: #f8bc1e; }
        .hu-title { font-size: .88rem; font-weight: 700; }
        .hu-body { font-size: .82rem; color: #4a473e; overflow-wrap: anywhere; }
        .hu-time { font-size: .72rem; color: #6e6a5e; }
        .hu-empty { padding: 18px 14px; font-size: .85rem; color: #6e6a5e; }
        .hu-menu { width: 230px; padding: 6px 0; }
        .hu-who { padding: 8px 14px 10px; border-bottom: 1px solid rgba(33,31,24,.1); margin-bottom: 4px; }
        .hu-who b { display: block; font-size: .9rem; }
        .hu-who span { font-size: .78rem; color: #6e6a5e; overflow-wrap: anywhere; }
        .hu-menu form { margin: 0; }
        .hu-item { display: block; width: 100%; text-align: left; padding: 8px 14px; font: inherit; font-size: .88rem; font-weight: 600;
          color: #211f18; background: none; border: 0; cursor: pointer; text-decoration: none; box-sizing: border-box; }
        .hu-item:hover { background: rgba(33,31,24,.05); }
      `}</style>
    </div>
  );
}
