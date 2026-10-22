'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { personHint, searchOptions, stepOption, type SearchOption, type SearchOrg, type SearchPerson } from '@/lib/global-search';
import './global-search.css';

/**
 * Search customers and projects from anywhere (GET /api/search): the big box on the dashboard, and the
 * header's Search button (or Ctrl/⌘+K) on every other page, which opens the same box over the page.
 * Results come as you type; ↑/↓ and Enter pick one, Esc closes. Picking someone opens their job (or
 * their details on Enquiries): it never makes an opportunity.
 */

type Results = { q: string; people: SearchPerson[]; orgs: SearchOrg[]; error: string | null };
const NONE: Results = { q: '', people: [], orgs: [], error: null };
const DELAY = 200;

/** Typing somewhere else (a box, a chat), where "/" is just a character. */
const typingIn = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(input|textarea|select)$/i.test(e.tagName));
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

/** Ctrl or ⌘ in the hint, after hydrating (the server always says Ctrl). */
const noSubscribe = () => () => {};
const useMac = () =>
  useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent), () => false);

/**
 * The box and its list. `variant`: 'inline' on the dashboard (the list drops under it), 'overlay' in the
 * header's pop-up (always open). `onDone` runs when a result is picked or Esc closes the pop-up.
 */
function SearchBox({ variant, inputRef, onDone }: { variant: 'inline' | 'overlay'; inputRef?: RefObject<HTMLInputElement | null>; onDone?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(variant === 'overlay');
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Results>(NONE);
  // Enter pressed before the results for what's typed were in: open the first one when they arrive.
  const enterFor = useRef<string | null>(null);
  const t = q.trim();

  // A moment after typing stops; the one before is dropped, and an answer for older text is ignored.
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      let next: Results;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        next = r.ok
          ? { q: t, people: (d.people ?? []) as SearchPerson[], orgs: (d.orgs ?? []) as SearchOrg[], error: null }
          : { q: t, people: [], orgs: [], error: r.status === 401 ? 'You’ve been signed out. Refresh the page to sign in again.' : d.error || 'Search isn’t working right now.' };
      } catch {
        if (ctl.signal.aborted) return;
        next = { q: t, people: [], orgs: [], error: 'Can’t search right now: are you offline?' };
      }
      if (ctl.signal.aborted) return;
      setResults(next);
      if (enterFor.current === t) {
        enterFor.current = null;
        const first = searchOptions(next.people, next.orgs, t).find((o) => o.href);
        if (first?.href) {
          setOpen(false);
          onDone?.();
          router.push(first.href);
        }
      }
    }, DELAY);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t, router, onDone]);

  const fresh = results.q === t;
  // While the next answer is on its way the last one stays up (faded), so the list doesn't flicker.
  const options = t.length >= 2 && results.q ? searchOptions(results.people, results.orgs, results.q) : [];
  const showList = open && t.length >= 1;

  function pick(o: SearchOption) {
    if (!o.href) return;
    setOpen(false);
    onDone?.();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => stepOption(options, i, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = active >= 0 ? options[active] : fresh ? options.find((o) => o.href) : undefined;
      if (chosen?.href) {
        pick(chosen);
        router.push(chosen.href);
      } else if (!fresh && t.length >= 2) {
        enterFor.current = t;
      }
    } else if (e.key === 'Tab' && variant === 'overlay') {
      // The pop-up's only stop: Tab doesn't wander off behind it.
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (variant === 'overlay') {
        // Only the pop-up closes: sheets underneath listen for Esc on window, and would close (losing what's typed) too.
        e.stopPropagation();
        onDone?.();
      } else if (q) setQ('');
      else input.current?.blur();
      setOpen(false);
    }
  }

  const status =
    t.length < 2
      ? 'Keep typing…'
      : !results.q || (!fresh && !options.length)
        ? 'Searching…'
        : fresh && results.error
          ? results.error
          : fresh && !options.length
            ? `Nobody found for “${t}”.`
            : null;

  return (
    <div
      className={`gs gs--${variant}`}
      data-hx-search-inline={variant === 'inline' ? '' : undefined}
      onBlur={(e) => {
        if (variant === 'inline' && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="gs-field">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Search customers and projects — name, postcode, phone, email or HX-ref"
          aria-label="Search customers and projects"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={variant === 'overlay'}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
            enterFor.current = null;
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button
            type="button"
            className="gs-clear"
            aria-label="Clear the search"
            onClick={() => {
              setQ('');
              setActive(-1);
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
        {variant === 'inline' && !q && <kbd aria-hidden="true">/</kbd>}
      </label>
      {variant === 'inline' && <p className="gs-tip">Name, postcode, phone, email, HX-ref or organisation</p>}
      {showList && (
        // Keeps the cursor in the box while a result is clicked: Safari doesn't focus links on click, so the
        // box's blur would close the list before the click landed.
        <div className="gs-pop" onMouseDown={(e) => e.preventDefault()}>
          {status && (
            <p className="gs-status" role="status">
              {status}
            </p>
          )}
          <ul id={listId} className={fresh ? 'gs-list' : 'gs-list is-stale'} role="listbox" aria-label="Customers, projects and organisations" aria-busy={!fresh || undefined}>
            {options.map((o, i) => {
              const firstOrg = o.kind === 'org' && options[i - 1]?.kind !== 'org';
              const body =
                o.kind === 'org' ? (
                  o.org.contact ? (
                    <>
                      <span className="gs-main">
                        <b>{o.org.contact.name}</b>
                        <small>{[o.org.contact.role, o.org.name].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className="gs-hint">Contact</span>
                    </>
                  ) : (
                    <>
                      <span className="gs-main">
                        <b>{o.org.name}</b>
                        <small>{[o.org.type, o.org.postcode].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className="gs-hint">Organisation</span>
                    </>
                  )
                ) : o.kind === 'person' ? (
                  <>
                    <span className="gs-main">
                      <b>
                        {o.person.name}
                        {o.person.ref && <span className="gs-ref">{o.person.ref}</span>}
                      </b>
                      <small>{[o.person.postcode, o.person.phone, o.person.source].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="gs-hint">{personHint(o.person)}</span>
                  </>
                ) : (
                  <>
                    <span className="gs-main">
                      <b>{o.job!.title}</b>
                      {o.job!.ref && <small>{o.job!.ref}</small>}
                    </span>
                    <span className="gs-hint">{o.job!.stage}</span>
                  </>
                );
              return (
                <li
                  key={o.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={!o.href || undefined}
                  className={`gs-opt is-${o.kind}${firstOrg ? ' is-firstorg' : ''}${i === active ? ' on' : ''}`}
                  data-group={firstOrg ? 'Organisations' : undefined}
                >
                  {o.href ? (
                    <Link href={o.href} className="gs-row" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
                      {body}
                    </Link>
                  ) : (
                    <span className="gs-row" title="They have no job yet">
                      {body}
                    </span>
                  )}
                  {o.kind === 'job' && o.person.more > 0 && o.job === o.person.jobs[o.person.jobs.length - 1] && <span className="gs-morejobs">and {o.person.more} more</span>}
                </li>
              );
            })}
          </ul>
          {variant === 'overlay' && (
            <p className="gs-keys" aria-hidden="true">
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The dashboard's search, under the greeting. "/" (when you're not typing somewhere else) puts the cursor in it. */
export function HubSearch() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      const box = input.current;
      if (!box || box.offsetParent === null) return;
      e.preventDefault();
      box.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="hub-search">
      <SearchBox variant="inline" inputRef={input} />
    </div>
  );
}

/**
 * The header's Search button, and Ctrl/⌘+K on any page: the search in a small pop-up over the page. On
 * the dashboard both just put the cursor in its own box. "/" is left alone (the CRM page's search uses it).
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  const mac = useMac();

  const show = useCallback(() => {
    const inline = document.querySelector<HTMLInputElement>('[data-hx-search-inline] input');
    if (inline && inline.offsetParent !== null) {
      inline.focus();
      inline.select();
      return;
    }
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    back.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <>
      <button type="button" className="hx-search" onClick={show} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title={`Search customers and projects (${mac ? '⌘K' : 'Ctrl+K'})`}>
        <SearchIcon />
        <span className="hx-search__label">Search</span>
        <kbd className="hx-search__kbd" aria-hidden="true">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {open &&
        createPortal(
          <div
            className="gs-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="gs-dialog" role="dialog" aria-modal="true" aria-label="Search customers and projects">
              <SearchBox variant="overlay" onDone={close} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
