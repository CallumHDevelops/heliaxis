'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { CATEGORY_BY_KEY, compliance, DOC_CATEGORIES, expiryState, operativeCompliance } from '@/lib/subcontractors/documents';
import {
  CIS_LABEL,
  ENTITY_LABEL,
  ASSIGNMENT_LABEL,
  STATUS_LABEL,
  type AssignmentRow,
  type DocumentRow,
  type EventRow,
  type OperativeRow,
  type PullRow,
  type NtpRow,
  NTP_STATUS_LABEL,
  type SubcontractorRow,
} from '@/lib/subcontractors/types';
import {
  cancelNtp,
  remindNow,
  resendNtpLink,
  setRemindersPaused,
  countersign,
  countersignNtp,
  deleteDocument,
  reviewDocument,
  saveNotes,
  sendLink,
  sendNtp,
  setStatus,
  signOutEverywhere,
  updateTerms,
} from '../actions';
import { NTP_TECHNOLOGIES } from '@/lib/subcontractors/ntp-agreement';
import { TermsForm } from '../TermsForm';
import '../subcontractors.css';

type AgreementSummary = {
  subName: string;
  subTitle: string | null;
  subSignedAt: string;
  subIp: string | null;
  hlxName: string | null;
  hlxSignedAt: string | null;
  hlxSignedBy: string | null;
  version: string;
  intact: boolean;
} | null;

const fmt = (iso: string | null | undefined, time = false) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : '—';

const EVENT_LABEL: Record<string, string> = {
  signed_in: 'Signed in',
  reminder_digest_sent: 'Reminder emailed',
  reminders_paused: 'Reminders paused',
  reminders_resumed: 'Reminders resumed',
  ntp_link_sent: 'NTP signing link sent',
  ntp_sent: 'NTP agreement sent',
  ntp_renewal_sent: 'NTP renewal sent',
  ntp_signed: 'NTP agreement signed',
  ntp_countersigned: 'NTP agreement countersigned',
  ntp_cancelled: 'NTP agreement cancelled',
  ntp_expired: 'NTP agreement expired',
  sessions_revoked: 'Signed out everywhere',
  document_viewed: 'Document viewed by Heliaxis',
  document_downloaded: 'Document downloaded by Heliaxis',
  operative_added: 'Team member added',
  operative_updated: 'Team member updated',
  operative_archived: 'Team member removed',
  assignment_created: 'Booked onto a job',
  assignment_cancelled: 'Job cancelled',
  assignment_declined: 'Job declined',
  crew_confirmed: 'Crew confirmed',
  crew_changed: 'Crew changed',
  rams_webhook: 'RAMS notified',
  documents_pulled: 'Documents pulled by RAMS',
  expiry_reminder_sent: 'Expiry reminder emailed',
  created: 'Record created',
  invite_sent: 'Invite emailed',
  reminder_sent: 'Reminder emailed',
  link_created: 'New portal link generated',
  details_saved: 'Details saved',
  agreement_signed: 'Agreement signed by subcontractor',
  agreement_countersigned: 'Agreement countersigned',
  document_uploaded: 'Document uploaded',
  document_removed: 'Document withdrawn by subcontractor',
  document_approved: 'Document approved',
  document_rejected: 'Document rejected',
  document_pending: 'Document review reset',
  document_deleted: 'Document deleted',
  documents_submitted: 'Documents sent for review',
  status_changed: 'Status changed',
  terms_updated: 'Terms updated',
};

export function SubcontractorDetail({
  sub,
  agreement,
  documents,
  events,
  adminName,
  team,
  jobs,
  pulls,
  ntps,
  reminders,
}: {
  sub: SubcontractorRow;
  agreement: AgreementSummary;
  documents: DocumentRow[];
  events: EventRow[];
  adminName: string;
  team: OperativeRow[];
  jobs: AssignmentRow[];
  pulls: PullRow[];
  ntps: NtpRow[];
  reminders: { paused: boolean; outstanding: { kind: string; text: string; urgent: boolean }[] };
}) {
  const router = useRouter();
  // "Make NTP" on a team member opens the NTP form with them chosen.
  const [ntpFor, setNtpFor] = useState<{ id: string; n: number } | null>(null);
  const d = sub.details || {};
  const comp = compliance(d, documents);
  const [link, setLink] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(sub.notes || '');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(true);
    setFlash(null);
    const r = await fn();
    setBusy(false);
    setFlash(r.ok ? { kind: 'ok', text: okText } : { kind: 'err', text: (r as { error: string }).error });
    if (r.ok) router.refresh();
    return r;
  }

  const unsigned = !agreement;

  return (
    <div className="sc-page">
      <Link className="sc-back" href="/admin/subcontractors">← All subcontractors</Link>
      <div className="sc-head">
        <div>
          <p className="sc-ref">{sub.ref}</p>
          <h1>{sub.company_name}</h1>
          <p>
            {sub.contact_name} · <a href={`mailto:${sub.email}`}>{sub.email}</a>
            {sub.phone && <> · <a href={`tel:${sub.phone}`}>{sub.phone}</a></>}
            {sub.trade && <> · {sub.trade}</>}
          </p>
        </div>
        <span className={`sc-status s-${sub.status}`}>{STATUS_LABEL[sub.status]}</span>
      </div>

      {flash && <div className={`sc-banner is-${flash.kind}`}>{flash.text}</div>}
      {link && (
        <div className="sc-banner is-ok">
          New portal link (the previous one no longer works):
          <code className="sc-link">{link}</code>
          <button className="sc-btn-ghost" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
        </div>
      )}

      <div className="sc-actions">
        {sub.status !== 'terminated' && (
          <>
            <button
              className="sc-btn-ghost"
              disabled={busy}
              onClick={() => run(() => sendLink(sub.id, sub.invited_at ? 'reminder' : 'email'), `Link emailed to ${sub.email}.`)}
            >
              {sub.invited_at ? 'Email a reminder' : 'Email invite'}
            </button>
            <button
              className="sc-btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (!confirm('Generate a new link? Any link already sent will stop working.')) return;
                const r = await sendLink(sub.id, 'copy');
                if (r.ok) setLink(r.link);
                else setFlash({ kind: 'err', text: r.error });
              }}
            >
              New link to copy
            </button>
          </>
        )}
        {sub.status !== 'terminated' && (
          <button
            className="sc-btn-ghost"
            disabled={busy}
            onClick={() => {
              if (confirm('Sign this subcontractor out of every device? They can sign back in with an email code.'))
                run(() => signOutEverywhere(sub.id), 'Signed out everywhere.');
            }}
          >
            Sign out everywhere
          </button>
        )}
        {sub.status === 'active' && (
          <button className="sc-btn-ghost" disabled={busy} onClick={() => run(() => setStatus(sub.id, 'suspended'), 'Suspended.')}>
            Suspend
          </button>
        )}
        {sub.status === 'suspended' && (
          <button
            className="sc-btn-ghost"
            disabled={busy}
            onClick={() => run(() => setStatus(sub.id, agreement?.hlxSignedAt ? 'active' : 'in_progress'), 'Reinstated.')}
          >
            Reinstate
          </button>
        )}
        {sub.status !== 'terminated' && (
          <button
            className="sc-btn-ghost is-danger"
            disabled={busy}
            onClick={() => {
              if (confirm('Terminate this subcontractor? Their portal link stops working. Records are kept.'))
                run(() => setStatus(sub.id, 'terminated'), 'Terminated.');
            }}
          >
            Terminate
          </button>
        )}
      </div>

      <div className="sc-cols">
        <div className="sc-col-main">
          {/* ---------------- agreement ---------------- */}
          <section className="sc-card">
            <div className="sc-row-between">
              <h2>Framework Agreement</h2>
              <a className="sc-link-btn" href={`/admin/subcontractors/${sub.id}/agreement`} target="_blank" rel="noreferrer">
                View / print ↗
              </a>
            </div>
            {!agreement && (
              <p className="sc-muted">
                Not signed yet.{' '}
                {sub.details_completed_at ? 'Details are complete — waiting for their signature.' : 'Waiting for them to complete their details.'}
              </p>
            )}
            {agreement && (
              <dl className="sc-dl">
                <dt>Subcontractor</dt>
                <dd>{agreement.subName}{agreement.subTitle && `, ${agreement.subTitle}`} · {fmt(agreement.subSignedAt, true)} · IP {agreement.subIp || '?'}</dd>
                <dt>Heliaxis</dt>
                <dd>{agreement.hlxSignedAt ? `${agreement.hlxName} (${agreement.hlxSignedBy}) · ${fmt(agreement.hlxSignedAt, true)}` : 'Not countersigned'}</dd>
                <dt>Version</dt>
                <dd>{agreement.version} · {agreement.intact ? '✓ integrity verified' : '⚠ signed record has been altered'}</dd>
              </dl>
            )}
            {agreement && !agreement.hlxSignedAt && (
              <Countersign
                subId={sub.id}
                defaultName={adminName}
                comp={comp}
                intact={agreement.intact}
                onDone={() => {
                  setFlash({ kind: 'ok', text: 'Countersigned — the agreement is live and a copy has been emailed to them.' });
                  router.refresh();
                }}
              />
            )}
          </section>

          {/* ---------------- documents ---------------- */}
          <section className="sc-card">
            <h2>Documents</h2>
            <ComplianceSummary comp={comp} />
            {DOC_CATEGORIES.map((cat) => {
              const list = documents.filter((x) => x.category === cat.key);
              if (!list.length && !cat.required(d)) return null;
              return (
                <div key={cat.key} className="sc-doc-group">
                  <h3>
                    {cat.label}
                    {cat.required(d) && <span className="sc-pill">Required</span>}
                  </h3>
                  {list.length === 0 && <p className="sc-missing">Nothing uploaded</p>}
                  {list.map((doc) => <DocRow key={doc.id} doc={doc} onChanged={() => router.refresh()} />)}
                </div>
              );
            })}
          </section>
          <NtpPanel
            subId={sub.id}
            ntps={ntps}
            team={team}
            frameworkLive={!!agreement?.hlxSignedAt}
            adminName={adminName}
            preselect={ntpFor}
          />
          <PullsPanel pulls={pulls} />
        </div>

        <aside className="sc-col-side">
          <RemindersPanel subId={sub.id} paused={reminders.paused} outstanding={reminders.outstanding} />
          <TeamPanel
            team={team}
            documents={documents}
            ntps={ntps}
            canMakeNtp={!!agreement?.hlxSignedAt}
            onMakeNtp={(id) => setNtpFor((p) => ({ id, n: (p?.n ?? 0) + 1 }))}
          />
          <JobsPanel jobs={jobs} team={team} />

          {/* ---------------- terms ---------------- */}
          <section className="sc-card">
            <div className="sc-row-between">
              <h2>Terms</h2>
              {unsigned && !editing && <button className="sc-btn-ghost" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <TermsForm
                initial={{
                  companyName: sub.company_name,
                  contactName: sub.contact_name,
                  email: sub.email,
                  phone: sub.phone || '',
                  trade: sub.trade || '',
                  rateOption: sub.rate_option,
                  bespokeRates: sub.bespoke_rates?.length ? sub.bespoke_rates : [{ trade: '', rate: '', basis: '' }],
                }}
                submitLabel="Save terms"
                onCancel={() => setEditing(false)}
                onSubmit={async (v) => {
                  const r = await updateTerms(sub.id, v);
                  if (!r.ok) return r.error;
                  setEditing(false);
                  router.refresh();
                  return null;
                }}
              />
            ) : (
              <dl className="sc-dl">
                <dt>Rates</dt>
                <dd>
                  {sub.rate_option === 'default'
                    ? 'Clause 4.1.1 standard default rates'
                    : sub.bespoke_rates.map((r, i) => <div key={i}>{r.trade}: {r.rate} {r.basis}</div>)}
                </dd>
                <dt>Invited</dt>
                <dd>{fmt(sub.invited_at, true)}</dd>
                <dt>Last seen</dt>
                <dd>{fmt(sub.last_seen_at, true)}</dd>
              </dl>
            )}
            {!unsigned && <p className="sc-muted">Locked — the agreement is signed.</p>}
          </section>

          {/* ---------------- schedule B ---------------- */}
          <section className="sc-card">
            <h2>Details (Schedule B)</h2>
            {!sub.details_completed_at && <p className="sc-muted">Not complete yet.</p>}
            <dl className="sc-dl">
              <dt>Business</dt><dd>{d.legalName || '—'}{d.entityType && ` · ${ENTITY_LABEL[d.entityType]}`}</dd>
              <dt>Company no.</dt><dd>{d.companyNumber || '—'}</dd>
              <dt>VAT</dt><dd>{d.vatNumber || 'Not registered'}</dd>
              <dt>Registered address</dt><dd className="sc-pre">{d.registeredAddress || '—'}</dd>
              <dt>Works from</dt><dd className="sc-pre">{d.baseAddress || '—'}</dd>
              <dt>UTR</dt><dd>{d.utr || '—'}</dd>
              <dt>CIS</dt><dd>{d.cisStatus ? CIS_LABEL[d.cisStatus] : '—'}{d.cisNumber && ` · ${d.cisNumber}`}</dd>
              <dt>Notices</dt><dd>{d.noticesEmail || '—'}</dd>
              <dt>Accounts</dt><dd>{d.accountsEmail || '—'}</dd>
              <dt>Contact</dt><dd>{[d.primaryContact, d.phone].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Bank</dt><dd>{d.bankAccountName ? `${d.bankAccountName} · ${d.sortCode} · ${d.accountNumber}` : '—'}</dd>
              <dt>Employs staff</dt><dd>{d.employsStaff === undefined ? '—' : d.employsStaff ? 'Yes' : 'No'}</dd>
              <dt>Operatives</dt><dd className="sc-pre">{d.operatives || '—'}</dd>
            </dl>
          </section>

          <section className="sc-card">
            <h2>Notes</h2>
            <textarea className="sc-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal only" />
            <button className="sc-btn-ghost" disabled={busy || notes === (sub.notes || '')} onClick={() => run(() => saveNotes(sub.id, notes), 'Notes saved.')}>
              Save notes
            </button>
          </section>

          <section className="sc-card">
            <h2>Activity</h2>
            <ol className="sc-log">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="sc-log-t">{fmt(e.created_at, true)}</span>
                  <span>
                    {EVENT_LABEL[e.type] || e.type}
                    {e.type === 'status_changed' && e.detail?.status ? ` → ${STATUS_LABEL[e.detail.status as keyof typeof STATUS_LABEL]}` : ''}
                    {typeof e.detail?.file === 'string' && <em> {e.detail.file}</em>}
                    <span className="sc-log-a"> · {e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ComplianceSummary({ comp }: { comp: ReturnType<typeof compliance> }) {
  if (comp.ok && !comp.expiring.length && !comp.pendingReview)
    return <p className="sc-banner is-ok">All required documents are in date and reviewed.</p>;
  return (
    <ul className="sc-comp">
      {comp.missing.length > 0 && <li className="is-bad">Missing: {comp.missing.join(', ')}</li>}
      {comp.expired.map((x) => (
        <li key={x.id} className="is-bad">Expired {fmt(x.expires_on)}: {x.label || CATEGORY_BY_KEY[x.category]?.label}{x.operative_name && ` (${x.operative_name})`}</li>
      ))}
      {comp.expiring.map((x) => (
        <li key={x.id} className="is-warn">Expires {fmt(x.expires_on)}: {x.label || CATEGORY_BY_KEY[x.category]?.label}{x.operative_name && ` (${x.operative_name})`}</li>
      ))}
      {comp.pendingReview > 0 && <li className="is-info">{comp.pendingReview} document(s) awaiting your review</li>}
    </ul>
  );
}

/** The firm's own team, with each person's readiness for site. */
function TeamPanel({
  team,
  documents,
  ntps,
  canMakeNtp,
  onMakeNtp,
}: {
  team: OperativeRow[];
  documents: DocumentRow[];
  ntps: NtpRow[];
  canMakeNtp: boolean;
  onMakeNtp: (operativeId: string) => void;
}) {
  const active = team.filter((o) => !o.archived_at);
  // Which technologies each person is (or is being made) the NTP for.
  const ntpOf = (id: string) =>
    ntps
      .filter((n) => n.operative_id === id && ['active', 'awaiting_signature', 'awaiting_countersign'].includes(n.status))
      .map((n) => ({
        techs: n.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label.split(' (')[0] ?? k).join(', '),
        live: n.status === 'active',
        suffix: n.status === 'awaiting_signature' ? ' (to sign)' : n.status === 'awaiting_countersign' ? ' (to countersign)' : '',
      }));
  return (
    <section className="sc-card">
      <h2>Team ({active.length})</h2>
      {active.length === 0 && <p className="sc-muted">They haven&apos;t added anyone yet.</p>}
      <ul className="sc-list">
        {active.map((o) => {
          const c = operativeCompliance(o.id, documents);
          return (
            <li key={o.id}>
              <span>
                <strong>{o.full_name}</strong>
                {o.role && <span className="sc-sub">{o.role}</span>}
                {ntpOf(o.id).map((x, i) => (
                  <span key={i} className={`sc-pill ${x.live ? 'is-ok' : 'is-warn'}`} style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                    NTP: {x.techs}
                    {x.suffix}
                  </span>
                ))}
                {canMakeNtp && (
                  <button type="button" className="sc-inline-link" onClick={() => onMakeNtp(o.id)}>
                    Make NTP…
                  </button>
                )}
              </span>
              <span
                className={`sc-pill ${c.ready ? (c.expiring ? 'is-warn' : 'is-ok') : 'is-bad'}`}
                title={c.missing.join(', ')}
              >
                {c.ready
                  ? c.expiring
                    ? `${c.expiring} expiring`
                    : 'Ready'
                  : c.missing.length
                    ? `Needs ${c.missing.length}`
                    : `${c.expired} expired`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Jobs RAMS has booked them onto, and who they chose. */
function JobsPanel({ jobs, team }: { jobs: AssignmentRow[]; team: OperativeRow[] }) {
  const names = new Map(team.map((o) => [o.id, o.full_name]));
  return (
    <section className="sc-card">
      <h2>Jobs ({jobs.filter((j) => j.status !== 'cancelled').length})</h2>
      {jobs.length === 0 && <p className="sc-muted">Not booked on any RAMS yet.</p>}
      <ul className="sc-list">
        {jobs.map((j) => (
          <li key={j.id} className={j.status === 'cancelled' ? 'is-muted' : undefined}>
            <span>
              <strong>{j.rams_project_name}</strong>
              <span className="sc-sub">
                {[j.rams_project_ref, j.rams_document_title, j.start_date && `starts ${fmt(j.start_date)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {j.status === 'crew_confirmed' && (
                <span className="sc-sub">Crew: {j.crew.map((c) => names.get(c) || '?').join(', ')}</span>
              )}
              {j.decline_reason && <span className="sc-sub is-bad">Declined: {j.decline_reason}</span>}
              {j.webhook_status && !j.webhook_status.startsWith('delivered') && (
                <span className="sc-sub is-bad">RAMS: {j.webhook_status}</span>
              )}
            </span>
            <span className="sc-pill">{ASSIGNMENT_LABEL[j.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Append-only fingerprint record of every document RAMS has pulled. */
function PullsPanel({ pulls }: { pulls: PullRow[] }) {
  return (
    <section className="sc-card">
      <h2>Pulled by RAMS</h2>
      <p className="sc-muted">
        Every document handed to RAMS, with the SHA-256 fingerprint of the exact file, the project and RAMS document it
        was pulled for, and who pulled it.
      </p>
      {pulls.length === 0 ? (
        <p className="sc-muted">Nothing pulled yet.</p>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Document</th>
                <th>Project / RAMS</th>
                <th>Fingerprint</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {pulls.map((p) => (
                <tr key={p.id}>
                  <td>{fmt(p.pulled_at, true)}</td>
                  <td>{p.title || p.file_name}</td>
                  <td>
                    {p.rams_project_name}
                    <span className="sc-sub">{[p.rams_project_ref, p.rams_document_title].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td>
                    <code className="sc-hash" title={p.sha256}>
                      {p.sha256.slice(0, 12)}
                    </code>
                  </td>
                  <td>{p.pulled_by_name || p.pulled_by_email || 'automatic'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DocRow({ doc, onChanged }: { doc: DocumentRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const ex = expiryState(doc.expires_on);

  async function review(status: 'approved' | 'rejected' | 'pending') {
    let note = '';
    if (status === 'rejected') {
      note = prompt('Reason for rejecting (shown to the subcontractor):') || '';
      if (!note) return;
    }
    setBusy(true);
    const r = await reviewDocument(doc.id, status, note);
    setBusy(false);
    if (!r.ok) alert(r.error);
    onChanged();
  }

  return (
    <div className={`sc-doc s-${doc.status}`}>
      <div className="sc-doc-main">
        <a href={`/api/admin/subcontractor-docs/${doc.id}`} target="_blank" rel="noreferrer">{doc.label || doc.file_name}</a>
        <span className="sc-sub">
          {[doc.operative_name, doc.cover_amount, doc.reference, `uploaded ${fmt(doc.uploaded_at)}`].filter(Boolean).join(' · ')}
        </span>
        {doc.review_note && <span className="sc-sub is-bad">Rejected: {doc.review_note}</span>}
      </div>
      <div className="sc-doc-side">
        {doc.expires_on && (
          <span className={`sc-pill ${ex === 'expired' ? 'is-bad' : ex === 'expiring' ? 'is-warn' : ''}`}>
            {ex === 'expired' ? 'Expired' : 'Expires'} {fmt(doc.expires_on)}
          </span>
        )}
        <span className={`sc-pill is-${doc.status === 'approved' ? 'ok' : doc.status === 'rejected' ? 'bad' : 'info'}`}>
          {doc.status === 'pending' ? 'To review' : doc.status}
        </span>
        <div className="sc-doc-btns">
          {doc.status !== 'approved' && <button disabled={busy} onClick={() => review('approved')}>Approve</button>}
          {doc.status !== 'rejected' && <button disabled={busy} onClick={() => review('rejected')}>Reject</button>}
          {doc.status !== 'pending' && <button disabled={busy} onClick={() => review('pending')}>Reset</button>}
          <a href={`/api/admin/subcontractor-docs/${doc.id}?download=1`}>Download</a>
          <button
            disabled={busy}
            className="is-danger"
            onClick={async () => {
              if (!confirm(`Permanently delete ${doc.file_name}?`)) return;
              setBusy(true);
              await deleteDocument(doc.id);
              setBusy(false);
              onChanged();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Countersign({
  subId,
  defaultName,
  comp,
  intact,
  onDone,
}: {
  subId: string;
  defaultName: string;
  comp: ReturnType<typeof compliance>;
  intact: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState('Director');
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!intact)
    return <p className="sc-banner is-err">The signed record has been altered since they signed. Don&apos;t countersign — ask them to re-sign.</p>;

  return (
    <div className="sc-countersign">
      <h3>Countersign for Heliaxis Limited</h3>
      {!comp.ok && (
        <p className="sc-banner is-warn">
          Heads up: {[comp.missing.length && `missing ${comp.missing.join(', ')}`, comp.expired.length && `${comp.expired.length} expired`]
            .filter(Boolean)
            .join('; ')}
          . Clause 3A.1 requires these before they start work.
        </p>
      )}
      <div className="sc-grid">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      <SignaturePad onChange={setSig} height={140} />
      {err && <p className="sc-error">{err}</p>}
      <button
        className="sc-btn"
        disabled={busy || !sig || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setErr('');
          const r = await countersign(subId, { name, title, signature: sig! });
          setBusy(false);
          if (r.ok) onDone();
          else setErr(r.error);
        }}
      >
        {busy ? 'Countersigning…' : 'Countersign agreement'}
      </button>
    </div>
  );
}

/** NTP (Nominated Technical Person) appointments — per technology, renewed yearly. */
function NtpPanel({
  subId,
  ntps,
  team,
  frameworkLive,
  adminName,
  preselect,
}: {
  subId: string;
  ntps: NtpRow[];
  team: OperativeRow[];
  frameworkLive: boolean;
  adminName: string;
  preselect: { id: string; n: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [techs, setTechs] = useState<string[]>([]);
  const [operativeId, setOperativeId] = useState('');
  const [ntpName, setNtpName] = useState('');
  const [ntpEmail, setNtpEmail] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const [days, setDays] = useState('');
  const [geography, setGeography] = useState('');
  const [installs, setInstalls] = useState('');
  const [duration, setDuration] = useState('');
  const [installers, setInstallers] = useState('');
  const [notes, setNotes] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [signing, setSigning] = useState<string | null>(null);
  const active = team.filter((o) => !o.archived_at);

  const choose = (id: string) => {
    setOperativeId(id);
    setNtpEmail(active.find((o) => o.id === id)?.email || '');
  };

  // Opened from "Make NTP…" on a team member.
  useEffect(() => {
    if (!preselect) return;
    setOpen(true);
    choose(preselect.id);
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await sendNtp(subId, {
      technologies: techs,
      operativeId,
      ntpName,
      ntpEmail,
      minDaysPerMonth: days,
      supervision: { geography, installsPerMonth: installs, typicalDuration: duration, installersToSupervise: installers, notes },
      fee,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="sc-card" ref={panelRef}>
      <div className="sc-row-between">
        <h2>NTP agreements</h2>
        {!open && (
          <button className="sc-btn-ghost" disabled={!frameworkLive} onClick={() => setOpen(true)} title={frameworkLive ? '' : 'Countersign the Framework Agreement first'}>
            + Send NTP agreement
          </button>
        )}
      </div>
      {!frameworkLive && <p className="sc-muted">Available once their Framework Agreement is countersigned.</p>}

      {ntps.length > 0 && (
        <ul className="sc-list">
          {ntps.map((n) => (
            <li key={n.id} className={['cancelled', 'superseded'].includes(n.status) ? 'is-muted' : undefined}>
              <span>
                <strong>
                  {n.ntp_name} — {n.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label || k).join(', ')}
                </strong>
                <span className="sc-sub">
                  {n.ref}
                  {n.valid_from && ` · ${fmt(n.valid_from)} to ${fmt(n.expires_on)}`}
                  {n.renewal_of && ' · renewal'}
                  {n.status === 'awaiting_signature' && (n.ntp_email ? ` · link sent to ${n.ntp_email}` : ' · to sign in their portal')}
                </span>
                <span className="sc-row" style={{ marginTop: '0.3rem' }}>
                  <a className="sc-link-btn" href={`/admin/subcontractors/${subId}/ntp/${n.id}`} target="_blank" rel="noreferrer">
                    View / print ↗
                  </a>
                  {n.status === 'awaiting_signature' && n.ntp_email && (
                    <button
                      className="sc-btn-ghost"
                      title={`Sent to ${n.ntp_email}`}
                      onClick={async () => {
                        const r = await resendNtpLink(n.id);
                        alert(r.ok ? `New signing link sent to ${n.ntp_email}.` : r.error);
                        router.refresh();
                      }}
                    >
                      Resend link
                    </button>
                  )}
                  {n.status === 'awaiting_countersign' && signing !== n.id && (
                    <button className="sc-btn-ghost" onClick={() => setSigning(n.id)}>Countersign</button>
                  )}
                  {['awaiting_signature', 'awaiting_countersign', 'active'].includes(n.status) && (
                    <button
                      className="sc-btn-ghost is-danger"
                      onClick={async () => {
                        if (!confirm(`Cancel ${n.ref}? ${n.status === 'active' ? 'They will stop being your NTP immediately — tell your Certification Body.' : ''}`)) return;
                        const r = await cancelNtp(n.id);
                        if (!r.ok) alert(r.error);
                        router.refresh();
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </span>
                {signing === n.id && (
                  <NtpCountersign
                    ntpId={n.id}
                    defaultName={adminName}
                    onDone={() => {
                      setSigning(null);
                      router.refresh();
                    }}
                  />
                )}
              </span>
              <span className={`sc-pill ${n.status === 'active' ? 'is-ok' : n.status === 'expired' ? 'is-bad' : n.status.startsWith('awaiting') ? 'is-warn' : ''}`}>
                {NTP_STATUS_LABEL[n.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form className="sc-form" onSubmit={send} style={{ marginTop: '0.8rem' }}>
          <fieldset className="sc-rates">
            <legend>Technologies</legend>
            {Object.entries(NTP_TECHNOLOGIES).map(([k, t]) => (
              <label key={k} className="sc-check">
                <input
                  type="checkbox"
                  checked={techs.includes(k)}
                  onChange={(e) => setTechs((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))}
                />
                {t.label} <span className="sc-sub">({t.standard})</span>
              </label>
            ))}
          </fieldset>
          <div className="sc-grid">
            <label>
              NTP (from their team)
              <select value={operativeId} onChange={(e) => choose(e.target.value)}>
                <option value="">Someone else — type below</option>
                {active.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name}</option>
                ))}
              </select>
            </label>
            {!operativeId && (
              <label>
                NTP full name
                <input value={ntpName} onChange={(e) => setNtpName(e.target.value)} />
              </label>
            )}
            <label>
              NTP&apos;s email
              <input type="email" value={ntpEmail} onChange={(e) => setNtpEmail(e.target.value)} placeholder="They sign from a personal link" />
            </label>
            <label>
              Minimum days per month
              <input type="number" min="0" max="31" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label>
              Fee (optional)
              <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Framework rates if blank" />
            </label>
          </div>
          <div className="sc-grid">
            <label>Geographical spread<input value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="e.g. South Wales & Bristol" /></label>
            <label>Installations per month<input value={installs} onChange={(e) => setInstalls(e.target.value)} placeholder="e.g. 8–12" /></label>
            <label>Typical duration<input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 1–2 days domestic" /></label>
            <label>Installers to supervise<input value={installers} onChange={(e) => setInstallers(e.target.value)} placeholder="e.g. 2 teams of 2" /></label>
          </div>
          <label className="sc-field-wide">
            Other supervision requirements
            <textarea className="sc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err && <p className="sc-error">{err}</p>}
          <div className="sc-row">
            <button className="sc-btn" disabled={busy || !techs.length || (!operativeId && ntpName.trim().length < 2)}>
              {busy ? 'Sending…' : 'Send for signature'}
            </button>
            <button type="button" className="sc-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

function NtpCountersign({ ntpId, defaultName, onDone }: { ntpId: string; defaultName: string; onDone: () => void }) {
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState('Director');
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="sc-countersign">
      <div className="sc-grid">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      <SignaturePad onChange={setSig} height={130} />
      {err && <p className="sc-error">{err}</p>}
      <button
        className="sc-btn"
        disabled={busy || !sig || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          const r = await countersignNtp(ntpId, { name, title, signature: sig! });
          setBusy(false);
          if (r.ok) onDone();
          else setErr(r.error);
        }}
      >
        {busy ? 'Countersigning…' : 'Countersign NTP agreement'}
      </button>
    </div>
  );
}

/** Daily digest reminders for this firm: on/off, what they'd be told, and "send now". */
function RemindersPanel({
  subId,
  paused,
  outstanding,
}: {
  subId: string;
  paused: boolean;
  outstanding: { kind: string; text: string; urgent: boolean }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: (r as { error: string }).error });
    router.refresh();
  }

  return (
    <section className="sc-card">
      <div className="sc-row-between">
        <h2>Reminders</h2>
        <span className={`sc-pill ${paused ? 'is-warn' : 'is-ok'}`}>{paused ? 'Paused' : 'On'}</span>
      </div>
      <p className="sc-muted">
        Automatic daily email listing everything outstanding — onboarding, missing, rejected or expiring documents,
        crews to choose, NTP agreements to sign. Each chase goes once (e.g. day 3, 7, 14).
      </p>
      {outstanding.length === 0 ? (
        <p className="sc-muted">Nothing outstanding right now.</p>
      ) : (
        <ul className="sc-comp">
          {outstanding.map((o, i) => (
            <li key={i} className={o.urgent ? 'is-bad' : 'is-warn'}>{o.text}</li>
          ))}
        </ul>
      )}
      <div className="sc-row">
        <button
          className="sc-btn-ghost"
          disabled={busy || outstanding.length === 0}
          onClick={() => act(() => remindNow(subId), 'Reminder emailed.')}
        >
          Send reminder now
        </button>
        <button
          className="sc-btn-ghost"
          disabled={busy}
          onClick={() => act(() => setRemindersPaused(subId, !paused), paused ? 'Reminders resumed.' : 'Reminders paused.')}
        >
          {paused ? 'Resume automatic reminders' : 'Pause automatic reminders'}
        </button>
      </div>
      {msg && <p className={msg.ok ? 'sc-muted' : 'sc-error'}>{msg.text}</p>}
    </section>
  );
}
