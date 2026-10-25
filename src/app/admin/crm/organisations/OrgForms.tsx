'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ORG_TYPES, orgTypeShort, type ContactWithOrg, type OrgContact, type Organisation, type OrgType } from '@/lib/organisations/shared';

/** A contact as the forms take them: with their organisation's name when it's known. */
export type ContactLike = OrgContact & { organisation?: ContactWithOrg['organisation'] };

/** Pieces shared by CRM › Organisations, an organisation's page and the record page's Organisation card. */

/** A JSON request to the organisations API; throws the server's words when it says no. */
export async function orgApi<T>(url: string, method = 'GET', body?: unknown, fallback = 'That didn’t work. Try again.'): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method, cache: 'no-store', ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  } catch {
    throw new Error('Couldn’t reach the server. Check your connection and try again.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error || fallback), { status: r.status, field: (d as { field?: string }).field });
  return d as T;
}

/** The type as a small pill, in its own colour. */
export function TypePill({ type }: { type: string }) {
  return <span className={`org-type org-type--${type}`}>{orgTypeShort(type)}</span>;
}

/** Two letters for the round badge: "Bron Afon Community Housing" → BA. */
export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase() || '?';
}

type OrgFields = { name: string; type: OrgType; phone: string; email: string; website: string; address: string; postcode: string; company_number: string; vat_number: string; notes: string };
const orgFieldsOf = (o?: Partial<Organisation> | null): OrgFields => ({
  name: o?.name ?? '',
  type: o?.type ?? 'commercial',
  phone: o?.phone ?? '',
  email: o?.email ?? '',
  website: o?.website ?? '',
  address: o?.address ?? '',
  postcode: o?.postcode ?? '',
  company_number: o?.company_number ?? '',
  vat_number: o?.vat_number ?? '',
  notes: o?.notes ?? '',
});

/**
 * Add or edit an organisation: name and type first (all that's needed), then how to reach them, the
 * address, company and VAT numbers, and notes. Adding can take its first contact too (who becomes the
 * primary contact). `sameName`: an organisation already called what's typed, to open instead.
 */
export function OrgForm({
  org,
  initialName = '',
  sameName,
  onSaved,
  onCancel,
}: {
  org?: Organisation | null;
  initialName?: string;
  sameName?: (name: string) => { id: string; name: string } | null;
  onSaved: (o: Organisation, warning?: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<OrgFields>(() => ({ ...orgFieldsOf(org), ...(org ? {} : { name: initialName }) }));
  const [c, setC] = useState({ name: '', role: '', mobile: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof OrgFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const setContact = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  const id = org?.id ?? 'new';
  const twin = !org && sameName ? sameName(f.name) : null;
  const typeHint = ORG_TYPES.find((t) => t.key === f.type)?.hint;
  const bad = (field: string) => (err?.field === field ? true : undefined);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = org ? f : { ...f, ...(c.name.trim() ? { contact: c } : {}) };
      const d = await orgApi<{ organisation: Organisation; warning?: string }>(org ? `/api/crm/organisations/${org.id}` : '/api/crm/organisations', org ? 'PATCH' : 'POST', body, 'Not saved. Try again.');
      onSaved(d.organisation, d.warning);
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : 'Not saved. Try again.', field: (e as { field?: string }).field });
      setBusy(false);
    }
  }

  return (
    <form
      className="org-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name.trim() && !busy) void save();
      }}
    >
      <label className="crm-label" htmlFor={`org-${id}-name`}>
        Name
      </label>
      <input id={`org-${id}-name`} className="crm-input" value={f.name} onChange={set('name')} autoFocus={!org} placeholder="e.g. Bron Afon Community Housing" aria-invalid={bad('name')} autoComplete="organization" />
      {twin && (
        <p className="crm-muted crm-small org-twin">
          There’s already an organisation called {twin.name}. <Link href={`/admin/crm/organisations/${twin.id}`}>Open it</Link>, or carry on to add another.
        </p>
      )}
      <label className="crm-label" htmlFor={`org-${id}-type`}>
        What kind of organisation
      </label>
      <select id={`org-${id}-type`} className="crm-input" value={f.type} onChange={set('type')} aria-describedby={typeHint ? `org-${id}-type-hint` : undefined}>
        {ORG_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      {typeHint && (
        <p id={`org-${id}-type-hint`} className="crm-muted crm-small">
          {typeHint}
        </p>
      )}

      {!org && (
        <fieldset className="org-first">
          <legend>The person you deal with (optional)</legend>
          <p className="crm-muted crm-small">They become the primary contact; add more on the organisation’s page.</p>
          <div className="crm-grid2 org-grid">
            <div>
              <label className="crm-label" htmlFor="org-new-cname">
                Name
              </label>
              <input id="org-new-cname" className="crm-input" value={c.name} onChange={setContact('name')} autoComplete="off" />
            </div>
            <div>
              <label className="crm-label" htmlFor="org-new-crole">
                Role
              </label>
              <input id="org-new-crole" className="crm-input" value={c.role} onChange={setContact('role')} placeholder="e.g. Facilities manager" autoComplete="off" />
            </div>
            <div>
              <label className="crm-label" htmlFor="org-new-cmob">
                Mobile
              </label>
              <input id="org-new-cmob" className="crm-input" type="tel" inputMode="tel" value={c.mobile} onChange={setContact('mobile')} aria-invalid={bad('contact.mobile')} autoComplete="off" />
            </div>
            <div>
              <label className="crm-label" htmlFor="org-new-cemail">
                Email
              </label>
              <input id="org-new-cemail" className="crm-input" type="email" inputMode="email" value={c.email} onChange={setContact('email')} aria-invalid={bad('contact.email')} autoComplete="off" />
            </div>
          </div>
        </fieldset>
      )}

      <div className="crm-grid2 org-grid">
        <div>
          <label className="crm-label" htmlFor={`org-${id}-phone`}>
            Office phone
          </label>
          <input id={`org-${id}-phone`} className="crm-input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} aria-invalid={bad('phone')} autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`org-${id}-email`}>
            Email
          </label>
          <input id={`org-${id}-email`} className="crm-input" type="email" inputMode="email" value={f.email} onChange={set('email')} aria-invalid={bad('email')} placeholder="office@…" autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`org-${id}-web`}>
            Website
          </label>
          <input id={`org-${id}-web`} className="crm-input" inputMode="url" value={f.website} onChange={set('website')} aria-invalid={bad('website')} placeholder="example.co.uk" autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`org-${id}-pc`}>
            Postcode
          </label>
          <input id={`org-${id}-pc`} className="crm-input" value={f.postcode} onChange={set('postcode')} autoCapitalize="characters" autoComplete="off" />
        </div>
      </div>
      <label className="crm-label" htmlFor={`org-${id}-addr`}>
        Address
      </label>
      <textarea id={`org-${id}-addr`} className="crm-input" rows={2} value={f.address} onChange={set('address')} />
      <div className="crm-grid2 org-grid">
        <div>
          <label className="crm-label" htmlFor={`org-${id}-co`}>
            Company number
          </label>
          <input id={`org-${id}-co`} className="crm-input" value={f.company_number} onChange={set('company_number')} aria-invalid={bad('company_number')} placeholder="01234567" autoCapitalize="characters" autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`org-${id}-vat`}>
            VAT number
          </label>
          <input id={`org-${id}-vat`} className="crm-input" value={f.vat_number} onChange={set('vat_number')} aria-invalid={bad('vat_number')} placeholder="GB123456789" autoCapitalize="characters" autoComplete="off" />
        </div>
      </div>
      <label className="crm-label" htmlFor={`org-${id}-notes`}>
        Notes
      </label>
      <textarea id={`org-${id}-notes`} className="crm-input" rows={3} value={f.notes} onChange={set('notes')} placeholder="Access, how they like to work, who signs off…" />


      {err && (
        <p className="crm-banner crm-banner--err" role="alert">
          {err.text}
        </p>
      )}
      <div className="crm-actions org-actions">
        <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || !f.name.trim()}>
          {busy ? 'Saving…' : org ? 'Save' : 'Add organisation'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Add or edit a contact: name, role, mobile, email, notes. In an organisation's page the organisation is
 * fixed (`orgId`); elsewhere (`chooseOrg`) they pick one, or none: someone on their own. Adding to an
 * organisation that has none yet makes them its primary contact; a tick makes a later one primary.
 * Changing a contact's organisation takes the jobs they're dealt with through along (`jobs` says how many).
 */
export function ContactForm({
  orgId,
  chooseOrg = false,
  contact,
  first,
  jobs = 0,
  initialName = '',
  onSaved,
  onCancel,
}: {
  orgId?: string | null;
  chooseOrg?: boolean;
  contact?: ContactLike | null;
  /** The organisation has no contacts yet: this one is the primary contact, so there's nothing to tick. */
  first?: boolean;
  jobs?: number;
  initialName?: string;
  onSaved: (c: OrgContact, warning?: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({ name: contact?.name ?? initialName, role: contact?.role ?? '', mobile: contact?.mobile ?? '', email: contact?.email ?? '', notes: contact?.notes ?? '' });
  const [org, setOrg] = useState<string>(contact ? (contact.organisation_id ?? '') : (orgId ?? ''));
  const [orgs, setOrgs] = useState<{ id: string; name: string }[] | null>(null);
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const id = contact?.id ?? 'new';
  const bad = (field: string) => (err?.field === field ? true : undefined);
  const wasOrg = contact?.organisation_id ?? '';
  const moving = !!contact && chooseOrg && org !== wasOrg;

  useEffect(() => {
    if (!chooseOrg) return;
    let live = true;
    orgApi<{ organisations: { id: string; name: string }[] }>('/api/crm/organisations')
      .then((d) => live && setOrgs(d.organisations.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))))
      .catch(() => live && setOrgs([]));
    return () => {
      live = false;
    };
  }, [chooseOrg]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ...f };
      if (!contact) body.organisation_id = org || null;
      else if (chooseOrg) body.organisation_id = org || null;
      if (!contact && org && primary) body.is_primary = true;
      const d = contact
        ? await orgApi<{ contact: OrgContact; warning?: string }>(`/api/crm/contacts/${contact.id}`, 'PATCH', body, 'Not saved. Try again.')
        : await orgApi<{ contact: OrgContact; warning?: string }>('/api/crm/contacts', 'POST', body, 'Not saved. Try again.');
      onSaved(d.contact, d.warning);
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : 'Not saved. Try again.', field: (e as { field?: string }).field });
      setBusy(false);
    }
  }

  return (
    <form
      className="org-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name.trim() && !busy) void save();
      }}
    >
      <div className="crm-grid2 org-grid">
        <div>
          <label className="crm-label" htmlFor={`oc-${id}-name`}>
            Name
          </label>
          <input id={`oc-${id}-name`} className="crm-input" value={f.name} onChange={set('name')} autoFocus={!contact} aria-invalid={bad('name')} autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`oc-${id}-role`}>
            Role
          </label>
          <input id={`oc-${id}-role`} className="crm-input" value={f.role} onChange={set('role')} placeholder="e.g. Facilities manager" autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`oc-${id}-mob`}>
            Mobile
          </label>
          <input id={`oc-${id}-mob`} className="crm-input" type="tel" inputMode="tel" value={f.mobile} onChange={set('mobile')} aria-invalid={bad('mobile')} placeholder="07700 900123" autoComplete="off" />
        </div>
        <div>
          <label className="crm-label" htmlFor={`oc-${id}-email`}>
            Email
          </label>
          <input id={`oc-${id}-email`} className="crm-input" type="email" inputMode="email" value={f.email} onChange={set('email')} aria-invalid={bad('email')} autoComplete="off" />
        </div>
      </div>
      {chooseOrg && (
        <>
          <label className="crm-label" htmlFor={`oc-${id}-org`}>
            Organisation
          </label>
          <select id={`oc-${id}-org`} className="crm-input" value={org} onChange={(e) => setOrg(e.target.value)} >
            <option value="">None: on their own</option>
            {(orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {/* Their organisation, while the list is still on its way. */}
            {!orgs && org && <option value={org}>{contact?.organisation?.name ?? 'Loading…'}</option>}
          </select>
          {moving && jobs > 0 && (
            <p className="crm-muted crm-small">
              The {jobs} job{jobs === 1 ? '' : 's'} dealt with through {f.name.trim() || 'them'} {jobs === 1 ? 'goes' : 'go'} with them: {jobs === 1 ? 'it is' : 'they are'} linked to {org ? 'the new organisation' : 'no organisation'} from then on.
            </p>
          )}
        </>
      )}
      <label className="crm-label" htmlFor={`oc-${id}-notes`}>
        Notes
      </label>
      <textarea id={`oc-${id}-notes`} className="crm-input" rows={2} value={f.notes} onChange={set('notes')} placeholder="Best times to call, who they report to…" />
      {!contact && org && !first && (
        <label className="crm-check">
          <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Make them the primary contact
        </label>
      )}
      {!contact && org && first && <p className="crm-muted crm-small">The first contact is the primary contact.</p>}
      {err && (
        <p className="crm-banner crm-banner--err" role="alert">
          {err.text}
        </p>
      )}
      <div className="crm-actions org-actions">
        <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || !f.name.trim()}>
          {busy ? 'Saving…' : contact ? 'Save' : 'Add contact'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
