'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { matchesOrg, ORG_TYPES, sortContacts, sortOrgs, telHref, type JobOrganisation, type OrgContact, type OrgListRow, type OrgType } from '@/lib/organisations/shared';
import { fold } from '@/lib/search-words';
import { Sheet } from '../CrmUi';
import { orgApi, TypePill } from '../organisations/OrgForms';
import '../organisations/orgs.css';

/**
 * The record page's Organisation card (once organisations.sql has run): the organisation the job is for
 * or came through (a landlord, a school, the builder who referred it) and the contact there it's dealt
 * with through. Link, change or unlink it in a sheet; the timeline says each time.
 */
export function OrganisationCard({ projectId, organisation, onChanged }: { projectId: string; organisation: JobOrganisation | null; onChanged: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const contact = organisation?.contacts.find((c) => c.id === organisation.contact_id) ?? null;
  const tel = telHref(contact?.mobile);
  return (
    <section className="crmh-card org-card" aria-label="Organisation">
      <div className="crmh-card__h">
        <h3>Organisation</h3>
        <button type="button" className="crmr-edit crmh-ml" onClick={() => setOpen(true)}>
          {organisation ? '✎ Change' : '+ Link'}
        </button>
      </div>
      {organisation ? (
        <div className="crmh-card__b crmr-fields">
          <div className="crmr-field">
            <span className="crmr-field__l">Organisation</span>
            <span className="crmr-field__v org-card__org">
              <Link href={`/admin/crm/organisations/${organisation.id}`} className="crmh-link org-trunc">
                {organisation.name}
              </Link>
              <TypePill type={organisation.type} />
            </span>
          </div>
          <div className="crmr-field">
            <span className="crmr-field__l">Contact</span>
            <span className="crmr-field__v">
              {contact ? (
                <span className="org-card__contact">
                  <span className="org-trunc">
                    {contact.name}
                    {contact.role ? <small> · {contact.role}</small> : null}
                  </span>
                  {tel && (
                    <a href={tel} className="crmr-copy" aria-label={`Call ${contact.name}`}>
                      Call
                    </a>
                  )}
                </span>
              ) : (
                <button type="button" className="crm-link crmr-inline" onClick={() => setOpen(true)}>
                  {organisation.contacts.length ? 'Pick who it’s with' : 'No contacts yet'}
                </button>
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="crmh-card__b">
          <p className="crm-muted crm-small org-card__none">For a business, landlord, school or a partner who sent the work.</p>
        </div>
      )}
      {open && (
        <Sheet title={organisation ? 'Change the organisation' : 'Link to an organisation'} onClose={() => setOpen(false)} wide>
          <LinkOrganisation
            projectId={projectId}
            current={organisation}
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

type Picked = { id: string; name: string; type: OrgType; contacts: OrgContact[] };

/** Pick an organisation (or add one by name), then the contact there; or unlink. */
function LinkOrganisation({ projectId, current, onCancel, onDone }: { projectId: string; current: JobOrganisation | null; onCancel: () => void; onDone: () => Promise<void> }) {
  const [orgs, setOrgs] = useState<OrgListRow[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Picked | null>(current ? { id: current.id, name: current.name, type: current.type, contacts: current.contacts } : null);
  const [contact, setContact] = useState(current?.contact_id ?? '');
  const [newType, setNewType] = useState<OrgType>('commercial');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    orgApi<{ organisations: OrgListRow[] }>('/api/crm/organisations')
      .then((d) => live && setOrgs(d.organisations))
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : 'Couldn’t load the organisations.'));
    return () => {
      live = false;
    };
  }, []);

  async function pick(o: { id: string; name: string; type: OrgType }) {
    setErr('');
    setBusy(true);
    try {
      const d = await orgApi<{ contacts: OrgContact[] }>(`/api/crm/organisations/${o.id}`);
      const list = sortContacts(d.contacts);
      setPicked({ ...o, contacts: list });
      // The contact it was with, if it's the same organisation; else its primary contact.
      setContact(current?.id === o.id && current.contact_id ? current.contact_id : (list.find((c) => c.is_primary)?.id ?? ''));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t load that organisation.');
    } finally {
      setBusy(false);
    }
  }

  async function addNew() {
    setErr('');
    setBusy(true);
    try {
      const d = await orgApi<{ organisation: { id: string; name: string; type: OrgType } }>('/api/crm/organisations', 'POST', { name: q.trim(), type: newType }, 'Not added. Try again.');
      setPicked({ ...d.organisation, contacts: [] });
      setContact('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not added. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function save(orgId: string | null) {
    setErr('');
    setBusy(true);
    try {
      await orgApi(`/api/crm/projects/${projectId}/organisation`, 'PUT', { organisation_id: orgId, contact_id: orgId ? contact || null : null }, 'Not saved. Try again.');
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved. Try again.');
      setBusy(false);
    }
  }

  const t = q.trim();
  const hits = orgs ? sortOrgs(orgs.filter((o) => matchesOrg(o, t)), t).slice(0, 8) : [];
  const exact = t && orgs?.some((o) => fold(o.name.trim()) === fold(t));

  return (
    <div className="org-form">
      {picked ? (
        <div className="crmh-picked">
          <span>
            <b>{picked.name}</b> <TypePill type={picked.type} />
          </span>
          <button
            type="button"
            className="crm-link"
            onClick={() => {
              setPicked(null);
              setContact('');
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="crmh-picker">
          <label className="crm-label" htmlFor="rec-org-q">
            Organisation
          </label>
          <input id="rec-org-q" className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, a person there, postcode or phone" autoFocus autoComplete="off" />
          {!orgs ? (
            !err && <p className="crm-muted crm-small">Loading…</p>
          ) : (
            <ul className="crmh-picker__list org-picklist" aria-label="Organisations">
              {hits.map((o) => (
                <li key={o.id}>
                  <button type="button" disabled={busy} onClick={() => void pick(o)}>
                    <span>
                      <b>{o.name}</b>
                      <small>{[o.primary?.name, o.postcode].filter(Boolean).join(' · ') || ORG_TYPES.find((x) => x.key === o.type)?.label}</small>
                    </span>
                    <TypePill type={o.type} />
                  </button>
                </li>
              ))}
              {!hits.length && <li className="crm-muted">{orgs.length ? `No organisation matches “${t}”.` : 'No organisations yet: add the first one below.'}</li>}
            </ul>
          )}
          {orgs && t && !exact && (
            <div className="org-addnew">
              <label className="crm-label" htmlFor="rec-org-type">
                Or add “{t}” as a new organisation
              </label>
              <div className="org-addnew__row">
                <select id="rec-org-type" className="crm-input" value={newType} onChange={(e) => setNewType(e.target.value as OrgType)} aria-label="What kind of organisation">
                  {ORG_TYPES.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => void addNew()}>
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {picked && (
        <>
          <label className="crm-label" htmlFor="rec-org-contact">
            Who at {picked.name} is it dealt with through?
          </label>
          {picked.contacts.length ? (
            <select id="rec-org-contact" className="crm-input" value={contact} onChange={(e) => setContact(e.target.value)}>
              <option value="">Nobody in particular</option>
              {picked.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` · ${c.role}` : ''}
                  {c.is_primary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="crm-muted crm-small">
              No contacts yet: add them on <Link href={`/admin/crm/organisations/${picked.id}`}>{picked.name}’s page</Link>.
            </p>
          )}
        </>
      )}

      {err && (
        <p className="crm-banner crm-banner--err" role="alert">
          {err}
        </p>
      )}
      <div className="crm-actions org-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!picked || busy} onClick={() => void save(picked!.id)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        {current && (
          <button type="button" className="crm-link org-danger crmh-ml" disabled={busy} onClick={() => void save(null)}>
            Unlink from {current.name}
          </button>
        )}
      </div>
    </div>
  );
}
