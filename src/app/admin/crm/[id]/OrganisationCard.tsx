'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  matchesOrg,
  matchesPerson,
  ORG_TYPES,
  sortContacts,
  sortOrgs,
  sortPeople,
  telHref,
  type JobContact,
  type JobOrganisation,
  type OrgContact,
  type OrgListRow,
  type OrgType,
  type PersonRow,
} from '@/lib/organisations/shared';
import { fold } from '@/lib/search-words';
import { Sheet } from '../CrmUi';
import { orgApi, TypePill } from '../organisations/OrgForms';
import '../organisations/orgs.css';
import { PeopleCard } from './PeopleCard';

/**
 * The record page's Organisation and contact card (once organisations.sql has run): the organisation the
 * job is for or came through (a landlord, a school, the builder who referred it) and the person it's dealt
 * with through, who may be in that organisation or on their own. Link, change or unlink in a sheet; the
 * timeline says each time.
 */
export function OrganisationCard({
  projectId,
  organisation,
  contact,
  onChanged,
}: {
  projectId: string;
  organisation: JobOrganisation | null;
  contact: JobContact | null;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const tel = telHref(contact?.mobile);
  const linked = !!organisation || !!contact;
  return (
    <section className="crmh-card org-card" aria-label="Organisation and contacts">
      <div className="crmh-card__h">
        <h3>Organisation / Contacts</h3>
        <button type="button" className="crmr-edit crmh-ml" onClick={() => setOpen(true)}>
          {organisation ? '✎ Change' : '+ Organisation'}
        </button>
      </div>
      <div className="crmh-card__b crmr-fields">
        {organisation && (
          <div className="crmr-field">
            <span className="crmr-field__l">Organisation</span>
            <span className="crmr-field__v org-card__org">
              <Link href={`/admin/crm/organisations/${organisation.id}`} className="crmh-link org-trunc">
                {organisation.name}
              </Link>
              <TypePill type={organisation.type} />
            </span>
          </div>
        )}
        <div className="crmr-field">
          <span className="crmr-field__l">Contacts</span>
          <span className="crmr-field__v">
            {contact ? (
              <span className="org-card__contact">
                <Link href={`/admin/crm/contacts/${contact.id}`} className="crmh-link org-trunc">
                  {contact.name}
                  {contact.role ? <small> · {contact.role}</small> : null}
                </Link>
                {tel && (
                  <a href={tel} className="crmr-copy" aria-label={`Call ${contact.name}`}>
                    Call
                  </a>
                )}
              </span>
            ) : (
              <button type="button" className="crm-link crmr-inline" onClick={() => setOpen(true)}>
                {organisation?.contacts.length ? 'Pick who it’s with' : 'No main contact yet'}
              </button>
            )}
            <PeopleCard projectId={projectId} onChanged={onChanged} embedded />
          </span>
        </div>
      </div>
      {open && (
        <Sheet title={linked ? 'Change the organisation or contact' : 'Link an organisation or contact'} onClose={() => setOpen(false)} wide>
          <LinkSheet
            projectId={projectId}
            current={organisation}
            currentContact={contact}
            onCancel={() => setOpen(false)}
            onDone={async () => {
              setOpen(false);
              await onChanged();
            }}
          />
        </Sheet>
      )}
    </section>
  );
}

type PickedOrg = { id: string; name: string; type: OrgType; contacts: OrgContact[] };
type PickedSolo = { id: string; name: string; role: string | null };

/** Pick an organisation (then who there) or a person on their own, find or add either by name; or unlink. */
function LinkSheet({
  projectId,
  current,
  currentContact,
  onCancel,
  onDone,
}: {
  projectId: string;
  current: JobOrganisation | null;
  currentContact: JobContact | null;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [orgs, setOrgs] = useState<OrgListRow[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [q, setQ] = useState('');
  const [org, setOrg] = useState<PickedOrg | null>(current ? { id: current.id, name: current.name, type: current.type, contacts: current.contacts } : null);
  const [solo, setSolo] = useState<PickedSolo | null>(!current && currentContact && !currentContact.organisation_id ? { id: currentContact.id, name: currentContact.name, role: currentContact.role } : null);
  const [contact, setContact] = useState(current ? (currentContact?.id ?? '') : '');
  const [newType, setNewType] = useState<OrgType>('commercial');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([orgApi<{ organisations: OrgListRow[] }>('/api/crm/organisations'), orgApi<{ people: PersonRow[] }>('/api/crm/contacts')])
      .then(([o, p]) => {
        if (!live) return;
        setOrgs(o.organisations);
        setPeople(p.people);
      })
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : 'Couldn’t load the organisations.'));
    return () => {
      live = false;
    };
  }, []);

  async function pickOrg(o: { id: string; name: string; type: OrgType }, withContact?: string) {
    setErr('');
    setBusy(true);
    try {
      const d = await orgApi<{ contacts: OrgContact[] }>(`/api/crm/organisations/${o.id}`);
      const list = sortContacts(d.contacts);
      setSolo(null);
      setOrg({ ...o, contacts: list });
      // Who it was with, if it's the same organisation; else the one picked, else its primary contact.
      // A person on their own it is already dealt with through stays picked (they can go with any organisation).
      const keepSolo = currentContact && !currentContact.organisation_id ? currentContact.id : '';
      setContact(withContact ?? (current?.id === o.id && currentContact ? currentContact.id : keepSolo || (list.find((c) => c.is_primary)?.id ?? '')));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t load that organisation.');
    } finally {
      setBusy(false);
    }
  }

  async function pickPerson(p: PersonRow) {
    if (p.organisation) return pickOrg(p.organisation, p.id);
    setOrg(null);
    setContact('');
    setSolo({ id: p.id, name: p.name, role: p.role });
  }

  async function addOrg() {
    setErr('');
    setBusy(true);
    try {
      const d = await orgApi<{ organisation: { id: string; name: string; type: OrgType } }>('/api/crm/organisations', 'POST', { name: q.trim(), type: newType }, 'Not added. Try again.');
      // A new organisation has no contacts yet: link the job to it now. If that fails it stays picked, so trying again doesn’t add a second one.
      setOrg({ ...d.organisation, contacts: [] });
      setContact('');
      await save({ organisation_id: d.organisation.id, contact_id: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not added. Try again.');
      setBusy(false);
    }
  }

  async function addPerson() {
    setErr('');
    setBusy(true);
    try {
      const d = await orgApi<{ contact: OrgContact }>('/api/crm/contacts', 'POST', { name: q.trim() }, 'Not added. Try again.');
      setOrg(null);
      setSolo({ id: d.contact.id, name: d.contact.name, role: d.contact.role });
      await save({ contact_id: d.contact.id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not added. Try again.');
      setBusy(false);
    }
  }

  async function save(body: Record<string, string | null>, ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setErr('');
    setBusy(true);
    try {
      await orgApi(`/api/crm/projects/${projectId}/organisation`, 'PUT', body, 'Not saved. Try again.');
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved. Try again.');
      setBusy(false);
    }
  }

  const t = q.trim();
  const orgHits = orgs ? sortOrgs(orgs.filter((o) => matchesOrg(o, t)), t).slice(0, 6) : [];
  const personHits = sortPeople(people.filter((p) => matchesPerson(p, t)), t).slice(0, 6);
  const exact = !!t && !!orgs && orgs.some((o) => fold(o.name.trim()) === fold(t));
  const exactPerson = !!t && people.some((p) => fold(p.name.trim()) === fold(t));
  const picked = org ?? solo;
  const linkedNow = !!current || !!currentContact;

  return (
    <div className="org-form">
      {org ? (
        <div className="crmh-picked">
          <span className="org-picked">
            <b className="org-trunc">{org.name}</b>
            <TypePill type={org.type} />
          </span>
          <button
            type="button"
            className="crm-link"
            onClick={() => {
              setOrg(null);
              setContact('');
            }}
          >
            Change
          </button>
        </div>
      ) : solo ? (
        <div className="crmh-picked">
          <span className="org-picked">
            <b className="org-trunc">{solo.name}</b>
            <span className="org-type">On their own</span>
          </span>
          <button type="button" className="crm-link" onClick={() => setSolo(null)}>
            Change
          </button>
        </div>
      ) : (
        <div className="crmh-picker">
          <label className="crm-label" htmlFor="rec-org-q">
            Organisation or person
          </label>
          <input id="rec-org-q" className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, a person there, postcode or phone" autoFocus autoComplete="off" />
          {!orgs ? (
            !err && <p className="crm-muted crm-small">Loading…</p>
          ) : (
            <ul className="crmh-picker__list org-picklist" aria-label="Organisations and people">
              {orgHits.map((o) => (
                <li key={`o-${o.id}`}>
                  <button type="button" disabled={busy} onClick={() => void pickOrg(o)}>
                    <span>
                      <b>{o.name}</b>
                      <small>{[o.primary?.name, o.postcode].filter(Boolean).join(' · ') || ORG_TYPES.find((x) => x.key === o.type)?.label}</small>
                    </span>
                    <TypePill type={o.type} />
                  </button>
                </li>
              ))}
              {personHits.map((p) => (
                <li key={`p-${p.kind}-${p.id}`}>
                  {p.kind === 'contact' ? (
                    <button type="button" disabled={busy} onClick={() => void pickPerson(p)}>
                      <span>
                        <b>{p.name}</b>
                        <small>{[p.role, p.organisation?.name ?? 'On their own'].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className="org-type">Contact</span>
                    </button>
                  ) : null}
                </li>
              ))}
              {!orgHits.length && !personHits.some((p) => p.kind === 'contact') && <li className="crm-muted">{orgs.length || people.length ? `Nobody matches “${t}”.` : 'No organisations or contacts yet: add the first one below.'}</li>}
            </ul>
          )}
          {orgs && t && (!exact || !exactPerson) && (
            <div className="org-addnew">
              {!exact && (
                <>
                  <label className="crm-label" htmlFor="rec-org-type">
                    Add “{t}” as a new organisation
                  </label>
                  <div className="org-addnew__row">
                    <select id="rec-org-type" className="crm-input" value={newType} onChange={(e) => setNewType(e.target.value as OrgType)} aria-label="What kind of organisation">
                      {ORG_TYPES.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => void addOrg()}>
                      + Add
                    </button>
                  </div>
                </>
              )}
              {!exactPerson && (
                <p className="org-addnew__person">
                  <button type="button" className="crm-link" disabled={busy} onClick={() => void addPerson()}>
                    + Add “{t}” as a person on their own
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {org && (
        <>
          <label className="crm-label" htmlFor="rec-org-contact">
            Who at {org.name} is it dealt with through?
          </label>
          {org.contacts.length || (currentContact && !currentContact.organisation_id) ? (
            <select id="rec-org-contact" className="crm-input" value={contact} onChange={(e) => setContact(e.target.value)}>
              <option value="">Nobody in particular</option>
              {/* Someone on their own the job is already dealt with through stays on the list. */}
              {currentContact && !currentContact.organisation_id && !org.contacts.some((c) => c.id === currentContact.id) && (
                <option value={currentContact.id}>
                  {currentContact.name}
                  {currentContact.role ? ` · ${currentContact.role}` : ''} (on their own)
                </option>
              )}
              {org.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` · ${c.role}` : ''}
                  {c.is_primary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="crm-muted crm-small">No contacts yet. Save the link, then add them on {org.name}’s page (its name on this card opens it).</p>
          )}
        </>
      )}
      {solo && <p className="crm-muted crm-small">The job keeps whatever organisation it has.</p>}

      {err && (
        <p className="crm-banner crm-banner--err" role="alert">
          {err}
        </p>
      )}
      <div className="crm-actions org-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={!picked || busy}
          onClick={() => void save(org ? { organisation_id: org.id, contact_id: contact || null } : { contact_id: solo!.id })}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        {linkedNow && (
          <button
            type="button"
            className="crm-link org-danger org-unlink"
            disabled={busy}
            onClick={() => void save({ organisation_id: null, contact_id: null }, `Unlink this job from ${[current?.name, currentContact?.name].filter(Boolean).join(' and ')}? The job itself doesn’t change.`)}
          >
            Unlink{current ? ` from ${current.name}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
