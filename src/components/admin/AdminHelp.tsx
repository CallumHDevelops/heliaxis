'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { BrandIcon } from '@/app/admin/crm/CrmUi';
import { HELP_ENTRIES } from '@/lib/admin-help/entries';
import { findHelp, isCmsPath, nameFor, type HelpEntry, type HelpLink } from '@/lib/admin-help/lookup';
import { helpHref } from '@/lib/help/context';
import './admin-help.css';

/**
 * The "?" button, bottom left of every staff page (mounted once, in src/app/admin/layout.tsx), and the panel it
 * opens: what this page is for, the main things to do, and what to watch for. The words live in
 * src/lib/admin-help/entries.ts, found by address. Bottom left because the WhatsApp and + buttons (and the dock
 * strip) are bottom right. Esc, the close button or a click elsewhere closes it; so does changing page.
 */

const GENERIC = (name: string): HelpEntry => ({
  path: '',
  title: name,
  about: 'This page does not have its own guide yet.',
  steps: [
    'Use the menu at the top (the bar at the bottom on a phone) to move around.',
    'Press the search button, or / on a keyboard, to find a customer or job.',
    'Press Save, or the main button on the page, to keep a change. Nothing is saved until you do.',
  ],
  watch: ['If something looks wrong or you are not sure, ask before you change it.'],
});

/** How far to lift the button so it clears the phone tab bar and a page's own bottom bar. */
function liftNow(): number {
  let lift = 0;
  for (const sel of ['.hx-tabs', '.svf-bar']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.position !== 'fixed' || r.height === 0) continue;
    lift = Math.max(lift, window.innerHeight - r.top);
  }
  return Math.max(0, Math.round(lift));
}

export function AdminHelp() {
  const pathname = usePathname() || '/admin';
  // The panel belongs to the page it was opened on: changing page closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const [lift, setLift] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const match = findHelp(HELP_ENTRIES, pathname);
  const entry = match?.entry ?? GENERIC(nameFor(pathname));

  // Clear the phone tab bar, and a page's own bar along the bottom.
  useEffect(() => {
    const update = () => setLift(liftNow());
    update();
    const t = window.setTimeout(update, 400);
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', update);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpenPath(null);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpenPath(null);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const more: HelpLink[] = [...(entry.more ?? [])];
  if (isCmsPath(pathname) && !more.some((l) => l.href === '/admin/cms-guide')) more.push({ label: 'The CMS guide (a short course)', href: '/admin/cms-guide' });
  const helpLink = helpHref(pathname);

  return (
    <div ref={root} className="ah" style={{ ['--ah-lift' as string]: `${lift}px` }}>
      {open && (
        <div className="ah-panel" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="ah-head">
            <h2 id={titleId} className="ah-title">
              {entry.title}
            </h2>
            <button ref={closeBtn} type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => { setOpen(false); button.current?.focus(); }}>
              Close
            </button>
          </div>
          <p className="ah-about">{entry.about}</p>
          <h3 className="ah-h">What you can do here</h3>
          <ol className="ah-steps">
            {entry.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {entry.watch && entry.watch.length > 0 && (
            <>
              <h3 className="ah-h">Worth knowing</h3>
              <ul className="ah-watch">
                {entry.watch.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
          <div className="ah-more">
            {more.map((l) => (
              <Link key={l.href} href={l.href} className="crm-link" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href={helpLink} className="crm-link" onClick={() => setOpen(false)}>
              All the Help articles
            </Link>
          </div>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="crm-btn crm-btn--solar ah-fab"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="How to use this page"
        title="How to use this page"
        onClick={() => setOpen(!open)}
      >
        <BrandIcon k="help" size={24} />
      </button>
    </div>
  );
}
