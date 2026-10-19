'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { stageLabel, surveyTypeFor } from '@/lib/crm/stages';

/**
 * "+ New survey": find the customer, pick their job (or start a new opportunity for them), pick
 * solar or heat pump, and the survey opens. Needs signal. Uses the CRM's job list
 * (GET /api/crm/projects), searched on the phone.
 */

type Project = { id: string; enquiry_id: string; title: string | null; stage: string; products: string[] | null; postcode: string | null; customer: string; phone: string | null };
type Lead = { id: string; name: string; phone: string | null; email: string | null; postcode: string | null };
type Customer = { id: string; name: string; postcode: string | null; phone: string | null; projects: Project[] };
type Pick = { customer: Customer; project: Project | null };
type Kind = 'solar' | 'ashp';

const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');
const fold = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function NewSurveySheet({ onClose }: { onClose: () => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [kind, setKind] = useState<Kind>('solar');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch('/api/crm/projects', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? 'Sign in again.' : 'Couldn’t load the customers.'))))
      .then((j: { projects?: Project[]; unassigned?: Lead[] }) => {
        if (!alive) return;
        const byId = new Map<string, Customer>();
        for (const p of j.projects ?? []) {
          if (p.stage === 'lost') continue;
          const c = byId.get(p.enquiry_id) ?? { id: p.enquiry_id, name: p.customer || p.title || 'Customer', postcode: p.postcode, phone: p.phone, projects: [] };
          c.projects.push(p);
          byId.set(p.enquiry_id, c);
        }
        for (const l of j.unassigned ?? []) if (!byId.has(l.id)) byId.set(l.id, { id: l.id, name: l.name, postcode: l.postcode, phone: l.phone, projects: [] });
        setCustomers([...byId.values()]);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Couldn’t load the customers.'));
    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => {
    if (!customers) return [];
    const t = fold(q);
    const d = digits(q);
    if (!t) return customers.slice(0, 12);
    return customers
      .filter(
        (c) =>
          fold(c.name).includes(t) ||
          fold(c.postcode).replace(/\s/g, '').includes(t.replace(/\s/g, '')) ||
          (d.length >= 4 && digits(c.phone).includes(d)) ||
          c.projects.some((p) => fold(p.title).includes(t))
      )
      .slice(0, 20);
  }, [customers, q]);

  function choose(customer: Customer, project: Project | null) {
    setPick({ customer, project });
    setKind(surveyTypeFor(project?.products ?? []) === 'ashp' ? 'ashp' : 'solar');
    setError(null);
  }

  async function start() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      let projectId = pick.project?.id ?? null;
      if (!projectId) {
        const r = await fetch('/api/crm/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enquiry_id: pick.customer.id, products: kind === 'ashp' ? ['heatpump'] : ['solar'] }),
          cache: 'no-store',
        });
        const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!r.ok || !j.id) throw new Error(j.error || 'Couldn’t make the opportunity. Try again.');
        projectId = j.id;
      }
      const r = await fetch('/api/crm/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, type: kind }),
        cache: 'no-store',
      });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error || 'Couldn’t start the survey. Try again.');
      location.href = `/admin/surveys/${j.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="svf-sheet" role="dialog" aria-modal="true" aria-label="New survey" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="svf-sheet__panel">
        <div className="svf-sheet__head">
          <strong>New survey</strong>
          <button type="button" className="svf-btn svf-btn--ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <div className="svf-sheet__body">
          {error && (
            <p className="svf-banner svf-banner--err" role="alert">
              {error}
            </p>
          )}

          {!pick ? (
            <>
              <label className="svf-label" htmlFor="svl-new-q">
                Customer
              </label>
              <input
                id="svl-new-q"
                className="svf-input"
                type="search"
                autoFocus
                placeholder="Name, postcode or phone"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {!customers && !error && <p className="svf-help">Loading customers…</p>}
              {customers && !matches.length && (
                <p className="svf-help">
                  No customer found. Add them in the CRM first (<Link href="/admin/crm">CRM → + New</Link>).
                </p>
              )}
              <ul className="svl-pick">
                {matches.map((c) => (
                  <li key={c.id} className="svl-pick__customer">
                    <p className="svl-pick__name">
                      {c.name}
                      {c.postcode ? <span> · {c.postcode}</span> : null}
                    </p>
                    {c.projects.map((p) => (
                      <button key={p.id} type="button" className="svf-list__btn" onClick={() => choose(c, p)}>
                        <span>{p.title || 'Job'}</span>
                        <span className="svf-list__where">{stageLabel(p.stage)} ›</span>
                      </button>
                    ))}
                    <button type="button" className="svf-list__btn svf-list__btn--new" onClick={() => choose(c, null)}>
                      <span>+ New opportunity for {c.name.split(' ')[0]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="svf-stack">
              <p className="svf-note">
                <strong>{pick.customer.name}</strong>
                {pick.project ? `: ${pick.project.title || 'Job'} (${stageLabel(pick.project.stage)})` : ': a new opportunity'}
              </p>
              <p className="svf-label">What kind of survey?</p>
              <div className="svf-chips" role="radiogroup" aria-label="What kind of survey">
                {(
                  [
                    ['solar', 'Solar and battery'],
                    ['ashp', 'Heat pump (SimpliHeat)'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'svf-pill is-on' : 'svf-pill'} onClick={() => setKind(k)}>
                    {kind === k ? '✓ ' : ''}
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" className="svf-btn svf-btn--solar svf-btn--wide" disabled={busy} onClick={() => void start()}>
                {busy ? 'Starting…' : 'Start survey'}
              </button>
              <button type="button" className="svf-btn svf-btn--ghost svf-btn--wide" disabled={busy} onClick={() => setPick(null)}>
                ← Pick someone else
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
