'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ORG_TYPES, orgTypeShort, type OrgContact, type Organisation, type OrgType } from '@/lib/organisations/shared';

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

      <div className="crm-grid2 org-grid">
        <div>
          <label className="crm-label" htmlFor={`org-${id}-phone`}>
            Phone
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

      {!org && (
        <fieldset className="org-first">
          <legend>First contact (optional)</legend>
          <p className="crm-muted crm-small">The person you deal with there. They become the primary contact; add more on the organisation’s page.</p>
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

/** Add or edit one of an organisation's contacts: name, role, mobile, email, notes, and (adding) whether they're the primary contact. */
export function ContactForm({
  orgId,
  contact,
  first,
  onSaved,
  onCancel,
}: {
  orgId: string;
  contact?: OrgContact | null;
  /** The organisation has no contacts yet: this one is the primary contact, so there's nothing to tick. */
  first?: boolean;
  onSaved: (c: OrgContact, warning?: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({ name: contact?.name ?? '', role: contact?.role ?? '', mobile: contact?.mobile ?? '', email: contact?.email ?? '', notes: contact?.notes ?? '' });
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const id = contact?.id ?? 'new';
  const bad = (field: string) => (err?.field === field ? true : undefined);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const d = contact
        ? await orgApi<{ contact: OrgContact; warning?: string }>(`/api/crm/organisations/${orgId}/contacts/${contact.id}`, 'PATCH', f, 'Not saved. Try again.')
        : await orgApi<{ contact: OrgContact; warning?: string }>(`/api/crm/organisations/${orgId}/contacts`, 'POST', { ...f, is_primary: primary }, 'Not saved. Try again.');
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
      <label className="crm-label" htmlFor={`oc-${id}-notes`}>
        Notes
      </label>
      <textarea id={`oc-${id}-notes`} className="crm-input" rows={2} value={f.notes} onChange={set('notes')} placeholder="Best times to call, who they report to…" />
      {!contact && !first && (
        <label className="crm-check">
          <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Make them the primary contact
        </label>
      )}
      {!contact && first && <p className="crm-muted crm-small">The first contact is the primary contact.</p>}
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
