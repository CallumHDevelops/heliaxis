'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { DOCK_EVENTS, type WaCounts } from './whatsapp/dock-shared';

/**
 * The desktop header menu: a dropdown per group, from the same groups as the phone "More" sheet
 * (AdminShell passes only what this person can open). A group of one is a plain link, unless it's
 * marked `dropdown`. Dropdowns open on click, or on hover with a mouse, and close on a click outside,
 * Escape, or picking a page. The group holding this URL's page lights up.
 */

/**
 * `icon` is shown as given (AdminShell wraps it in .hx-dd__icon); `reload` opens it with a full page load;
 * `badge` is a count beside it, kept live in the browser for `liveBadge: 'wa'` (unread WhatsApp people,
 * from the dock's hx:wa-counts). A group's button shows the total of its items' counts.
 */
export type MenuItem = { href: string; label: string; icon?: ReactNode; reload?: boolean; badge?: number; liveBadge?: 'wa' };
/** `dropdown`: a dropdown under its own name even with one page in it (e.g. Finance → Purchase orders). */
export type MenuGroup = { id: string; label: string; items: MenuItem[]; dropdown?: boolean };

// Not a page here (e.g. /api/sso/rams): a plain link, so it's never prefetched. As the phone tab bar.
const isPage = (href: string) => !href.startsWith('/api/') && !/^https?:/.test(href);

/** The item for this URL: the longest href it sits under ("/admin" only on the dashboard itself). */
function currentHref(groups: MenuGroup[], path: string) {
  let best = '';
  for (const g of groups) {
    for (const { href } of g.items) {
      if (!isPage(href) || href.length <= best.length) continue;
      if (path === href || (href !== '/admin' && path.startsWith(`${href}/`))) best = href;
    }
  }
  return best;
}

const groupEl = (root: HTMLElement | null, id: string) => root?.querySelector<HTMLElement>(`[data-group="${id}"]`) ?? null;
const itemsOf = (root: HTMLElement | null, id: string) => Array.from(groupEl(root, id)?.querySelectorAll<HTMLElement>('.hx-dd__item') ?? []);

const Badge = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="hx-badge">
      {n > 99 ? '99+' : n}
      <span className="hx-sr"> unread</span>
    </span>
  ) : null;

function ItemLink({
  item,
  className,
  current,
  badge = 0,
  onPick,
  onKeyDown,
}: {
  item: MenuItem;
  className: string;
  current: boolean;
  badge?: number;
  onPick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  const props = {
    className: current ? `${className} is-current` : className,
    'aria-current': current ? ('page' as const) : undefined,
    onClick: onPick,
    onKeyDown,
  };
  const body = (
    <>
      {item.icon}
      {item.label}
      <Badge n={badge} />
    </>
  );
  if (item.reload || !isPage(item.href)) return <a href={item.href} {...props}>{body}</a>;
  return <Link href={item.href} {...props}>{body}</Link>;
}

const chevron = (
  <svg className="hx-dd__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** `fallback`: the item to mark when the URL matches none (e.g. setup pages count as the dashboard). */
export function TopMenu({ groups, fallback }: { groups: MenuGroup[]; fallback?: string }) {
  const pathname = usePathname();
  const current = currentHref(groups, pathname) || fallback || '';
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Unread WhatsApp people, as the dock last counted them (until then, the count the page came with).
  const [liveWa, setLiveWa] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLiveWa((e as CustomEvent<WaCounts>).detail.unread);
    window.addEventListener(DOCK_EVENTS.counts, on);
    return () => window.removeEventListener(DOCK_EVENTS.counts, on);
  }, []);
  const badgeOf = (i: MenuItem) => (i.liveBadge === 'wa' && liveWa !== null ? liveWa : (i.badge ?? 0));
  // Opened by the mouse passing over it, so it closes when the mouse leaves (a click keeps it open).
  const byHover = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => {
    clearTimeout(leaveTimer.current);
    byHover.current = false;
    setOpen(null);
  }, []);

  // A click outside or Escape closes it; Escape from inside puts focus back on its button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!groupEl(listRef.current, open)?.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const group = groupEl(listRef.current, open);
      const inside = group?.contains(document.activeElement);
      close();
      if (inside) group?.querySelector<HTMLElement>('.hx-dd__btn')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Keep the open dropdown on screen: nudged left when it would run past the header's right edge
  // (which stops short of the WhatsApp dock, so it never slides under it).
  useLayoutEffect(() => {
    const panel = open ? groupEl(listRef.current, open)?.querySelector<HTMLElement>('.hx-dd__panel') : null;
    if (!panel) return;
    const place = () => {
      panel.style.left = '';
      const edge = panel.closest('.hx-header')?.getBoundingClientRect().right ?? document.documentElement.clientWidth;
      const over = panel.getBoundingClientRect().right - (edge - 12);
      if (over > 0) panel.style.left = `${-over}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  /** From the keyboard: open a group and move focus into it. */
  function openAt(id: string, at: 'first' | 'last') {
    byHover.current = false;
    flushSync(() => setOpen(id));
    const items = itemsOf(listRef.current, id);
    items[at === 'first' ? 0 : items.length - 1]?.focus();
  }

  /** Left and right along the top row. */
  function onRowKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tops = Array.from(listRef.current?.querySelectorAll<HTMLElement>(':scope > li > .hx-nav__link') ?? []);
    const i = tops.indexOf(e.currentTarget);
    if (i < 0) return;
    e.preventDefault();
    close();
    tops[(i + (e.key === 'ArrowRight' ? 1 : -1) + tops.length) % tops.length]?.focus();
  }

  /** Up, down, Home and End inside an open dropdown. */
  function onPanelKey(e: KeyboardEvent<HTMLElement>, id: string) {
    const items = itemsOf(listRef.current, id);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
    if (!(e.key in moves) || !items.length) return;
    e.preventDefault();
    items[(moves[e.key] + items.length) % items.length].focus();
  }

  return (
    <ul className="hx-menu" ref={listRef}>
      {groups.map((g) => {
        const active = g.items.some((i) => i.href === current);
        const total = g.items.reduce((n, i) => n + badgeOf(i), 0);
        if (g.items.length === 1 && !g.dropdown) {
          return (
            <li key={g.id}>
              <ItemLink item={{ ...g.items[0], icon: undefined }} className="hx-nav__link" current={active} badge={total} onKeyDown={onRowKey} />
            </li>
          );
        }
        const isOpen = open === g.id;
        return (
          <li
            key={g.id}
            data-group={g.id}
            className={isOpen ? 'hx-dd is-open' : 'hx-dd'}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              clearTimeout(leaveTimer.current);
              if (isOpen) return;
              byHover.current = true;
              setOpen(g.id);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse' && byHover.current) leaveTimer.current = setTimeout(close, 200);
            }}
            onBlur={(e) => {
              // Tabbing on past the last page closes it.
              if (isOpen && !e.currentTarget.contains(e.relatedTarget as Node | null)) close();
            }}
          >
            <button
              type="button"
              className={active ? 'hx-nav__link hx-dd__btn is-active' : 'hx-nav__link hx-dd__btn'}
              aria-expanded={isOpen}
              aria-controls={`hx-menu-${g.id}`}
              // Its pages are hidden while it's shut, so say here that the current one is in it.
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                if (!isOpen) {
                  byHover.current = false;
                  setOpen(g.id);
                } else if (byHover.current) {
                  // Clicked while the mouse had it open: keep it open.
                  byHover.current = false;
                } else close();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  openAt(g.id, e.key === 'ArrowDown' ? 'first' : 'last');
                } else onRowKey(e);
              }}
            >
              {g.label}
              <Badge n={total} />
              {chevron}
            </button>
            <div id={`hx-menu-${g.id}`} className="hx-dd__panel" hidden={!isOpen} onKeyDown={(e) => onPanelKey(e, g.id)}>
              <ul>
                {g.items.map((i) => (
                  <li key={i.href}>
                    <ItemLink item={i} className="hx-dd__item" current={i.href === current} badge={badgeOf(i)} onPick={close} />
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
