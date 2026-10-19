'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  chooseDock,
  COOKIE_ATTRS,
  cookieFrom,
  CRM_VIEW_COOKIE,
  crmViewOf,
  DOCK_COOKIE,
  dockCookieValue,
  dockDefaultFor,
  effectiveDock,
  parseDockCookie,
  type DockAccess,
  type DockChoice,
} from './dock-shared';
import { WhatsAppDock } from './WhatsAppDock';
import './dock.css';

/**
 * Wraps every admin page (src/app/admin/layout.tsx) and decides this page's WhatsApp dock: open, the
 * strip, hidden or none, from the URL and the person's remembered choice. The wrapper adds no box
 * (display: contents); it carries data-dock for the CSS (the page gets narrower by --hx-dock) and
 * renders the dock itself after the page. All of it renders on the server, so the first paint is
 * already right.
 */

/** Media queries, for behaviour only (CSS does the layout). False on the server and while hydrating. */
function useMedia(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

function saveChoice(me: string, choice: DockChoice) {
  try {
    document.cookie = `${DOCK_COOKIE}=${dockCookieValue(me, choice)}; ${COOKIE_ATTRS}`;
  } catch {
    // Cookies off: it still opens and folds, it just isn't remembered.
  }
}

/** Cookies have no change event: read afresh on each render (every page change) and on focus. */
const onFocus = (cb: () => void) => {
  window.addEventListener('focus', cb);
  return () => window.removeEventListener('focus', cb);
};

export function DockFrame({
  me,
  access,
  choice: savedChoice,
  crmView: savedView,
  children,
}: {
  me: string;
  access: DockAccess;
  /** The hx-dock cookie as the server saw it. */
  choice: string;
  /** The hx-crm-view cookie (written by the CRM page) as the server saw it. */
  crmView: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const viewCookie = useSyncExternalStore(onFocus, () => cookieFrom(document.cookie, CRM_VIEW_COOKIE), () => savedView);
  const def = dockDefaultFor(pathname, crmViewOf(params?.get('view'), viewCookie));
  const [choice, setChoice] = useState(() => parseDockCookie(savedChoice, me));
  const state = effectiveDock(def, choice, access);
  const wide1280 = useMedia('(min-width: 1280px)');
  const wide760 = useMedia('(min-width: 761px)');
  // The overlay belongs to the page it was opened on: changing page closes it (as does the window
  // growing wide enough for the docked panel, or narrow enough to be a phone).
  const [overlayPath, setOverlayPath] = useState<string | null>(null);
  const overlay = overlayPath === pathname && wide760 && (state === 'collapsed' || (state === 'open' && !wide1280));

  /** It stays how you left it, per kind of page; only where it docks (1280px and up). */
  function remember(open: boolean) {
    const next = chooseDock(choice, def, open);
    setChoice(next);
    saveChoice(me, next);
  }

  function onOpen() {
    if (state !== 'open' && state !== 'collapsed') return;
    if (window.matchMedia('(min-width: 1280px)').matches) {
      setOverlayPath(null);
      if (state !== 'open') remember(true);
    } else {
      setOverlayPath(pathname);
    }
  }

  function onFold() {
    if (overlay) setOverlayPath(null);
    else if (state === 'open') remember(false);
  }

  const onCloseOverlay = useCallback(() => setOverlayPath(null), []);

  return (
    <div className="hx-frame" data-dock={state} data-dock-overlay={overlay ? '1' : undefined}>
      {children}
      <WhatsAppDock
        me={me}
        access={access}
        pathname={pathname}
        state={state}
        overlay={overlay}
        wide1280={wide1280}
        wide760={wide760}
        onOpen={onOpen}
        onFold={onFold}
        onCloseOverlay={onCloseOverlay}
      />
    </div>
  );
}
