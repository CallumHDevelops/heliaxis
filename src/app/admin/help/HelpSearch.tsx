'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metisHref } from '@/lib/help/context';
import { highlightParts, prepareIndex, searchPrepared, type HelpHit, type HelpIndexEntry } from '@/lib/help/search';

/** `text` with the words that match `q` marked. */
function Marked({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

function Results({ hits, q }: { hits: HelpHit[]; q: string }) {
  return (
    <ul className="hp-results">
      {hits.map((h) => (
        <li key={h.entry.url}>
          <Link href={h.entry.url} className="hp-result">
            <span className="hp-result__sec">{h.entry.sectionTitle}</span>
            <span className="hp-result__title">
              <Marked text={h.entry.title} q={q} />
            </span>
            {h.entry.summary && (
              <span className="hp-result__sum">
                <Marked text={h.entry.summary} q={q} />
              </span>
            )}
            {h.heading && (
              <span className="hp-result__part">
                In “<Marked text={h.heading} q={q} />”
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The search box on Help's home: instant, in the browser, over the index the server built. What's typed is
 * kept in the address (?q=) so a search can be shared; "/" jumps to the box on a computer; Enter opens the
 * first result. While there's nothing typed, `children` (the sections) show instead of results.
 */
export function HelpSearch({ index, initial, metis, children }: { index: HelpIndexEntry[]; initial: string; metis: boolean; children: ReactNode }) {
  const router = useRouter();
  // The address first: coming Back to a search, the page can come from the browser's cache without it.
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? initial);
  const box = useRef<HTMLInputElement>(null);
  const prepared = useMemo(() => prepareIndex(index), [index]);
  const searching = q.trim().length > 0;
  const hits = useMemo(() => (searching ? searchPrepared(prepared, q, { limit: 30 }) : []), [prepared, q, searching]);
  // Nothing has every word: the ones with most of them, offered as close matches.
  const close = useMemo(() => (searching && !hits.length ? searchPrepared(prepared, q, { mode: 'any', limit: 5 }) : []), [prepared, q, searching, hits.length]);

  // "/" anywhere on the page (not while typing somewhere) puts you in the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      box.current?.focus();
      box.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function restart() {
    change('');
    box.current?.focus();
  }

  function change(v: string) {
    setQ(v);
    // In the address bar, without a trip to the server.
    const url = new URL(window.location.href);
    if (v.trim()) url.searchParams.set('q', v);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="hp-search">
      <form
        role="search"
        className="hp-field"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) router.push(hits[0].entry.url);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={box}
          type="search"
          value={q}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && q) {
              e.preventDefault();
              change('');
            }
          }}
          placeholder="Search help, e.g. “add a template”"
          aria-label="Search help"
          autoComplete="off"
          enterKeyHint="search"
        />
        {q ? (
          <button type="button" className="hp-clear" aria-label="Clear the search" onClick={restart}>
            ×
          </button>
        ) : (
          <kbd className="hp-kbd" title="Press / to search">
            /
          </kbd>
        )}
      </form>

      <p className="hx-sr" role="status">
        {searching ? (hits.length ? `${hits.length} article${hits.length === 1 ? '' : 's'} found` : 'No articles found') : ''}
      </p>

      {!searching ? (
        children
      ) : hits.length ? (
        <section aria-label="Search results">
          <p className="hp-count">
            {hits.length} article{hits.length === 1 ? '' : 's'} for “{q.trim()}”
          </p>
          <Results hits={hits} q={q} />
          {metis && (
            <p className="hp-after">
              Not what you need? <Link href={metisHref(q)}>Ask Metis</Link> in your own words.
            </p>
          )}
        </section>
      ) : (
        <section className="hp-empty" aria-label="No results">
          <p className="hp-empty__title">No article has all of “{q.trim()}”.</p>
          <ul className="hp-empty__tips">
            <li>Check the spelling, or use fewer words.</li>
            <li>Try the name on the button or menu, e.g. “templates” or “Pipeline”.</li>
            {metis && (
              <li>
                <Link href={metisHref(q)}>Ask Metis</Link> in your own words.
              </li>
            )}
          </ul>
          {close.length > 0 && (
            <>
              <h2 className="hp-h2">These have some of your words</h2>
              <Results hits={close} q={q} />
            </>
          )}
          <button type="button" className="hp-btn" onClick={restart}>
            Show all sections
          </button>
        </section>
      )}
    </div>
  );
}
