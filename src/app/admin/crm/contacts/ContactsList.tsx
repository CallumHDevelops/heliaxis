'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countPeople, matchesPerson, personGroup, personLine, sortPeople, type PeopleFilter, type PersonRow } from '@/lib/organisations/shared';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Icon, Sheet } from '../CrmUi';
import { ContactForm, initials, orgApi, TypePill } from '../organisations/OrgForms';
import '../crm.css';
import '../organisations/orgs.css';

const CHIPS: { key: PeopleFilter; label: string; title: string }[] = [
  { key: 'all', label: 'Everyone', title: 'Everyone we deal with, and customers' },
  { key: 'org', label: 'In an organisation', title: 'Part of an organisation' },
  { key: 'alone', label: 'On their own', title: 'Not part of any organisation' },
  { key: 'customer', label: 'Customers', title: 'People who came in as enquiries' },
];

/**
 * CRM › Contacts: the people we deal with, each in an organisation or on their own, and (under them)
 * customers, the people who came in as enquiries, whose page is their job's. A search (name, role,
 * organisation, postcode, phone, email) and chips by where they sit; + Add a contact.
 */
export function ContactsList({ ready, initial }: { ready: boolean; initial: PersonRow[] | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<PersonRow[] | null>(initial);
  const [error, setError] = useState(initial ? '' : 'Couldn’t load the contacts. Trying again…');
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<PeopleFilter>('all');
  const [adding, setAdding] = useState(false);
  const [customers, setCustomers] = useState<{ q: string; rows: PersonRow[]; newest: boolean; error: string } | null>(null);

  const skipFirst = useRef(initial !== null);
  const load = useCallback(async () => {
    if (!ready) return true;
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      const d = await orgApi<{ people: PersonRow[] }>('/api/crm/contacts');
      setRows(d.people);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the contacts.');
      return false;
    }
  }, [ready]);
  useLiveRefresh(load, 60_000);

  // Customers: the newest, or those the search finds (a moment after typing stops).
  const t = q.trim();
  const want = t.length >= 2 ? t : '';
  useEffect(() => {
    if (!ready) return;
    const ctl = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const r = await fetch(`/api/crm/contacts/customers?q=${encodeURIComponent(want)}`, { cache: 'no-store', signal: ctl.signal });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || 'Couldn’t load the customers.');
          setCustomers({ q: want, rows: d.people as PersonRow[], newest: !!d.newest, error: '' });
        } catch (e) {
          if (!ctl.signal.aborted) setCustomers({ q: want, rows: [], newest: !want, error: e instanceof Error ? e.message : 'Couldn’t load the customers.' });
        }
      },
      want === '' ? 0 : 250
    );
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [ready, want]);

  const all = useMemo(() => rows ?? [], [rows]);
  const mine = useMemo(() => sortPeople(all.filter((p) => matchesPerson(p, q)), q), [all, q]);
  const theirs = customers && customers.q === want ? sortPeople(customers.rows, q) : [];
  const counts = countPeople([...mine, ...theirs]);
  const shownMine = mine.filter((p) => chip === 'all' || personGroup(p) === chip);
  const shownCustomers = chip === 'all' || chip === 'customer' ? theirs : [];
  const none = !shownMine.length && !shownCustomers.length;

  return (
    <div className="crm crmh org-page">
      <Link href="/admin/crm" className="crm-back">
        ← CRM
      </Link>
      <div className="crmh-head org-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">Contacts</h1>
          {ready && rows && (
            <span className="crmh-sum">
              {all.length} contact{all.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {ready && (
          <div className="crmh-head__r">
            <button type="button" className="crm-btn crm-btn--solar org-add" aria-label="Add contact" onClick={() => setAdding(true)}>
              <Icon k="plus" /> Add<span className="org-hide-sm"> contact</span>
            </button>
          </div>
        )}
      </div>

      {!ready ? (
        <div className="crm-emptystate org-empty">
          <b>Contacts are switched on once organisations.sql has been run</b>
          <p>
            It’s on your <Link href="/admin/setup">to-do list</Link>: copy it into Supabase and press Run. Then add the people you deal with, in an organisation or on
            their own, and link their jobs.
          </p>
        </div>
      ) : (
        <>
          <div className="org-tools">
            <label className="crmh-searchbox org-search">
              <span className="crmh-searchbox__field">
                <Icon k="search" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role, organisation, phone or email" aria-label="Search the contacts" autoComplete="off" enterKeyHint="search" />
              </span>
            </label>
            <div className="crm-stages org-chips" role="group" aria-label="Show">
              {CHIPS.map((c) => (
                <button key={c.key} type="button" title={c.title} className={chip === c.key ? 'on' : ''} aria-pressed={chip === c.key} onClick={() => setChip(c.key)}>
                  {c.label}
                  <span>{counts[c.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="crm-banner crm-banner--err">{error}</p>}

          {!rows ? null : (
            <>
              {shownMine.length > 0 && <PeopleList heading={chip === 'all' && shownCustomers.length ? 'People we deal with' : null} rows={shownMine} />}
              {shownCustomers.length > 0 && (
                <PeopleList
                  heading="Customers"
                  note={customers?.newest && !want ? `The ${shownCustomers.length} newest. Search to find others: their page is their job’s.` : 'People who came in as enquiries: their page is their job’s.'}
                  rows={shownCustomers}
                />
              )}
              {customers?.error && <p className="crm-banner crm-banner--err">{customers.error}</p>}
              {none && (
                <div className="crm-emptystate org-empty">
                  {!all.length && !shownCustomers.length && !t ? (
                    <>
                      <b>No contacts yet</b>
                      <p>Add the people you deal with: in a landlord’s or a school’s office, a builder who sends you work, a supplier’s rep, or someone who works on their own.</p>
                      <button type="button" className="crm-btn crm-btn--solar" onClick={() => setAdding(true)}>
                        <Icon k="plus" /> Add your first contact
                      </button>
                    </>
                  ) : (
                    <>
                      <b>{t ? `Nobody matches “${t}”` : 'Nobody here yet'}</b>
                      <p>
                        {chip !== 'all' ? (
                          <button type="button" className="crm-link" onClick={() => setChip('all')}>
                            Show everyone
                          </button>
                        ) : (
                          'Try a name, a role, an organisation, a postcode or a phone number.'
                        )}
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {adding && (
        <Sheet title="Add a contact" onClose={() => setAdding(false)} wide>
          <ContactForm
            chooseOrg
            initialName={!shownMine.length && !shownCustomers.length ? t : ''}
            onCancel={() => setAdding(false)}
            onSaved={(c) => {
              setAdding(false);
              router.push(`/admin/crm/contacts/${c.id}`);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function PeopleList({ heading, note, rows }: { heading: string | null; note?: string; rows: PersonRow[] }) {
  return (
    <section className="org-group" aria-label={heading ?? 'People'}>
      {heading && (
        <h2 className="org-group__h">
          {heading} <span className="crmh-n">{rows.length}</span>
        </h2>
      )}
      {note && <p className="crm-muted crm-small org-group__note">{note}</p>}
      <ul className="org-list">
        {rows.map((p) => {
          const body = (
            <>
              <span className="org-badge org-badge--person" aria-hidden="true">
                {initials(p.name)}
              </span>
              <span className="org-row__main">
                <b className="org-row__name">{p.name}</b>
                <small className="org-row__who">{personLine(p)}</small>
              </span>
              <span className="org-row__type">
                {p.kind === 'customer' ? <span className="org-type">Customer</span> : p.organisation ? <TypePill type={p.organisation.type} /> : <span className="org-type">On their own</span>}
              </span>
              <span className="org-row__counts">{p.jobs ? `${p.jobs} job${p.jobs === 1 ? '' : 's'}${p.open_jobs && p.open_jobs !== p.jobs ? ` (${p.open_jobs} open)` : ''}` : 'No jobs yet'}</span>
              <span className="org-row__pc">{p.mobile}</span>
            </>
          );
          return (
            <li key={`${p.kind}-${p.id}`}>
              {p.href ? (
                <Link href={p.href} className="org-row">
                  {body}
                </Link>
              ) : (
                <div className="org-row" title="You can’t open customers from here">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
