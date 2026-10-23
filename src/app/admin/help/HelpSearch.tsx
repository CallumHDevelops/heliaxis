'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metisHref } from '@/lib/help/context';
import { highlightParts, prepareIndex, queryTerms, searchPrepared, type HelpHit, type HelpIndexEntry, type PreparedEntry } from '@/lib/help/search';

/** What the box puts in the address for `v` (?q= is left out for nothing but spaces). */
const forAddress = (v: string) => (v.trim() ? v : '');

/**
 * The search index (/api/help/search-index), fetched once per version the first time the box is used, and
 * kept for the rest of the visit: going back to Help's home doesn't fetch it again (nor, while the content
 * is the same, does the browser, which keeps it).
 */
type Index = { version: string; prepared: PreparedEntry[] };
let kept: Index | null = null;
let coming: { version: string; promise: Promise<Index> } | null = null;

function fetchIndex(version: string): Promise<Index> {
  if (kept?.version === version) return Promise.resolve(kept);
  if (coming?.version === version) return coming.promise;
  const promise = fetch(`/api/help/search-index?v=${encodeURIComponent(version)}`, { credentials: 'same-origin' })
    .then((r) => {
      if (!r.ok) throw new Error(`search index ${r.status}`);
      return r.json() as Promise<HelpIndexEntry[]>;
    })
    .then((entries) => (kept = { version, prepared: prepareIndex(entries) }))
    .finally(() => {
      if (coming?.promise === promise) coming = null;
    });
  coming = { version, promise };
  return promise;
}

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
 * The search box on Help's home: instant, in the browser, over the index the server built (fetched the first
 * time the box is used; a search in the address shows the results the server worked out until then). What's
 * typed is kept in the address (?q=) so a search can be shared, and the box follows the address when it
 * changes some other way (Help in the account menu, from Help's home, clears it); "/" jumps to the box on a
 * computer; Enter opens the first result. While there's nothing typed, `children` (the sections) show instead
 * of results.
 */
export function HelpSearch({
  version,
  initial,
  initialHits,
  initialClose,
  metis,
  children,
}: {
  version: string;
  initial: string;
  initialHits: HelpHit[];
  initialClose: HelpHit[];
  metis: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  // The address first: coming Back to a search, the page can come from the browser's cache without it.
  const params = useSearchParams();
  const inAddress = params.get('q') ?? '';
  const [q, setQ] = useState(() => params.get('q') ?? initial);
  // The box follows the address when something else changes it. Typing changes it too, a moment later
  // (what's typed goes in at once): `sent` is what this box has put there that the address hasn't caught
  // up with yet, so an earlier one of those, arriving while you type, isn't taken for a change.
  const [seen, setSeen] = useState(inAddress);
  const [sent, setSent] = useState<string[]>([]);
  if (inAddress !== seen) {
    setSeen(inAddress);
    if (inAddress === forAddress(q)) setSent([]);
    else if (!sent.includes(inAddress)) {
      setSent([]);
      setQ(inAddress);
    }
  }
  const [index, setIndex] = useState<Index | null>(() => (kept?.version === version ? kept : null));
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const ready = index?.version === version ? index.prepared : null;
  const searching = q.trim().length > 0;
  // More than one word to look for: nothing found means nothing has all of them ("has all of" makes no sense for one).
  const several = queryTerms(q).length > 1;
  // Before the index has come: the server's results, for the search it was given; otherwise none yet.
  const early = !ready && q === initial;
  const hits = useMemo(() => (!searching ? [] : ready ? searchPrepared(ready, q, { limit: 30 }) : early ? initialHits : null), [searching, ready, q, early, initialHits]);
  // Nothing has every word: the ones with most of them, offered as close matches.
  const close = useMemo(
    () => (!searching || !hits || hits.length ? [] : ready ? searchPrepared(ready, q, { mode: 'any', limit: 5 }) : early ? initialClose : []),
    [searching, hits, ready, q, early, initialClose],
  );

  const load = useCallback(() => {
    fetchIndex(version).then(
      (i) => setIndex(i),
      () => setFailed(true),
    );
  }, [version]);

  // Something to search and no index yet: fetch it.
  useEffect(() => {
    if (searching && !ready && !failed) load();
  }, [searching, ready, failed, load]);

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
    setFailed(false);
    setSent((s) => [...s.slice(-30), forAddress(v)]);
    // In the address bar, without a trip to the server.
    const url = new URL(window.location.href);
    if (forAddress(v)) url.searchParams.set('q', v);
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
          if (hits?.[0]) router.push(hits[0].entry.url);
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
          // About to search: fetch the index now, so the first results don't wait for it.
          onFocus={() => !ready && !failed && load()}
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
        {searching && hits ? (hits.length ? `${hits.length} article${hits.length === 1 ? '' : 's'} found` : 'No articles found') : ''}
      </p>

      {!searching ? (
        children
      ) : !hits ? (
        failed ? (
          <section className="hp-empty" aria-label="Search unavailable">
            <p className="hp-empty__title">Search couldn’t load.</p>
            <ul className="hp-empty__tips">
              <li>Check your connection, then try again.</li>
            </ul>
            <button type="button" className="hp-btn" onClick={() => setFailed(false)}>
              Try again
            </button>
          </section>
        ) : (
          <p className="hp-count" aria-busy="true">
            Searching…
          </p>
        )
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
          <p className="hp-empty__title">{several ? `No article has all of “${q.trim()}”.` : `Nothing in Help mentions “${q.trim()}”.`}</p>
          <ul className="hp-empty__tips">
            <li>{several ? 'Check the spelling, or use fewer words.' : 'Check the spelling, or try another word for it.'}</li>
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
