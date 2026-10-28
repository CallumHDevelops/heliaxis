'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { mailHref, matchesPerson, telHref, waMeHref, type PersonRow } from '@/lib/organisations/shared';
import { Sheet } from '../CrmUi';
import { ContactForm } from '../organisations/OrgForms';
import '../organisations/orgs.css';

type Person = { contact_id: string; role: string | null; name: string; mobile: string | null; email: string | null; organisation: string | null };

const ROLES = ['Husband', 'Wife', 'Partner', 'Tenant', 'Landlord', 'Site contact', 'Accountant', 'Builder', 'Other'];

/**
 * "People on this job": everyone besides the customer, each a contact with a role (a couple, a landlord and the tenant, a site
 * contact). Add from Contacts or make a new one on the spot; call, WhatsApp or email them from here.
 */
export function PeopleCard({ projectId, onChanged }: { projectId: string; onChanged?: () => Promise<void> | void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [ready, setReady] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const [why, setWhy] = useState('');

  async function load() {
    const r = await fetch(`/api/crm/projects/${projectId}/people`, { cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { ready?: boolean; people?: Person[]; error?: string };
    setReady(d.ready !== false);
    setWhy(d.error ?? '');
    setPeople(d.people ?? []);
  }
  useEffect(() => {
    let gone = false;
    fetch(`/api/crm/projects/${projectId}/people`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { ready?: boolean; people?: Person[]; error?: string }) => {
        if (gone) return;
        setReady(d.ready !== false);
        setWhy(d.error ?? '');
        setPeople(d.people ?? []);
      })
      .catch(() => !gone && setPeople([]));
    return () => {
      gone = true;
    };
  }, [projectId]);

  async function remove(p: Person) {
    if (!window.confirm(`Take ${p.name} off this job? They stay in Contacts.`)) return;
    setErr('');
    const r = await fetch(`/api/crm/projects/${projectId}/people?contact_id=${p.contact_id}`, { method: 'DELETE' });
    if (!r.ok) return setErr('Couldn’t remove them. Try again.');
    await load();
    await onChanged?.();
  }
  async function setRole(p: Person, role: string) {
    setPeople((list) => (list ?? []).map((x) => (x.contact_id === p.contact_id ? { ...x, role } : x)));
    await fetch(`/api/crm/projects/${projectId}/people`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: p.contact_id, role }) });
  }

  return (
    <section className="crmh-card org-card" aria-label="Other contacts on this job">
      <div className="crmh-card__h">
        <h3>Other contacts</h3>
        {ready && (
          <button type="button" className="crmr-edit crmh-ml" onClick={() => setAdding(true)}>
            + New contact
          </button>
        )}
      </div>
      <div className="crmh-card__b">
        {!ready ? (
          <p className="crm-muted crm-small">
            Run <code>supabase/job-people.sql</code> in Supabase to add more contacts to a job.
            {why && <><br />Supabase says: {why}</>}
          </p>
        ) : people === null ? (
          <p className="crm-muted crm-small">Loading…</p>
        ) : people.length === 0 ? (
          <p className="crm-muted crm-small">Nobody else yet. Add a partner, a landlord, a tenant or a site contact.</p>
        ) : (
          <ul className="crmh-people">
            {people.map((p) => (
              <li key={p.contact_id}>
                <div>
                  <Link href={`/admin/crm/contacts/${p.contact_id}`} className="crmh-link">
                    <b>{p.name}</b>
                  </Link>
                  {p.organisation && <small> · {p.organisation}</small>}
                  <div className="crm-small">
                    <input className="crm-input crmh-role" list="job-roles" value={p.role ?? ''} placeholder="Role" aria-label={`Role of ${p.name}`} onChange={(e) => setPeople((l) => (l ?? []).map((x) => (x.contact_id === p.contact_id ? { ...x, role: e.target.value } : x)))} onBlur={(e) => void setRole(p, e.target.value)} />
                  </div>
                </div>
                <span className="crmh-people__act">
                  {telHref(p.mobile) && <a href={telHref(p.mobile)!} className="crmr-copy">Call</a>}
                  {waMeHref(p.mobile) && <a href={waMeHref(p.mobile)!} target="_blank" rel="noreferrer" className="crmr-copy">WhatsApp</a>}
                  {mailHref(p.email) && <a href={mailHref(p.email)!} className="crmr-copy">Email</a>}
                  <button type="button" className="crmr-copy" aria-label={`Take ${p.name} off the job`} onClick={() => void remove(p)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <datalist id="job-roles">
          {ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {err && <p className="crm-error">{err}</p>}
      </div>
      {adding && (
        <Sheet title="Add a contact to this job" onClose={() => setAdding(false)} wide>
          <AddPerson
            projectId={projectId}
            already={new Set((people ?? []).map((p) => p.contact_id))}
            onDone={async () => {
              setAdding(false);
              await load();
              await onChanged?.();
            }}
            onCancel={() => setAdding(false)}
          />
        </Sheet>
      )}
    </section>
  );
}

function AddPerson({ projectId, already, onDone, onCancel }: { projectId: string; already: Set<string>; onDone: () => Promise<void>; onCancel: () => void }) {
  const [all, setAll] = useState<PersonRow[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let gone = false;
    fetch('/api/crm/contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { people?: PersonRow[] }) => !gone && setAll((d.people ?? []).filter((p) => p.kind === 'contact')))
      .catch(() => !gone && setAll([]));
    return () => {
      gone = true;
    };
  }, []);
  const shown = useMemo(() => (all ?? []).filter((p) => !already.has(p.id) && (!q.trim() || matchesPerson(p, q))).slice(0, 12), [all, already, q]);

  async function link(contactId: string) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${projectId}/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, role }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Couldn’t add them.');
    await onDone();
  }

  return (
    <div>
      <label className="crm-label" htmlFor="ap-role">
        Their role on this job (optional)
      </label>
      <input id="ap-role" className="crm-input" list="job-roles" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Wife, Tenant, Site contact…" />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {fresh ? (
        <>
          <p className="crm-muted">New contact: they’re saved in Contacts too, so you can use them on other jobs.</p>
          <ContactForm chooseOrg onCancel={() => setFresh(false)} onSaved={(c) => void link(c.id)} />
        </>
      ) : (
        <>
          <label className="crm-label" htmlFor="ap-q">
            Find someone in Contacts
          </label>
          <input id="ap-q" className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or company" autoFocus />
          <ul className="crmh-picker__list">
            {all === null && <li className="crm-muted">Loading…</li>}
            {all !== null && shown.length === 0 && <li className="crm-muted">{q.trim() ? `Nobody called “${q.trim()}” in Contacts.` : 'No contacts yet.'}</li>}
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" disabled={busy} onClick={() => void link(p.id)}>
                  <span>
                    <b>{p.name}</b>
                    <small>{[p.role, p.organisation?.name, p.mobile].filter(Boolean).join(' · ')}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setFresh(true)}>
            + New contact
          </button>{' '}
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
