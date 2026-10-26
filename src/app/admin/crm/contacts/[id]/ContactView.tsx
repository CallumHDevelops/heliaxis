'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCTS } from '@/lib/crm/stages';
import { jobHref } from '@/lib/global-search';
import { mailHref, orgTypeLabel, telHref, waMeHref, type ContactWithOrg, type OrgJob } from '@/lib/organisations/shared';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Sheet, StageChip, WaIcon } from '../../CrmUi';
import { JobFinder, type FoundJob } from '../../organisations/JobFinder';
import { ContactForm, initials, orgApi, TypePill } from '../../organisations/OrgForms';
import '../../crm.css';
import '../../organisations/orgs.css';

type Data = { contact: ContactWithOrg; jobs: OrgJob[] };
type SheetState = 'edit' | 'link' | 'new' | null;

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />
  </svg>
);
const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);

/**
 * A contact's page: who they are (role, and the organisation they're part of, or "on their own"), Call,
 * WhatsApp and Email, their details and notes, and the jobs they're dealt with through (link one, unlink
 * one). Edit changes their organisation too: their jobs go with them.
 */
export function ContactView({ id, initial, canInbox }: { id: string; initial: Data | null; canInbox: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(initial);
  const [error, setError] = useState(initial ? '' : 'Couldn’t load this contact. Trying again…');
  const [notice, setNotice] = useState('');
  const [gone, setGone] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState('');

  const skipFirst = useRef(initial !== null);
  const load = useCallback(async () => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      setData(await orgApi<Data>(`/api/crm/contacts/${id}`));
      setError('');
      return true;
    } catch (e) {
      if ((e as { status?: number }).status === 404) setGone(true);
      else setError(e instanceof Error ? e.message : 'Couldn’t load this contact.');
      return false;
    }
  }, [id]);
  const { reload } = useLiveRefresh(load, 60_000);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (gone) {
    return (
      <div className="crm crmh org-page">
        <div className="crm-emptystate org-empty">
          <b>This contact isn’t there any more</b>
          <p>Someone may have deleted them.</p>
          <Link href="/admin/crm/contacts" className="crm-btn crm-btn--ghost">
            ← Contacts
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="crm crmh org-page">
        <Link href="/admin/crm/contacts" className="crm-back">
          ← Contacts
        </Link>
        {error && <p className="crm-banner crm-banner--err">{error}</p>}
      </div>
    );
  }

  const c = data.contact;
  const open = data.jobs.filter((j) => j.stage !== 'complete' && j.stage !== 'lost').length;
  const tel = telHref(c.mobile);
  const mail = mailHref(c.email);
  const chat = c.chat_id ? (canInbox ? `/admin/enquiries/inbox/${c.chat_id}` : `/admin/crm/chats/${c.chat_id}`) : null;
  const waMe = !chat ? waMeHref(c.mobile) : null;

  async function act(key: string, run: () => Promise<string | void>) {
    setBusy(key);
    setError('');
    try {
      const said = await run();
      if (said) setNotice(said);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy('');
      void reload();
    }
  }

  function deleteContact() {
    const ask = `Delete ${c.name}? They’re removed from the CRM altogether.${data!.jobs.length ? ` The ${data!.jobs.length} job${data!.jobs.length === 1 ? '' : 's'} dealt with through them stay${data!.jobs.length === 1 ? 's' : ''}, with no contact.` : ''} This can’t be undone.`;
    if (!window.confirm(ask)) return;
    setBusy('delete');
    setError('');
    orgApi(`/api/crm/contacts/${id}`, 'DELETE')
      .then(() => router.push(c.organisation ? `/admin/crm/organisations/${c.organisation.id}` : '/admin/crm/contacts'))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Not deleted. Try again.');
        setBusy('');
      });
  }

  return (
    <div className="crm crmh org-page org-page--one">
      <Link href={c.organisation ? `/admin/crm/organisations/${c.organisation.id}` : '/admin/crm/contacts'} className="crm-back">
        ← {c.organisation ? c.organisation.name : 'Contacts'}
      </Link>

      <header className="org-hero">
        <span className="org-badge org-badge--big org-badge--person" aria-hidden="true">
          {initials(c.name)}
        </span>
        <div className="org-hero__t">
          <h1 className="crmh-h1 org-hero__name">{c.name}</h1>
          <p className="org-hero__meta">
            {c.role && <span>{c.role}</span>}
            {c.organisation ? (
              <>
                <Link href={`/admin/crm/organisations/${c.organisation.id}`} className="crmh-link">
                  {c.organisation.name}
                </Link>
                <TypePill type={c.organisation.type} />
                {c.is_primary && <span className="org-primary">Primary contact</span>}
              </>
            ) : (
              <span className="org-type">On their own</span>
            )}
            <span>
              {data.jobs.length} job{data.jobs.length === 1 ? '' : 's'}
              {open && open !== data.jobs.length ? ` (${open} open)` : ''}
            </span>
          </p>
        </div>
        <div className="org-hero__acts">
          {tel ? (
            <a className="crm-btn crm-btn--ghost" href={tel}>
              <PhoneIcon /> Call<span className="org-hide-sm"> {c.mobile}</span>
            </a>
          ) : null}
          {chat ? (
            <Link className="crm-btn crm-btn--ghost org-wa" href={chat} title="Their chat in the CRM">
              <WaIcon /> WhatsApp
            </Link>
          ) : waMe ? (
            <a className="crm-btn crm-btn--ghost org-wa" href={waMe} target="_blank" rel="noreferrer noopener" title="Opens WhatsApp on this device">
              <WaIcon /> WhatsApp
            </a>
          ) : null}
          {mail && (
            <a className="crm-btn crm-btn--ghost" href={mail}>
              <MailIcon /> Email
            </a>
          )}
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setSheet('edit')}>
            ✎ Edit
          </button>
        </div>
      </header>

      {notice && (
        <p className="crm-banner org-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="crm-banner crm-banner--err" role="alert">
          {error}
        </p>
      )}

      <div className="org-cols">
        <div className="org-main">
          <section className="crmh-card" aria-labelledby="ct-jobs-h">
            <div className="crmh-card__h">
              <h3 id="ct-jobs-h">Jobs</h3>
              <span className="crmh-n">{data.jobs.length}</span>
              <span className="crmh-ml org-jobbtns">
                <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setSheet('new')}>
                  + New opportunity
                </button>
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setSheet('link')}>
                  Link a job
                </button>
              </span>
            </div>
            {!data.jobs.length ? (
              <div className="crmh-card__b org-none">
                <p>
                  No jobs yet. Press <b>+ New opportunity</b> to start one for {c.name}, or link an existing job.
                </p>
              </div>
            ) : (
              <ul className="org-jobs">
                {data.jobs.map((j) => (
                  <li key={j.id} className="org-job">
                    <Link href={jobHref(j)} className="org-job__link">
                      <span className="org-job__main">
                        <b>{j.customer || j.title}</b>
                        <small>{[j.ref, j.customer ? j.title : null].filter(Boolean).join(' · ')}</small>
                      </span>
                      <StageChip stage={j.stage} />
                    </Link>
                    <button
                      type="button"
                      className="crm-link org-job__unlink"
                      disabled={!!busy}
                      aria-label={`Stop dealing with ${c.name} on ${j.ref || j.title}`}
                      onClick={() => {
                        if (!window.confirm(`Take ${c.name} off ${j.ref || j.title}? The job itself doesn’t change.`)) return;
                        void act(`un-${j.id}`, async () => {
                          await orgApi(`/api/crm/projects/${j.id}/organisation`, 'PUT', { contact_id: null });
                          return 'Taken off the job.';
                        });
                      }}
                    >
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="org-side">
          <section className="crmh-card" aria-labelledby="ct-details-h">
            <div className="crmh-card__h">
              <h3 id="ct-details-h">Details</h3>
              <button type="button" className="crmr-edit crmh-ml" onClick={() => setSheet('edit')}>
                ✎ Edit
              </button>
            </div>
            <div className="crmh-card__b crmr-fields">
              <Field label="Role">{c.role || <span className="crm-muted">None yet</span>}</Field>
              <Field label="Mobile">{tel ? <a href={tel}>{c.mobile}</a> : <span className="crm-muted">None yet</span>}</Field>
              <Field label="Email">{mail ? <a href={mail} className="org-trunc">{c.email}</a> : <span className="crm-muted">None yet</span>}</Field>
              <Field label="Organisation">
                {c.organisation ? (
                  <Link href={`/admin/crm/organisations/${c.organisation.id}`} className="org-trunc">
                    {c.organisation.name} <small className="crm-muted">· {orgTypeLabel(c.organisation.type)}</small>
                  </Link>
                ) : (
                  <span className="crm-muted">None: on their own</span>
                )}
              </Field>
            </div>
          </section>

          <section className="crmh-card" aria-labelledby="ct-notes-h">
            <div className="crmh-card__h">
              <h3 id="ct-notes-h">Notes</h3>
              <button type="button" className="crmr-edit crmh-ml" onClick={() => setSheet('edit')}>
                ✎ {c.notes ? 'Edit' : 'Add'}
              </button>
            </div>
            <div className="crmh-card__b">{c.notes ? <p className="org-pre org-notes">{c.notes}</p> : <p className="crm-muted org-none">Nothing yet.</p>}</div>
          </section>

          <p className="org-foot">
            <button type="button" className="crm-link org-danger" disabled={!!busy} onClick={deleteContact}>
              Delete this contact
            </button>
          </p>
        </div>
      </div>

      {sheet === 'edit' && (
        <Sheet title={`Edit ${c.name}`} onClose={() => setSheet(null)} wide>
          <ContactForm
            chooseOrg
            contact={c}
            jobs={data.jobs.length}
            onCancel={() => setSheet(null)}
            onSaved={(saved, warning) => {
              setSheet(null);
              if (warning) setError(warning);
              else setNotice(saved.organisation_id === (c.organisation_id ?? null) ? 'Saved ✓' : 'Saved ✓ Their jobs went with them.');
              void reload();
            }}
          />
        </Sheet>
      )}
      {sheet === 'new' && (
        <Sheet title={`New opportunity for ${c.name}`} onClose={() => setSheet(null)}>
          <NewOpportunity contact={c} onCancel={() => setSheet(null)} onMade={(jobId) => router.push(`/admin/crm/${jobId}`)} />
        </Sheet>
      )}
      {sheet === 'link' && (
        <Sheet title={`Link a job to ${c.name}`} onClose={() => setSheet(null)} wide>
          <LinkJobToContact
            contact={c}
            linked={new Set(data.jobs.map((j) => j.id))}
            onCancel={() => setSheet(null)}
            onLinked={(words) => {
              setSheet(null);
              setNotice(words);
              void reload();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="crmr-field">
      <span className="crmr-field__l">{label}</span>
      <span className="crmr-field__v">{children}</span>
    </div>
  );
}

/** Find a job and deal with it through this contact (their organisation, if they're in one, comes with them; a job's own organisation is left alone when they aren't). */
function LinkJobToContact({ contact, linked, onCancel, onLinked }: { contact: ContactWithOrg; linked: Set<string>; onCancel: () => void; onLinked: (words: string) => void }) {
  const [job, setJob] = useState<FoundJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function link() {
    if (!job) return;
    setBusy(true);
    setErr('');
    try {
      await orgApi(`/api/crm/projects/${job.id}/organisation`, 'PUT', { contact_id: contact.id }, 'Not linked. Try again.');
      onLinked(`${job.ref || job.customer} linked ✓`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not linked. Try again.');
      setBusy(false);
    }
  }
  return (
    <div className="org-form">
      <JobFinder linked={linked} job={job} onPick={setJob} id="ct-link-q" />
      <p className="crm-muted crm-small">
        {contact.organisation ? `The job is also linked to ${contact.organisation.name}, where ${contact.name} is.` : `${contact.name} is on their own, so the job keeps whatever organisation it has.`}
      </p>
      {err && (
        <p className="crm-banner crm-banner--err" role="alert">
          {err}
        </p>
      )}
      <div className="crm-actions org-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!job || busy} onClick={() => void link()}>
          {busy ? 'Linking…' : 'Link job'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}


/** Start an opportunity for this contact: what they want, and where. It opens on the new job. */
function NewOpportunity({ contact, onCancel, onMade }: { contact: ContactWithOrg; onCancel: () => void; onMade: (jobId: string) => void }) {
  const [products, setProducts] = useState<string[]>([]);
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function make() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/contacts/${contact.id}/opportunity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products, postcode, address }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t create the opportunity. Try again.');
    }
    onMade(d.id as string);
  }
  return (
    <div className="org-form">
      <p className="crm-muted crm-small">
        This starts a job at <b>Lead</b> for {contact.name}{contact.organisation ? ` (${contact.organisation.name})` : ''}. They are added as a customer from their name, mobile and email, so you can quote, message and book them as normal.
      </p>
      <label className="qb-lab">What are they interested in?</label>
      <div className="crm-stages" role="group" aria-label="Products">
        {PRODUCTS.map((p) => (
          <button key={p.key} type="button" className={products.includes(p.key) ? 'on' : ''} aria-pressed={products.includes(p.key)} onClick={() => setProducts((cur) => (cur.includes(p.key) ? cur.filter((k) => k !== p.key) : [...cur, p.key]))}>
            {p.label}
          </button>
        ))}
      </div>
      <label className="qb-lab" htmlFor="no-pc">
        Site postcode (optional)
      </label>
      <input id="no-pc" className="crm-input" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. NP15 1DG" autoComplete="off" />
      <label className="qb-lab" htmlFor="no-addr">
        Site address (optional)
      </label>
      <input id="no-addr" className="crm-input" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void make()}>
          {busy ? 'Creating…' : 'Create opportunity'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
