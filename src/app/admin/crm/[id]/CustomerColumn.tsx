'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isProjectStage, money, portalOpen, PRODUCTS, productLabel, stageIndex, stageLabel } from '@/lib/crm/stages';
import type { TeamMember } from '@/lib/projects/server';
import type { SchemaReady } from '@/lib/schema-ready';
import type { TrackerStep } from '@/lib/crm/tracker';
import type { JobContact, JobOrganisation } from '@/lib/organisations/shared';
import { followsCustomerPostcode, siteHasOtherPostcode } from '@/lib/crm/site-postcode';
import { toWaId } from '@/lib/whatsapp/shared';
import { StageChip } from '../CrmUi';
import { firstName, jobLabel, shortDate, ukDayOf } from '../crm-shared';
import { OrganisationCard } from './OrganisationCard';
import { PortalMessages } from './PortalMessages';
import { DnoDeposit, PortalCard } from './ProjectExtras';
import {
  copyText,
  dayWord,
  daysSince,
  phoneShown,
  postcodeHint,
  send,
  siteOf,
  ukWhen,
  type Area,
  type Customer,
  type OtherJob,
  type Project,
  type SurveyItem,
  type WaInfo,
} from './record-shared';

/**
 * The record page's left column (research 2.3 "LEFT"): Important, Customer, Organisation, Other projects, Job
 * details, the customer portal and Quote & deposit · DNO (Unit Q's cards, props unchanged), then the
 * footer. Below 1280px the same column is the Details tab. Each card has one Edit and one Save.
 */
export function CustomerColumn({
  project,
  customer,
  wa,
  others,
  surveys,
  team,
  schema,
  area,
  now,
  portal,
  tracker,
  stripe,
  isAdmin,
  editCustomer,
  onSaved,
  onSaveProject,
  onSendWhatsApp,
  onDelete,
  onNewProject,
  tasksElsewhere,
  organisation,
  contact,
}: {
  project: Project;
  customer: Customer;
  wa: WaInfo;
  others: OtherJob[];
  surveys: SurveyItem[];
  team: TeamMember[];
  schema: SchemaReady;
  area: Area;
  now: number;
  portal: string | null;
  tracker: TrackerStep[];
  stripe: boolean;
  isAdmin: boolean;
  /** A new number opens the Customer card for editing with the mobile focused (the dock's "Add mobile"). */
  editCustomer: number;
  onSaved: () => Promise<void> | void;
  onSaveProject: (b: Record<string, unknown>) => Promise<boolean>;
  onSendWhatsApp: (text: string) => void;
  onDelete: () => void;
  onNewProject: () => void;
  /** The Tasks card, at the top, while the open WhatsApp panel is showing Chats (no right-hand column then). */
  tasksElsewhere?: ReactNode;
  /** The job's organisation and the person it's dealt with through (organisations.sql): their card shows once that's run. */
  organisation?: JobOrganisation | null;
  contact?: JobContact | null;
}) {
  const base = area === 'projects' ? '/admin/projects' : '/admin/crm';
  const flagged = surveys.filter((s) => s.flags.length > 0);
  const important = !!project.on_hold || flagged.length > 0;
  const atQuote = project.stage === 'lost' ? stageIndex('quote_sent') : stageIndex(project.stage);
  const quoteOn = atQuote >= stageIndex('quote_sent');
  // The portal card from Surveyed: its "Send quote for signing" is how the quote goes out (research 2.6).
  const portalShown = atQuote >= stageIndex('surveyed') || !!portal;
  const dnoShown = quoteOn || !!project.deposit_amount || !!project.accepted_at || (!!project.dno_status && project.dno_status !== 'not_started');
  const days = daysSince(project.stage_changed_at || project.created_at, now);
  // After Customer → Edit: their other jobs whose site postcode changed with it (kept here, as the card starts afresh).
  const [movedNote, setMovedNote] = useState('');

  return (
    <div className="crmr-col">
      {tasksElsewhere}
      {important && (
        <section className="crmh-card crmr-important" aria-label="Important">
          <div className="crmh-card__b">
            {project.on_hold && (
              <p>
                <b>On hold</b>
                {project.hold_reason ? `: ${project.hold_reason}` : ''}
              </p>
            )}
            {flagged.map((s) => (
              <p key={s.id}>
                <b>
                  Survey flagged {s.flags.length} thing{s.flags.length === 1 ? '' : 's'}
                </b>{' '}
                <a href={s.status === 'complete' ? `/admin/surveys/${s.id}/report` : `/admin/surveys/${s.id}`} className="crmh-link">
                  See the survey
                </a>
              </p>
            ))}
          </div>
        </section>
      )}

      <CustomerCard
        key={`${customer.id}-${customer.phone}-${customer.name}-${customer.email}-${customer.postcode}`}
        customer={customer}
        project={project}
        wa={wa}
        team={team}
        editKey={editCustomer}
        note={movedNote}
        onMoved={setMovedNote}
        onSaved={onSaved}
      />

      {schema.organisations && <OrganisationCard projectId={project.id} organisation={organisation ?? null} contact={contact ?? null} onChanged={onSaved} />}

      {others.length > 0 && (
        <section className="crmh-card" aria-label="Other projects">
          <div className="crmh-card__h">
            <h3>Other projects for {firstName(customer.name) || 'them'}</h3>
            <span className="crmh-n">{others.length}</span>
          </div>
          <ul className="crmr-others__list">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={`${base}/${o.id}`}>
                  {o.project_ref && <span className="crmr-ref">{o.project_ref}</span>}
                  <span className="crmr-others__t">{o.title}</span>
                  <StageChip stage={o.stage} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JobDetails key={project.id} project={project} customer={customer} team={team} schema={schema} onSave={onSaveProject} />

      {portalShown ? (
        <section className="crmr-slot" aria-label="Customer portal">
          <PortalCard id={project.id} portal={portal} open={portalOpen(project.stage)} tracker={tracker} onSendWhatsApp={onSendWhatsApp} />
        </section>
      ) : (
        <p className="crmr-grey">
          <b>Customer portal</b> appears at Surveyed, to send the quote for signing.
        </p>
      )}
      {portalShown && schema.quotes && <PortalMessages key={project.id} projectId={project.id} />}
      {dnoShown ? (
        <section className="crmh-card crmr-slot crmr-slot--dno" aria-label="Quote, deposit and DNO">
          <div className="crmh-card__b">
            <DnoDeposit key={`${project.id}-${project.updated_at}`} project={project} stripe={stripe} onSave={onSaveProject} />
          </div>
        </section>
      ) : (
        <p className="crmr-grey">
          <b>Quote &amp; deposit · DNO</b> appears at Quote sent.
        </p>
      )}

      <div className="crmr-foot">
        <span>
          Created {shortDate(ukDayOf(project.created_at))}
          {days !== null ? ` · ${stageLabel(project.stage)} ${days === 0 ? 'since today' : `for ${dayWord(days)}`}` : ''}
        </span>
        <span className="crmr-foot__acts">
          <button type="button" className="crm-link" onClick={onNewProject}>
            New project for {firstName(customer.name) || 'them'}
          </button>
          {isAdmin && (
            <button type="button" className="crm-link crmr-danger" onClick={onDelete}>
              Delete this job
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** Tablets: the customer in brief beside the Tasks card, with the rest one tap away in Details. */
export function CompactCustomer({ project, customer, wa, onDetails }: { project: Project; customer: Customer; wa: WaInfo; onDetails: () => void }) {
  const phone = phoneShown(customer, wa.number);
  const site = siteOf(project, customer);
  return (
    <section className="crmh-card crmr-compact" aria-label="Customer">
      <div className="crmh-card__h">
        <h3>Customer</h3>
        <button type="button" className="crmh-link crmh-ml crmr-linkbtn" onClick={onDetails}>
          All details →
        </button>
      </div>
      <div className="crmh-card__b crmr-fields">
        <Field label="Mobile">{phone || <span className="crm-muted">No mobile yet</span>}</Field>
        <Field label="Site" extra={postcodeHint(project, customer)}>
          {site || <span className="crm-muted">No address yet</span>}
        </Field>
        <Field label="WhatsApp">{waLine(customer, wa)}</Field>
      </div>
    </section>
  );
}

function Field({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="crmr-field">
      <span className="crmr-field__l">{label}</span>
      <span className="crmr-field__v">{children}</span>
      {extra && <span className="crmr-field__x">{extra}</span>}
    </div>
  );
}

/** The other numbers and emails a merge kept (for search and incoming messages): make one the main one, or forget it. */
function OtherNumbers({ customer, onSaved, onError }: { customer: Customer; onSaved: () => Promise<void> | void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState('');
  async function act(o: NonNullable<Customer['otherNumbers']>[number], action: 'main' | 'remove') {
    // The number they WhatsApp from, when it isn't their phone, is kept too.
    const waOnly = customer.wa_id && customer.wa_id !== o.value && customer.wa_id !== toWaId(customer.phone) ? phoneShown({ phone: null }, customer.wa_id) : null;
    const now = [customer.phone, waOnly].filter(Boolean).join(' and ') || 'the number they have now';
    const ask =
      action === 'main'
        ? o.kind === 'phone'
          ? `Make ${o.shown} ${customer.name}’s main number? WhatsApp replies go to it from now on, and ${now} ${customer.phone && waOnly ? 'are kept as other numbers' : 'is kept as another number'}.`
          : `Make ${o.shown} ${customer.name}’s email? The one they have now is kept as another email.`
        : `Forget ${o.shown}? Search and incoming ${o.kind === 'phone' ? 'WhatsApps' : 'emails'} won’t find ${customer.name} by it any more.`;
    if (!window.confirm(ask)) return;
    setBusy(`${o.kind}:${o.value}`);
    try {
      await send(`/api/crm/customers/${customer.id}/numbers`, 'POST', { kind: o.kind, value: o.value, action });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy('');
    }
  }
  return (
    <Field label="Other numbers">
      <span className="crmr-others-n">
        {customer.otherNumbers!.map((o) => (
          <span key={`${o.kind}:${o.value}`} className="crmr-other-n">
            <span className="crmr-wrap">
              {o.shown}
              {o.from_ref ? <small> from {o.from_ref}</small> : null}
            </span>
            <span className="crmr-other-n__acts">
              <button type="button" className="crm-link" disabled={!!busy} onClick={() => void act(o, 'main')}>
                {o.kind === 'phone' ? 'Use for WhatsApp' : 'Make main'}
              </button>
              <button type="button" className="crm-link" disabled={!!busy} onClick={() => void act(o, 'remove')}>
                Remove
              </button>
            </span>
          </span>
        ))}
      </span>
    </Field>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="crmr-copy"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

/** "Agreed on 3 Oct via the website form", "Replied STOP on 3 Oct: …" (the server's words), "Linked · 42 messages", or how to link one. */
function waLine(customer: Customer, wa: WaInfo): string {
  if (customer.whatsapp_permission_words) return customer.whatsapp_permission_words;
  if (customer.whatsapp_opt_in) {
    const when = customer.whatsapp_opt_in_at ? ` ${shortDate(ukDayOf(customer.whatsapp_opt_in_at)).replace(/^\w+ /, '')}` : '';
    return `Agreed${when}${customer.whatsapp_opt_in_source ? ` via ${customer.whatsapp_opt_in_source}` : ''}`;
  }
  if (wa.number) return wa.messages ? `Linked · ${wa.messages} message${wa.messages === 1 ? '' : 's'}` : 'No chat on this number yet';
  return 'Add a mobile and any chat on that number links here';
}

function CustomerCard({
  customer,
  project,
  wa,
  team,
  editKey,
  note,
  onMoved,
  onSaved,
}: {
  customer: Customer;
  project: Project;
  wa: WaInfo;
  team: TeamMember[];
  editKey: number;
  note: string;
  onMoved: (note: string) => void;
  onSaved: () => Promise<void> | void;
}) {
  const init = { name: customer.name, phone: customer.phone || '', email: customer.email || '', postcode: customer.postcode || '' };
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mobile = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);
  const seenKey = useRef(editKey);

  // The dock's "Add mobile": open for editing, with the cursor in the mobile box.
  useEffect(() => {
    if (editKey === seenKey.current) return;
    seenKey.current = editKey;
    // Opening the editor is the point of the event (a message from outside React).
    setEditing(true);
  }, [editKey]);
  useEffect(() => {
    if (!editing) return;
    card.current?.scrollIntoView({ block: 'nearest' });
    if (!customer.phone) mobile.current?.focus();
  }, [editing, customer.phone]);

  const phone = phoneShown(customer, wa.number);
  const site = siteOf(project, customer);
  const owner = team.find((t) => t.id === project.owner_id)?.name;
  const hasOptIn = 'whatsapp_opt_in' in customer;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  // Under the postcode box: whether this job's site postcode changes with it (the save's own rule), or
  // where to change it when it doesn't (a lead form's "88888" copied onto the job before this rule, or
  // a job from Won onwards, whose checked site stays when the customer moves).
  const siteLine = !f.postcode.trim()
    ? ''
    : !isProjectStage(project.stage) && followsCustomerPostcode(project, customer.postcode, f.postcode)
      ? 'The site address on this job changes too.'
      : siteHasOtherPostcode(project, f.postcode)
        ? 'This job has its own site address: change it in Job details.'
        : '';

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const d = await send<{ movedJobs?: string[] }>(`/api/crm/customers/${customer.id}`, 'PATCH', f);
      const others = (d.movedJobs ?? []).filter((j) => j !== project.id).length;
      onMoved(others ? `The site postcode on ${others === 1 ? 'their other job' : `${others} of their other jobs`} changed too.` : '');
      setEditing(false);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }
  async function permission(on: boolean) {
    const ask = on
      ? `Has ${customer.name} agreed to WhatsApp messages from us? Only switch this on if they have.`
      : `Turn off WhatsApp permission for ${customer.name}? They’ll get no automatic WhatsApps from us (reminders, follow-ups, smart replies) until they reply START or someone here turns it back on. You can still message them yourself.`;
    if (!window.confirm(ask)) return;
    setErr('');
    const url = `/api/crm/customers/${customer.id}`;
    try {
      const d = await send<{ warning?: string }>(url, 'PATCH', { whatsapp_opt_in: on }).catch(async (e: Error & { status?: number; data?: { stopped?: boolean } }) => {
        // They replied STOP, or someone here switched it off: it only comes back on once you've
        // confirmed the customer asked us to start again.
        if (!on || e.status !== 409 || !e.data?.stopped) throw e;
        if (!window.confirm(`${e.message}\n\nHas ${customer.name} asked us to start messaging them again? OK switches it back on.`)) return null;
        return send<{ warning?: string }>(url, 'PATCH', { whatsapp_opt_in: true, lift_stop: true });
      });
      if (!d) return;
      await onSaved();
      if (d.warning) setErr(d.warning);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    }
  }

  return (
    <section className="crmh-card crmr-customer" ref={card} aria-label="Customer">
      <div className="crmh-card__h">
        <h3>Customer</h3>
        {!editing && (
          <button type="button" className="crmr-edit crmh-ml" onClick={() => setEditing(true)}>
            ✎ Edit
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="crmh-card__b crmr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="crm-label" htmlFor="rec-c-name">
            Name
          </label>
          <input id="rec-c-name" className="crm-input" value={f.name} onChange={set('name')} />
          <label className="crm-label" htmlFor="rec-c-phone">
            Mobile
          </label>
          <input id="rec-c-phone" ref={mobile} className="crm-input" type="tel" value={f.phone} onChange={set('phone')} placeholder="07700 900123" />
          <label className="crm-label" htmlFor="rec-c-email">
            Email
          </label>
          <input id="rec-c-email" className="crm-input" type="email" value={f.email} onChange={set('email')} />
          <label className="crm-label" htmlFor="rec-c-pc">
            Postcode
          </label>
          <input id="rec-c-pc" className="crm-input" value={f.postcode} onChange={set('postcode')} aria-describedby={siteLine ? 'rec-c-pc-site' : undefined} />
          {siteLine && (
            <p id="rec-c-pc-site" className="crm-muted crm-small">
              {siteLine}
            </p>
          )}
          <p className="crm-muted crm-small">Any WhatsApp chat on the mobile number links to this customer by itself.</p>
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crmr-savebar">
            <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || !f.name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={() => {
                setF(init);
                setEditing(false);
                setErr('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="crmh-card__b crmr-fields">
          <Field label="Mobile">
            {phone ? (
              <>
                <span className="crmr-trunc">{phone}</span>
                <CopyButton text={phone} />
              </>
            ) : (
              <button type="button" className="crm-link crmr-inline" onClick={() => setEditing(true)}>
                Add their mobile
              </button>
            )}
          </Field>
          <Field label="WhatsApp" extra={hasOptIn && wa.number ? (wa.messages ? `Linked · ${wa.messages} message${wa.messages === 1 ? '' : 's'}` : 'No chat yet') : undefined}>
            {hasOptIn && (
              <button
                type="button"
                role="switch"
                aria-checked={!!customer.whatsapp_opt_in}
                className={`crmr-switch${customer.whatsapp_opt_in ? ' on' : ''}`}
                onClick={() => void permission(!customer.whatsapp_opt_in)}
                aria-label="WhatsApp permission"
              />
            )}
            <span className={customer.whatsapp_permission_words ? 'crmr-wrap' : 'crmr-trunc'}>
              {hasOptIn && !customer.whatsapp_opt_in && !customer.whatsapp_permission_words ? 'Not agreed yet' : waLine(customer, wa)}
            </span>
          </Field>
          <Field label="Email">{customer.email ? <span className="crmr-trunc">{customer.email}</span> : <span className="crm-muted">No email</span>}</Field>
          <Field label="Site address" extra={postcodeHint(project, customer)}>
            {site ? (
              <>
                <span className="crmr-wrap">{site}</span>
                <CopyButton text={site} />
              </>
            ) : (
              <span className="crm-muted">No address yet</span>
            )}
          </Field>
          <Field
            label="Source"
            extra={
              <>
                {[customer.source_note, customer.created_at ? `Came in ${ukWhen(customer.created_at)}` : ''].filter(Boolean).join(' · ') || null}
                {/* Leads of records merged into them (src/lib/crm/merge.ts). */}
                {customer.alsoCameIn?.map((o) => (
                  <span key={`${o.label}|${o.at}`} className="crmr-also">
                    Also came in via {o.label}
                    {o.at ? ` on ${shortDate(ukDayOf(o.at)).replace(/^\w+ /, '')}` : ''}
                    {o.ref ? ` (${o.ref})` : ''}
                  </span>
                ))}
              </>
            }
          >
            <span className="crmr-wrap">{customer.source_label || customer.source || 'Not known'}</span>
          </Field>
          {!!customer.otherNumbers?.length && <OtherNumbers customer={customer} onSaved={onSaved} onError={setErr} />}
          <Field label="Owner">{owner || <span className="crm-muted">Nobody yet</span>}</Field>
          {note && <p className="crm-muted crm-small">{note}</p>}
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
        </div>
      )}
    </section>
  );
}

function JobDetails({
  project,
  customer,
  team,
  schema,
  onSave,
}: {
  project: Project;
  customer: Customer;
  team: TeamMember[];
  schema: SchemaReady;
  onSave: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const init = {
    title: project.title,
    products: project.products,
    value: project.value == null ? '' : String(project.value),
    owner_id: project.owner_id || '',
    address: project.address || '',
    postcode: project.postcode || '',
    simpliheat_url: project.simpliheat_url || '',
    opensolar_url: project.opensolar_url || '',
    lost_reason: project.lost_reason || '',
    notes: project.notes || '',
    on_hold: !!project.on_hold,
    hold_reason: project.hold_reason || '',
  };
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const fromForm = [customer.property_type, customer.interest].filter(Boolean).join(' · ');
  // Only a name of its own (not just the customer and postcode, which are shown already).
  const ownTitle = jobLabel({ customer: customer.name, title: project.title, postcode: project.postcode || customer.postcode, customer_projects: 2 }) !== customer.name;

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = {
      title: f.title,
      products: f.products,
      value: f.value === '' ? null : Number(f.value.replace(/[£,\s]/g, '')),
      owner_id: f.owner_id || null,
      address: f.address,
      postcode: f.postcode,
      simpliheat_url: f.simpliheat_url,
      opensolar_url: f.opensolar_url,
      notes: f.notes,
      ...(project.stage === 'lost' ? { lost_reason: f.lost_reason } : {}),
      ...(schema.crmV3 && (f.on_hold !== init.on_hold || f.hold_reason !== init.hold_reason) ? { on_hold: f.on_hold, hold_reason: f.hold_reason } : {}),
    };
    const ok = await onSave(body);
    setBusy(false);
    if (ok) setEditing(false);
  }

  const link = (url: string | null) =>
    url ? (
      <>
        <span className="crmr-trunc">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
        <a className="crmr-copy" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
      </>
    ) : (
      <span className="crm-muted">Not linked</span>
    );

  return (
    <section className="crmh-card crmr-job" aria-label="Job details">
      <div className="crmh-card__h">
        <h3>Job details</h3>
        {!editing && (
          <button
            type="button"
            className="crmr-edit crmh-ml"
            onClick={() => {
              // What's saved now, not when the card first showed (it isn't remounted by the page's polls).
              setF(init);
              setEditing(true);
            }}
          >
            ✎ Edit
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="crmh-card__b crmr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="crm-label" htmlFor="rec-j-title">
            Job name
          </label>
          <input id="rec-j-title" className="crm-input" value={f.title} onChange={set('title')} />
          <span className="crm-label">Products</span>
          <div className="crm-checks">
            {PRODUCTS.map((p) => (
              <label key={p.key} className={f.products.includes(p.key) ? 'on' : ''}>
                <input
                  type="checkbox"
                  checked={f.products.includes(p.key)}
                  onChange={(e) => setF({ ...f, products: e.target.checked ? [...f.products, p.key] : f.products.filter((x) => x !== p.key) })}
                />
                {p.label}
              </label>
            ))}
          </div>
          <div className="crm-grid2">
            <div>
              <label className="crm-label" htmlFor="rec-j-value">
                Value £ (inc. VAT)
              </label>
              <input id="rec-j-value" className="crm-input" inputMode="decimal" value={f.value} onChange={set('value')} />
            </div>
            <div>
              <label className="crm-label" htmlFor="rec-j-owner">
                Owner
              </label>
              <select id="rec-j-owner" className="crm-input" value={f.owner_id} onChange={set('owner_id')}>
                <option value="">Nobody</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="crm-label" htmlFor="rec-j-addr">
            Site address
          </label>
          <input id="rec-j-addr" className="crm-input" value={f.address} onChange={set('address')} placeholder="If different from the customer’s" />
          <label className="crm-label" htmlFor="rec-j-pc">
            Site postcode
          </label>
          <input id="rec-j-pc" className="crm-input" value={f.postcode} onChange={set('postcode')} />
          <label className="crm-label" htmlFor="rec-j-os">
            OpenSolar project link
          </label>
          <input id="rec-j-os" className="crm-input" type="url" value={f.opensolar_url} onChange={set('opensolar_url')} placeholder="https://…" />
          <label className="crm-label" htmlFor="rec-j-sh">
            SimpliHeat project link
          </label>
          <input id="rec-j-sh" className="crm-input" type="url" value={f.simpliheat_url} onChange={set('simpliheat_url')} placeholder="https://…" />
          {project.stage === 'lost' && (
            <>
              <label className="crm-label" htmlFor="rec-j-lost">
                Why was it lost?
              </label>
              <input id="rec-j-lost" className="crm-input" value={f.lost_reason} onChange={set('lost_reason')} placeholder="Price, timing, went elsewhere…" />
            </>
          )}
          {schema.crmV3 && (
            <>
              <label className="crm-check">
                <input type="checkbox" checked={f.on_hold} onChange={(e) => setF({ ...f, on_hold: e.target.checked })} /> On hold
              </label>
              {f.on_hold && <input className="crm-input" value={f.hold_reason} onChange={set('hold_reason')} placeholder="Why? e.g. waiting for the roof survey" aria-label="Why it’s on hold" />}
            </>
          )}
          <label className="crm-label" htmlFor="rec-j-notes">
            Notes
          </label>
          <textarea id="rec-j-notes" className="crm-input" rows={4} value={f.notes} onChange={set('notes')} />
          <p className="crm-muted crm-small">Survey and install dates are under Overview, in Dates and team.</p>
          <div className="crmr-savebar">
            <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || !f.title.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={() => {
                setF(init);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="crmh-card__b crmr-fields">
          <Field label="Products">
            {project.products.length ? (
              <span className="crmr-tags">
                {project.products.map((p) => (
                  <span key={p} className="crmr-tag">
                    {productLabel(p)}
                  </span>
                ))}
              </span>
            ) : (
              <span className="crm-muted">Not set yet</span>
            )}
          </Field>
          <Field label="Value inc. VAT">{project.value ? money(project.value) : <span className="crm-muted">Not set yet</span>}</Field>
          {ownTitle && <Field label="Job name">{<span className="crmr-wrap">{project.title}</span>}</Field>}
          {fromForm && <Field label="From the form">{<span className="crmr-wrap">{fromForm}</span>}</Field>}
          <Field label="OpenSolar">{link(project.opensolar_url)}</Field>
          {(project.simpliheat_url || project.products.includes('heatpump')) && <Field label="SimpliHeat">{link(project.simpliheat_url)}</Field>}
          {(project.survey_at || project.install_at) && (
            <Field label="Dates">
              <span className="crmr-wrap">
                {[project.survey_at ? `Survey ${ukWhen(project.survey_at)}` : '', project.install_at ? `Install ${ukWhen(project.install_at)}` : ''].filter(Boolean).join(' · ')}
              </span>
            </Field>
          )}
          {project.stage === 'lost' && <Field label="Why it was lost">{project.lost_reason || <span className="crm-muted">Not said</span>}</Field>}
          {project.notes && (
            <Field label="Notes">
              <span className="crmr-wrap crmr-notes">{project.notes}</span>
            </Field>
          )}
        </div>
      )}
    </section>
  );
}
