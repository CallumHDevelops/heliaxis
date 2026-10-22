'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { jobHref, type SearchPerson } from '@/lib/global-search';
import {
  mailHref,
  orgTypeLabel,
  sortContacts,
  telHref,
  waMeHref,
  websiteHref,
  websiteShown,
  type OrgContact,
  type Organisation,
  type OrgJob,
} from '@/lib/organisations/shared';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Icon, Sheet, StageChip, WaIcon } from '../../CrmUi';
import { initials, orgApi, ContactForm, OrgForm, TypePill } from '../OrgForms';
import '../../crm.css';
import '../orgs.css';

type Data = { organisation: Organisation; contacts: OrgContact[]; jobs: OrgJob[] };
type SheetState = { kind: 'edit' } | { kind: 'contact'; contact: OrgContact | null } | { kind: 'link' } | null;

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
 * An organisation's page: who they are (type, how to reach them), their contacts (call, WhatsApp or
 * email each one, make one primary, add, edit, remove), their jobs (open ones first; link one from the
 * search, or unlink), the details card and notes. Phones get one column, contacts first; wider screens
 * put the details and notes beside the contacts and jobs.
 */
export function OrganisationView({ id, initial, canInbox }: { id: string; initial: Data | null; canInbox: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(initial);
  const [error, setError] = useState(initial ? '' : 'Couldn’t load this organisation. Trying again…');
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
      setData(await orgApi<Data>(`/api/crm/organisations/${id}`));
      setError('');
      return true;
    } catch (e) {
      if ((e as { status?: number }).status === 404) setGone(true);
      else setError(e instanceof Error ? e.message : 'Couldn’t load this organisation.');
      return false;
    }
  }, [id]);
  const { reload } = useLiveRefresh(load, 60_000);

  // A notice goes after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

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

  if (gone) {
    return (
      <div className="crm crmh org-page">
        <div className="crm-emptystate org-empty">
          <b>This organisation isn’t there any more</b>
          <p>Someone may have deleted it.</p>
          <Link href="/admin/crm/organisations" className="crm-btn crm-btn--ghost">
            ← Organisations
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="crm crmh org-page">
        <Link href="/admin/crm/organisations" className="crm-back">
          ← Organisations
        </Link>
        {error && <p className="crm-banner crm-banner--err">{error}</p>}
      </div>
    );
  }

  const o = data.organisation;
  const contacts = sortContacts(data.contacts);
  const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
  const open = data.jobs.filter((j) => j.stage !== 'complete' && j.stage !== 'lost').length;
  const tel = telHref(o.phone);
  const mail = mailHref(o.email);
  const web = websiteHref(o.website);
  const chatHref = (enquiryId: string) => (canInbox ? `/admin/enquiries/inbox/${enquiryId}` : `/admin/crm/chats/${enquiryId}`);

  function removeContact(c: OrgContact) {
    const others = contacts.filter((x) => x.id !== c.id);
    const next = [...others].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const theirJobs = data!.jobs.filter((j) => j.contact_id === c.id).length;
    const ask = [
      `Remove ${c.name} from ${o.name}?`,
      c.is_primary && next ? `${next.name} becomes the primary contact.` : '',
      theirJobs ? `${theirJobs} job${theirJobs === 1 ? '' : 's'} dealt with through them stay${theirJobs === 1 ? 's' : ''} linked to ${o.name}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (!window.confirm(ask)) return;
    void act(`rm-${c.id}`, async () => {
      const d = await orgApi<{ primary: string | null }>(`/api/crm/organisations/${id}/contacts/${c.id}`, 'DELETE');
      return `${c.name} removed${d.primary ? `. ${d.primary} is the primary contact now.` : '.'}`;
    });
  }

  function deleteOrg() {
    const ask = `Delete ${o.name}?${contacts.length ? ` Its ${contacts.length} contact${contacts.length === 1 ? ' is' : 's are'} deleted too.` : ''}${
      data!.jobs.length ? ` Its ${data!.jobs.length} job${data!.jobs.length === 1 ? ' stays' : 's stay'}, no longer linked to it.` : ''
    } This can’t be undone.`;
    if (!window.confirm(ask)) return;
    setBusy('delete');
    setError('');
    orgApi(`/api/crm/organisations/${id}`, 'DELETE')
      .then(() => router.push('/admin/crm/organisations'))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Not deleted. Try again.');
        setBusy('');
      });
  }

  return (
    <div className="crm crmh org-page org-page--one">
      <Link href="/admin/crm/organisations" className="crm-back">
        ← Organisations
      </Link>

      <header className="org-hero">
        <span className={`org-badge org-badge--big org-badge--${o.type}`} aria-hidden="true">
          {initials(o.name)}
        </span>
        <div className="org-hero__t">
          <h1 className="crmh-h1 org-hero__name">{o.name}</h1>
          <p className="org-hero__meta">
            <TypePill type={o.type} />
            {o.postcode && <span>{o.postcode}</span>}
            <span>
              {contacts.length} contact{contacts.length === 1 ? '' : 's'} · {data.jobs.length} job{data.jobs.length === 1 ? '' : 's'}
              {open && open !== data.jobs.length ? ` (${open} open)` : ''}
            </span>
          </p>
        </div>
        <div className="org-hero__acts">
          {tel && (
            <a className="crm-btn crm-btn--ghost" href={tel}>
              <PhoneIcon /> Call<span className="org-hide-sm"> {o.phone}</span>
            </a>
          )}
          {mail && (
            <a className="crm-btn crm-btn--ghost" href={mail}>
              <MailIcon /> Email
            </a>
          )}
          {web && (
            <a className="crm-btn crm-btn--ghost" href={web} target="_blank" rel="noreferrer noopener">
              <Icon k="open" /> Website
            </a>
          )}
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setSheet({ kind: 'edit' })}>
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
          <section className="crmh-card" aria-labelledby="org-contacts-h">
            <div className="crmh-card__h">
              <h3 id="org-contacts-h">Contacts</h3>
              <span className="crmh-n">{contacts.length}</span>
              <button type="button" className="crm-btn crm-btn--small crmh-ml" onClick={() => setSheet({ kind: 'contact', contact: null })}>
                <Icon k="plus" size={14} /> Add contact
              </button>
            </div>
            {!contacts.length ? (
              <div className="crmh-card__b org-none">
                <p>No contacts yet. Add the people you deal with at {o.name}: the first one is the primary contact.</p>
              </div>
            ) : (
              <ul className="org-contacts">
                {contacts.map((c) => {
                  const ctel = telHref(c.mobile);
                  const cmail = mailHref(c.email);
                  const wa = c.chat_id ? chatHref(c.chat_id) : null;
                  const waMe = !wa ? waMeHref(c.mobile) : null;
                  return (
                    <li key={c.id} className={`org-contact${c.is_primary ? ' is-primary' : ''}`}>
                      <div className="org-contact__top">
                        <span className="org-contact__name">
                          <b>{c.name}</b>
                          {c.is_primary && <span className="org-primary">Primary</span>}
                        </span>
                        {c.role && <small className="org-contact__role">{c.role}</small>}
                      </div>
                      {(c.mobile || c.email) && (
                        <p className="org-contact__lines">
                          {c.mobile && <span>{c.mobile}</span>}
                          {c.email && <span className="org-trunc">{c.email}</span>}
                        </p>
                      )}
                      {c.notes && <p className="org-contact__notes">{c.notes}</p>}
                      <div className="org-contact__acts">
                        {ctel ? (
                          <a className="org-act" href={ctel} aria-label={`Call ${c.name}`}>
                            <PhoneIcon /> Call
                          </a>
                        ) : (
                          <span className="org-act is-off" title="No number yet">
                            <PhoneIcon /> Call
                          </span>
                        )}
                        {wa ? (
                          <Link className="org-act org-act--wa" href={wa} aria-label={`Open the WhatsApp chat with ${c.name}`} title="Their chat in the CRM">
                            <WaIcon /> WhatsApp
                          </Link>
                        ) : waMe ? (
                          <a className="org-act org-act--wa" href={waMe} target="_blank" rel="noreferrer noopener" aria-label={`WhatsApp ${c.name}`} title="Opens WhatsApp on this device">
                            <WaIcon /> WhatsApp
                          </a>
                        ) : (
                          <span className="org-act is-off" title="No mobile number yet">
                            <WaIcon /> WhatsApp
                          </span>
                        )}
                        {cmail ? (
                          <a className="org-act" href={cmail} aria-label={`Email ${c.name}`}>
                            <MailIcon /> Email
                          </a>
                        ) : (
                          <span className="org-act is-off" title="No email yet">
                            <MailIcon /> Email
                          </span>
                        )}
                      </div>
                      <div className="org-contact__more">
                        <button type="button" className="crm-link" onClick={() => setSheet({ kind: 'contact', contact: c })}>
                          Edit
                        </button>
                        {!c.is_primary && (
                          <button
                            type="button"
                            className="crm-link"
                            disabled={!!busy}
                            onClick={() =>
                              void act(`pri-${c.id}`, async () => {
                                await orgApi(`/api/crm/organisations/${id}/contacts/${c.id}`, 'PATCH', { is_primary: true });
                                return `${c.name} is the primary contact now.`;
                              })
                            }
                          >
                            Make primary
                          </button>
                        )}
                        <button type="button" className="crm-link org-danger" disabled={!!busy} onClick={() => removeContact(c)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="crmh-card" aria-labelledby="org-jobs-h">
            <div className="crmh-card__h">
              <h3 id="org-jobs-h">Jobs</h3>
              <span className="crmh-n">{data.jobs.length}</span>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmh-ml" onClick={() => setSheet({ kind: 'link' })}>
                Link a job
              </button>
            </div>
            {!data.jobs.length ? (
              <div className="crmh-card__b org-none">
                <p>
                  No jobs linked yet. Link one here, or from the job’s own page (its <b>Organisation</b> card).
                </p>
              </div>
            ) : (
              <ul className="org-jobs">
                {data.jobs.map((j) => (
                  <li key={j.id} className="org-job">
                    <Link href={jobHref(j)} className="org-job__link">
                      <span className="org-job__main">
                        <b>{j.customer || j.title}</b>
                        <small>
                          {[j.ref, j.customer ? j.title : null, j.contact_id ? `with ${nameOf.get(j.contact_id) ?? 'a contact'}` : null].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <StageChip stage={j.stage} />
                    </Link>
                    <button
                      type="button"
                      className="crm-link org-job__unlink"
                      disabled={!!busy}
                      aria-label={`Unlink ${j.ref || j.title} from ${o.name}`}
                      onClick={() => {
                        if (!window.confirm(`Unlink ${j.ref || j.title} from ${o.name}? The job itself doesn’t change.`)) return;
                        void act(`un-${j.id}`, async () => {
                          await orgApi(`/api/crm/projects/${j.id}/organisation`, 'PUT', { organisation_id: null });
                          return 'Unlinked.';
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
          <section className="crmh-card" aria-labelledby="org-details-h">
            <div className="crmh-card__h">
              <h3 id="org-details-h">Details</h3>
              <button type="button" className="crmr-edit crmh-ml" onClick={() => setSheet({ kind: 'edit' })}>
                ✎ Edit
              </button>
            </div>
            <div className="crmh-card__b crmr-fields">
              <Field label="Type">{orgTypeLabel(o.type)}</Field>
              <Field label="Phone">{tel ? <a href={tel}>{o.phone}</a> : <span className="crm-muted">None yet</span>}</Field>
              <Field label="Email">{mail ? <a href={mail} className="org-trunc">{o.email}</a> : <span className="crm-muted">None yet</span>}</Field>
              <Field label="Website">
                {web ? (
                  <a href={web} target="_blank" rel="noreferrer noopener" className="org-trunc">
                    {websiteShown(o.website)}
                  </a>
                ) : (
                  <span className="crm-muted">None yet</span>
                )}
              </Field>
              <Field label="Address">
                {o.address || o.postcode ? <span className="org-pre">{[o.address, o.postcode].filter(Boolean).join('\n')}</span> : <span className="crm-muted">None yet</span>}
              </Field>
              <Field label="Company no.">
                {o.company_number ? (
                  <a href={`https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(o.company_number)}`} target="_blank" rel="noreferrer noopener" title="On Companies House">
                    {o.company_number}
                  </a>
                ) : (
                  <span className="crm-muted">None yet</span>
                )}
              </Field>
              <Field label="VAT no.">{o.vat_number || <span className="crm-muted">None yet</span>}</Field>
            </div>
          </section>

          <NotesCard key={o.updated_at} org={o} onSaved={() => void reload()} />

          <p className="org-foot">
            <button type="button" className="crm-link org-danger" disabled={!!busy} onClick={deleteOrg}>
              Delete this organisation
            </button>
          </p>
        </div>
      </div>

      {sheet?.kind === 'edit' && (
        <Sheet title={`Edit ${o.name}`} onClose={() => setSheet(null)} wide>
          <OrgForm
            org={o}
            onCancel={() => setSheet(null)}
            onSaved={() => {
              setSheet(null);
              setNotice('Saved ✓');
              void reload();
            }}
          />
        </Sheet>
      )}
      {sheet?.kind === 'contact' && (
        <Sheet title={sheet.contact ? `Edit ${sheet.contact.name}` : `Add a contact at ${o.name}`} onClose={() => setSheet(null)} wide>
          <ContactForm
            orgId={id}
            contact={sheet.contact}
            first={!contacts.length}
            onCancel={() => setSheet(null)}
            onSaved={(c, warning) => {
              setSheet(null);
              if (warning) setError(warning);
              else setNotice(`${c.name} saved ✓`);
              void reload();
            }}
          />
        </Sheet>
      )}
      {sheet?.kind === 'link' && (
        <Sheet title={`Link a job to ${o.name}`} onClose={() => setSheet(null)} wide>
          <LinkJob
            org={o}
            contacts={contacts}
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

/** The organisation's notes: read, or edited in place. */
function NotesCard({ org, onSaved }: { org: Organisation; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(org.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true);
    setErr('');
    try {
      await orgApi(`/api/crm/organisations/${org.id}`, 'PATCH', { notes: text }, 'Not saved. Try again.');
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="crmh-card" aria-labelledby="org-notes-h">
      <div className="crmh-card__h">
        <h3 id="org-notes-h">Notes</h3>
        {!editing && (
          <button type="button" className="crmr-edit crmh-ml" onClick={() => setEditing(true)}>
            ✎ {org.notes ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      <div className="crmh-card__b">
        {editing ? (
          <>
            <label className="org-sr" htmlFor="org-notes-text">
              Notes
            </label>
            <textarea id="org-notes-text" className="crm-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Access, how they like to work, who signs off…" />
            {err && <p className="crm-banner crm-banner--err">{err}</p>}
            <div className="crm-savebar">
              <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                onClick={() => {
                  setText(org.notes ?? '');
                  setEditing(false);
                  setErr('');
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : org.notes ? (
          <p className="org-pre org-notes">{org.notes}</p>
        ) : (
          <p className="crm-muted org-none">Nothing yet.</p>
        )}
      </div>
    </section>
  );
}

type FoundJob = { id: string; title: string; stage: string; ref: string | null; customer: string };

/** Find a job by its customer's name, postcode, phone or HX-ref (the global search), and link it with the contact it's dealt with through. */
function LinkJob({
  org,
  contacts,
  linked,
  onCancel,
  onLinked,
}: {
  org: Organisation;
  contacts: OrgContact[];
  linked: Set<string>;
  onCancel: () => void;
  onLinked: (words: string) => void;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; jobs: FoundJob[]; error: string } | null>(null);
  const [job, setJob] = useState<FoundJob | null>(null);
  const [contact, setContact] = useState(contacts.find((c) => c.is_primary)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
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

  async function link() {
    if (!job) return;
    setBusy(true);
    setErr('');
    try {
      await orgApi(`/api/crm/projects/${job.id}/organisation`, 'PUT', { organisation_id: org.id, contact_id: contact || null }, 'Not linked. Try again.');
      const who = contacts.find((c) => c.id === contact)?.name;
      onLinked(`${job.ref || job.customer} linked${who ? `, with ${who}` : ''} ✓`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not linked. Try again.');
      setBusy(false);
    }
  }

  const fresh = found?.q === t;
  return (
    <div className="org-form">
      {job ? (
        <div className="crmh-picked">
          <span>
            <b>{job.customer}</b>
            <small> · {[job.ref, job.title, job.stage].filter(Boolean).join(' · ')}</small>
          </span>
          <button type="button" className="crm-link" onClick={() => setJob(null)}>
            Change
          </button>
        </div>
      ) : (
        <div className="crmh-picker">
          <label className="crm-label" htmlFor="org-link-q">
            Find the job
          </label>
          <input
            id="org-link-q"
            className="crm-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Customer name, postcode, phone or HX-ref"
            autoFocus
            autoComplete="off"
            enterKeyHint="search"
          />
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
                    <button type="button" onClick={() => setJob(j)} disabled={linked.has(j.id)}>
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
      )}
      {contacts.length > 0 && (
        <>
          <label className="crm-label" htmlFor="org-link-contact">
            Who at {org.name} is it dealt with through?
          </label>
          <select id="org-link-contact" className="crm-input" value={contact} onChange={(e) => setContact(e.target.value)}>
            <option value="">Nobody in particular</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` · ${c.role}` : ''}
                {c.is_primary ? ' (primary)' : ''}
              </option>
            ))}
          </select>
        </>
      )}
      <p className="crm-muted crm-small">A job linked to another organisation moves to this one; its timeline says so.</p>
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
