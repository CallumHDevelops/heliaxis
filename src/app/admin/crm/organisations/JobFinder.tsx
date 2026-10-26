'use client';

import { useEffect, useState } from 'react';
import type { SearchPerson } from '@/lib/global-search';

export type FoundJob = { id: string; title: string; stage: string; ref: string | null; customer: string };

/**
 * Find a job by its customer's name, postcode, phone or HX-ref (the global search), and pick it. `linked`:
 * jobs already linked, shown but not pickable. Used by Link a job on an organisation's and a contact's page.
 */
export function JobFinder({ linked, job, onPick, id = 'org-link-q' }: { linked: Set<string>; job: FoundJob | null; onPick: (j: FoundJob | null) => void; id?: string }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; jobs: FoundJob[]; error: string } | null>(null);
  const t = q.trim();

  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Search isn’t working right now.');
        const jobs = ((d.people ?? []) as SearchPerson[]).flatMap((p) => p.jobs.map((j) => ({ id: j.id, title: j.title, stage: j.stage, ref: j.ref, customer: p.name })));
        setFound({ q: t, jobs, error: '' });
      } catch (e) {
        if (!ctl.signal.aborted) setFound({ q: t, jobs: [], error: e instanceof Error ? e.message : 'Search isn’t working right now.' });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);

  if (job) {
    return (
      <div className="crmh-picked">
        <span>
          <b>{job.customer}</b>
          <small> · {[job.ref, job.title, job.stage].filter(Boolean).join(' · ')}</small>
        </span>
        <button type="button" className="crm-link" onClick={() => onPick(null)}>
          Change
        </button>
      </div>
    );
  }
  const fresh = found?.q === t;
  return (
    <div className="crmh-picker">
      <label className="crm-label" htmlFor={id}>
        Find the job
      </label>
      <input id={id} className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer name, postcode, phone or HX-ref" autoFocus autoComplete="off" enterKeyHint="search" />
      {t.length >= 2 && (
        <ul className="crmh-picker__list" aria-label="Jobs found" aria-busy={!fresh || undefined}>
          {!found || (!fresh && !found.jobs.length) ? (
            <li className="crm-muted">Searching…</li>
          ) : found.error ? (
            <li className="crm-muted">{found.error}</li>
          ) : !found.jobs.length ? (
            <li className="crm-muted">No job matches “{found.q}”.</li>
          ) : (
            found.jobs.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => onPick(j)} disabled={linked.has(j.id)}>
                  <span>
                    <b>{j.customer}</b>
                    <small>{[j.ref, j.title, j.stage, linked.has(j.id) ? 'already linked' : null].filter(Boolean).join(' · ')}</small>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
