'use client';

import { useEffect, useState } from 'react';
import './assign-picker.css';

/** What was picked: a customer, a job (which brings its customer), or an organisation. */
export type Picked = { enquiry_id: string | null; project_id: string | null; organisation_id: string | null; label: string };
type Job = { id: string; title: string; stage: string; ref: string | null };
type Person = { id: string; name: string; ref: string | null; postcode: string | null; phone: string | null; jobs: Job[]; more: number };
type Org = { key: string; kind: 'org' | 'contact'; name: string; sub: string };

/**
 * Find a customer or a job to attach something to (a document, a certificate): one search box over customers and their jobs
 * (and, when `orgs`, organisations). Picking a customer attaches the customer; picking one of their jobs attaches the job and
 * the customer together. Uses the same search as the header's.
 */
export function AssignPicker({ onPick, orgs = false, jobs = true, autoFocus = true }: { onPick: (p: Picked) => void; orgs?: boolean; jobs?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; people: Person[]; orgs: Org[] } | null>(null);
  const t = q.trim();
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (r.ok) setFound({ q: t, people: (d.people ?? []) as Person[], orgs: ((d.orgs ?? []) as Org[]).filter((o) => o.kind === 'org') });
      } catch {
        // Still typing.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);
  const res = found && found.q === t ? found : null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={jobs ? 'Name, postcode, phone or HX reference' : 'Name, postcode or phone'} aria-label="Find a customer or job" autoFocus={autoFocus} />
      {t.length >= 2 && (
        <ul className="dw-pick">
          {!res && <li className="crm-muted" style={{ padding: 10 }}>Looking…</li>}
          {res && !res.people.length && !(orgs && res.orgs.length) && <li className="crm-muted" style={{ padding: 10 }}>Nothing found for “{t}”.</li>}
          {res?.people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick({ enquiry_id: p.id, project_id: null, organisation_id: null, label: p.name })}>
                <b>{p.name}</b>
                <small>{['Customer', p.ref, p.postcode, p.phone].filter(Boolean).join(' · ')}</small>
              </button>
              {jobs &&
                p.jobs.map((j) => (
                  <button key={j.id} type="button" className="dw-pick__job" onClick={() => onPick({ enquiry_id: p.id, project_id: j.id, organisation_id: null, label: `${p.name} · ${j.ref ?? j.title}` })}>
                    <b>{j.ref ? `${j.ref} · ` : ''}{j.title}</b>
                    <small>Job for {p.name} · {j.stage}</small>
                  </button>
                ))}
            </li>
          ))}
          {orgs &&
            res?.orgs.map((o) => (
              <li key={o.key}>
                <button type="button" onClick={() => onPick({ enquiry_id: null, project_id: null, organisation_id: o.key.replace(/^o-/, ''), label: o.name })}>
                  <b>{o.name}</b>
                  <small>Organisation{o.sub ? ` · ${o.sub}` : ''}</small>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
