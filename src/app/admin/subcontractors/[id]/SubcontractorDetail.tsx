'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import {
  CATEGORY_BY_KEY,
  compliance,
  DOC_CATEGORIES,
  expiryState,
  londonToday,
  operativeCompliance,
  requestCovers,
  requestTitle,
  sameDocKind,
} from '@/lib/subcontractors/documents';
import {
  CIS_LABEL,
  CIS_RATE_LABEL,
  DECLARED_CIS_RATE,
  type CisRate,
  ENTITY_LABEL,
  ASSIGNMENT_LABEL,
  STATUS_LABEL,
  type AssignmentRow,
  type DocRequestRow,
  type DocumentRow,
  type EventRow,
  type OperativeRow,
  type PullRow,
  type NtpRow,
  NTP_STATUS_LABEL,
  type SubcontractorRow,
} from '@/lib/subcontractors/types';
import {
  cancelDocumentRequest,
  requestDocument,
  resendDocumentRequest,
  updateDocumentDetails,
  cancelNtp,
  remindNow,
  resendNtpLink,
  setRemindersPaused,
  setCisVerification,
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

const CHANGE_LABEL: Record<string, string> = {
  label: 'name',
  category: 'category',
  operative_name: 'team member',
  expires_on: 'expiry',
  cover_amount: 'cover',
};

const EVENT_LABEL: Record<string, string> = {
  signed_in: 'Signed in',
  document_updated: 'Document renamed / moved',
  cis_verified: 'CIS verified with HMRC',
  cis_verification_removed: 'CIS verification removed',
  document_requested: 'Document requested',
  document_request_resent: 'Document request emailed again',
  document_request_cancelled: 'Document request cancelled',
  document_request_fulfilled: 'Requested document uploaded',
  document_request_reopened: 'Document request reopened (upload withdrawn)',
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
  requests,
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
  /** Document requests (newest first), every status. */
  requests: DocRequestRow[];
  reminders: { paused: boolean; outstanding: { kind: string; text: string; urgent: boolean }[] };
}) {
  const router = useRouter();
  // Local copy of the documents: approving / editing updates the row, compliance summary
  // and team readiness immediately; the server copy replaces it whenever the page refreshes.
  const [docs, setDocs] = useState(documents);
  const [docsFrom, setDocsFrom] = useState(documents);
  // Review decisions not yet confirmed by the server. A refresh that was already in flight
  // when you clicked mustn't put the old status back, so these are laid over server data
  // until the server copy agrees.
  const [pending, setPending] = useState<Record<string, Partial<DocumentRow>>>({});
  if (docsFrom !== documents) {
    setDocsFrom(documents);
    const still: Record<string, Partial<DocumentRow>> = {};
    setDocs(
      documents.map((x) => {
        const p = pending[x.id];
        if (!p || x.status === p.status) return x; // server has caught up (or nothing pending)
        still[x.id] = p;
        return { ...x, ...p };
      })
    );
    setPending(still);
  }
  // Document requests, kept locally the same way (server copy wins on refresh).
  const [reqs, setReqs] = useState(requests);
  const [reqsFrom, setReqsFrom] = useState(requests);
  if (reqsFrom !== requests) {
    setReqsFrom(requests);
    setReqs(requests);
  }
  const openReqs = reqs.filter((q) => q.status === 'open');
  const upsertReq = (next: DocRequestRow) => setReqs((all) => [next, ...all.filter((x) => x.id !== next.id)]);
  const [requesting, setRequesting] = useState(false);
  // Focus to restore once a form closes: the "Request a document" button, or a row moved to another category.
  const focusReqBtn = useRef(false);
  const focusRemindersBtn = useRef(false);
  const focusDocRef = useRef<string | null>(null);
  // After a burst of changes, quietly re-sync the server-worked-out bits (reminders preview, activity).
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncSoon = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => router.refresh(), 2500);
  };
  // "Make NTP" on a team member opens the NTP form with them chosen.
  const [ntpFor, setNtpFor] = useState<{ id: string; n: number } | null>(null);
  const d = sub.details || {};
  const comp = compliance(d, docs);
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

      {flash && (
        <div className={`sc-banner is-${flash.kind}`} role="status">
          {flash.text}
        </div>
      )}
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
        {sub.status !== 'terminated' && (
          <button
            className="sc-btn-ghost"
            disabled={busy}
            ref={(el) => {
              if (el && focusRemindersBtn.current) {
                focusRemindersBtn.current = false;
                el.focus();
              }
            }}
            onClick={() =>
              run(
                () => setRemindersPaused(sub.id, !reminders.paused),
                reminders.paused ? 'Automatic reminders resumed.' : 'Automatic reminders paused.'
              )
            }
          >
            {reminders.paused ? 'Resume reminders' : 'Pause reminders'}
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
            <div className="sc-row-between">
              <h2>Documents</h2>
              {sub.status !== 'terminated' && !requesting && (
                <button
                  className="sc-btn-ghost"
                  onClick={() => setRequesting(true)}
                  ref={(el) => {
                    if (el && focusReqBtn.current) {
                      focusReqBtn.current = false;
                      el.focus();
                    }
                  }}
                >
                  Request a document
                </button>
              )}
            </div>
            {requesting && (
              <RequestForm
                subId={sub.id}
                team={team}
                onDone={(req, warning) => {
                  upsertReq(req);
                  focusReqBtn.current = true;
                  setRequesting(false);
                  if (warning) alert(warning);
                  resyncSoon();
                }}
                onCancel={() => {
                  focusReqBtn.current = true;
                  setRequesting(false);
                }}
              />
            )}
            <ComplianceSummary comp={comp} />
            {openReqs.length > 0 && (
              <div className="sc-doc-group">
                <h3>Requested from them</h3>
                {openReqs.map((q) => (
                  <RequestRow
                    key={q.id}
                    req={q}
                    onChange={(next) => {
                      upsertReq(next);
                      resyncSoon();
                    }}
                  />
                ))}
              </div>
            )}
            {DOC_CATEGORIES.map((cat) => {
              const list = docs.filter((x) => x.category === cat.key);
              if (!list.length && !cat.required(d)) return null;
              return (
                <div key={cat.key} className="sc-doc-group">
                  <h3>
                    {cat.label}
                    {cat.required(d) && <span className="sc-pill">Required</span>}
                  </h3>
                  {list.length === 0 && <p className="sc-missing">Nothing uploaded</p>}
                  {list.map((doc) => (
                    <DocRow
                      key={doc.id}
                      subId={sub.id}
                      doc={doc}
                      team={team}
                      replacementAsked={
                        openReqs.some((q) => requestCovers(q, doc)) ||
                        reqs.some(
                          (q) =>
                            q.status === 'fulfilled' &&
                            q.replaces_document_id === doc.id &&
                            docs.some((x) => x.id === q.fulfilled_document_id && x.status !== 'rejected')
                        )
                      }
                      superseded={docs.some(
                        (x) => x.id !== doc.id && x.status !== 'rejected' && x.uploaded_at > doc.uploaded_at && sameDocKind(doc, x)
                      )}
                      focusDocRef={focusDocRef}
                      onRequested={(req, warning) => {
                        upsertReq(req);
                        if (warning) alert(warning);
                        resyncSoon();
                      }}
                      onRequestsClosed={(ids) => {
                        setReqs((all) => all.filter((x) => !ids.includes(x.id)));
                        resyncSoon();
                      }}
                      onChange={(id, patch, review) => {
                        if (review === 'start') setPending((p) => ({ ...p, [id]: patch }));
                        if (review === 'failed')
                          setPending((p) => {
                            const next = { ...p };
                            delete next[id];
                            return next;
                          });
                        setDocs((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
                        resyncSoon();
                      }}
                      onRemoved={(id) => {
                        setDocs((all) => all.filter((x) => x.id !== id));
                        resyncSoon();
                      }}
                    />
                  ))}
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
          {sub.status !== 'terminated' && (reminders.paused || reminders.outstanding.length > 0) && (
            <RemindersPanel
              subId={sub.id}
              paused={reminders.paused}
              outstanding={reminders.outstanding}
              onFlash={(f, toggled) => {
                if (toggled) focusRemindersBtn.current = true;
                setFlash(f);
              }}
            />
          )}
          <CisPanel sub={sub} />
          <TeamPanel
            team={team}
            documents={docs}
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
                    {e.type === 'cis_verified' && typeof e.detail?.rate === 'string' && ` — ${CIS_RATE_LABEL[e.detail.rate as CisRate] ?? e.detail.rate}`}
                    {typeof e.detail?.request === 'string' && <em> {e.detail.request}</em>}
                    {typeof e.detail?.file === 'string' && <em> {e.detail.file}</em>}
                    {e.type === 'document_updated' && !!e.detail?.changes && typeof e.detail.changes === 'object' && (
                      <span className="sc-sub">
                        {Object.entries(e.detail.changes as Record<string, [unknown, unknown]>)
                          .map(([k, [from, to]]) => `${CHANGE_LABEL[k] ?? k}: ${from ?? '—'} → ${to ?? '—'}`)
                          .join(' · ')}
                      </span>
                    )}
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

function DocRow({
  subId,
  doc,
  team,
  replacementAsked,
  superseded,
  focusDocRef,
  onRequested,
  onRequestsClosed,
  onChange,
  onRemoved,
}: {
  subId: string;
  doc: DocumentRow;
  team: OperativeRow[];
  /** They've already been asked for this document (an open request, or a replacement that's been sent in). */
  replacementAsked: boolean;
  /** A newer copy of the same document has been uploaded (and isn't rejected). */
  superseded: boolean;
  /** Set to this row's id before it moves category, so the re-mounted row takes focus. */
  focusDocRef: React.MutableRefObject<string | null>;
  onRequested: (req: DocRequestRow, warning?: string) => void;
  /** Open requests this decision closed (cancelled, or answered by this document). */
  onRequestsClosed: (ids: string[]) => void;
  /** Merge a change into the row. `review`: 'start' = optimistic decision, 'failed' = put it back. */
  onChange: (id: string, patch: Partial<DocumentRow>, review?: 'start' | 'failed') => void;
  onRemoved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [asking, setAsking] = useState(false);
  const ex = expiryState(doc.expires_on);
  // The person it belongs to has left the team: a replacement can't be asked of them.
  const personLeft = !!doc.operative_id && !team.some((o) => o.id === doc.operative_id && !o.archived_at);
  // When an inline form closes, put keyboard focus back on the row (its ▾, or its link while busy).
  const rowRef = useRef<HTMLDivElement>(null);
  // (A timer, not requestAnimationFrame — that never fires while the tab is in the background.)
  const refocus = () =>
    setTimeout(() => {
      const btn = rowRef.current?.querySelector<HTMLButtonElement>('.sc-menu-btn');
      (btn && !btn.disabled ? btn : rowRef.current?.querySelector<HTMLAnchorElement>('.sc-doc-main a'))?.focus();
    }, 0);

  // Optimistic: the row (and everything worked out from it) changes the moment you click;
  // the save runs in the background and the row is put back if it fails.
  async function review(status: 'approved' | 'rejected' | 'pending', note = '', askForReplacement = false) {
    setRejecting(false);
    setAsking(false);
    const before = { status: doc.status, review_note: doc.review_note, reviewed_at: doc.reviewed_at };
    onChange(
      doc.id,
      { status, review_note: status === 'rejected' ? note : null, reviewed_at: status === 'pending' ? null : new Date().toISOString() },
      'start'
    );
    setBusy(true);
    const r = await safe(() => reviewDocument(doc.id, status, note, { requestReplacement: askForReplacement }));
    setBusy(false);
    if (!r.ok) {
      onChange(doc.id, before, 'failed');
      alert(`Couldn't save: ${r.error}`);
      return;
    }
    const done = r as { request?: DocRequestRow; closedRequests?: string[]; warning?: string };
    if (done.request) onRequested(done.request, done.warning);
    else if (done.warning) alert(done.warning);
    if (done.closedRequests?.length) onRequestsClosed(done.closedRequests);
  }

  async function remove() {
    if (!confirm(`Permanently delete ${doc.file_name}? This can't be undone.`)) return;
    setBusy(true);
    const r = await safe(() => deleteDocument(doc.id));
    setBusy(false);
    if (r.ok) onRemoved(doc.id);
    else alert(`Couldn't delete: ${r.error}`);
  }

  const items: MenuItem[] = [
    ...(doc.status !== 'approved' && doc.status !== 'pending' ? [{ label: 'Approve', onSelect: () => review('approved') }] : []),
    ...(doc.status !== 'rejected' && doc.status !== 'pending' ? [{ label: 'Reject…', onSelect: () => setRejecting(true) }] : []),
    ...(doc.status === 'rejected' && !replacementAsked && !personLeft && !superseded
      ? [{ label: 'Ask for a replacement…', onSelect: () => setAsking(true) }]
      : []),
    ...(doc.status !== 'pending' ? [{ label: 'Reset to “to review”', onSelect: () => review('pending') }] : []),
    { label: 'Rename / move…', onSelect: () => setEditing(true) },
    { label: 'Download', href: `/api/admin/subcontractor-docs/${doc.id}?download=1` },
    { label: 'Delete…', onSelect: remove, danger: true },
  ];

  return (
    <div
      className={`sc-doc s-${doc.status}`}
      ref={(el) => {
        rowRef.current = el;
        if (el && focusDocRef.current === doc.id) {
          focusDocRef.current = null;
          el.querySelector<HTMLButtonElement>('.sc-menu-btn')?.focus();
        }
      }}
    >
      <div className="sc-doc-main">
        <a href={`/api/admin/subcontractor-docs/${doc.id}`} target="_blank" rel="noreferrer">{doc.label || doc.file_name}</a>
        <span className="sc-sub">
          {[doc.operative_name, doc.cover_amount, doc.reference, `uploaded ${fmt(doc.uploaded_at)}`].filter(Boolean).join(' · ')}
        </span>
        {doc.status === 'rejected' && doc.review_note && <span className="sc-sub is-bad">Rejected: {doc.review_note}</span>}
        {doc.status === 'rejected' && replacementAsked && <span className="sc-sub">Replacement asked for</span>}
      </div>
      <div className="sc-doc-side">
        {doc.expires_on && (
          <span className={`sc-pill ${ex === 'expired' ? 'is-bad' : ex === 'expiring' ? 'is-warn' : ''}`}>
            {ex === 'expired' ? 'Expired' : 'Expires'} {fmt(doc.expires_on)}
          </span>
        )}
        <span className={`sc-pill is-${doc.status === 'approved' ? 'ok' : doc.status === 'rejected' ? 'bad' : 'info'}`}>
          {doc.status === 'pending' ? 'To review' : doc.status}
          {busy ? '…' : ''}
        </span>
        <div className="sc-doc-btns">
          {/* Only a document waiting for review shows its decisions up front; once decided,
              everything else lives behind the ▾ so it can't be pressed by accident. */}
          {doc.status === 'pending' && (
            <>
              <button className="is-primary" disabled={busy} onClick={() => review('approved')}>Approve</button>
              <button disabled={busy || rejecting} onClick={() => setRejecting(true)}>Reject</button>
            </>
          )}
          <DocMenu items={items} disabled={busy} label={`More actions for ${doc.label || doc.file_name}`} />
        </div>
      </div>
      {rejecting && (
        <RejectForm
          doc={doc}
          personLeft={personLeft}
          superseded={superseded}
          alreadyAsked={replacementAsked}
          onSubmit={(note, ask) => {
            review('rejected', note, ask);
            refocus();
          }}
          onCancel={() => {
            setRejecting(false);
            refocus();
          }}
        />
      )}
      {asking && doc.status === 'rejected' && (
        <RequestForm
          subId={subId}
          team={team}
          preset={{
            category: doc.category,
            operativeId: doc.operative_id ?? null,
            label: doc.label,
            note: doc.review_note,
            replacesDocumentId: doc.id,
          }}
          onDone={(req, warning, closed) => {
            setAsking(false);
            onRequested(req, warning);
            if (closed?.length) onRequestsClosed(closed);
            refocus();
          }}
          onCancel={() => {
            setAsking(false);
            refocus();
          }}
        />
      )}
      {editing && (
        <DocEditor
          doc={doc}
          team={team}
          onCancel={() => {
            setEditing(false);
            refocus();
          }}
          onSaved={(next) => {
            // Moving category re-mounts the row under its new heading; it takes focus itself then.
            const moved = next.category !== doc.category;
            if (moved) focusDocRef.current = doc.id;
            onChange(doc.id, {
              label: next.label,
              category: next.category,
              operative_id: next.operative_id,
              operative_name: next.operative_name,
              expires_on: next.expires_on,
              cover_amount: next.cover_amount,
            });
            setEditing(false);
            if (!moved) refocus();
          }}
        />
      )}
    </div>
  );
}

/** Run a server action; a thrown error (signed out, network drop) becomes { ok: false, error }. */
async function safe<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: 'Network or session problem — please reload the page and try again.' };
  }
}

type MenuItem = { label: string; onSelect?: () => void; href?: string; danger?: boolean };

/** Small ▾ menu: opens on click, closes on outside click / Escape / choosing an item. */
function DocMenu({ items, disabled, label }: { items: MenuItem[]; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className="sc-menu"
      ref={ref}
      // Tabbing away closes it (a null relatedTarget is a mouse click, which the mousedown handler covers).
      onBlur={(e) => {
        if (e.relatedTarget && !ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={btnRef}
        type="button"
        className="sc-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && (
        <div className="sc-menu-list" role="menu">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} onClick={() => close(true)}>
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? 'is-danger' : undefined}
                onClick={() => {
                  // "…" items open a form (which takes focus itself) or a confirm; Delete removes the row.
                  close(!it.danger && !it.label.endsWith('…'));
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Rename a document, move it to another category, set whose it is, fix its expiry. */
function DocEditor({
  doc,
  team,
  onCancel,
  onSaved,
}: {
  doc: DocumentRow;
  team: OperativeRow[];
  onCancel: () => void;
  onSaved: (next: DocumentRow) => void;
}) {
  const [label, setLabel] = useState(doc.label || '');
  const [category, setCategory] = useState(doc.category);
  const [operativeId, setOperativeId] = useState(doc.operative_id || '');
  const [expiresOn, setExpiresOn] = useState(doc.expires_on || '');
  const [cover, setCover] = useState(doc.cover_amount || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cat = CATEGORY_BY_KEY[category];
  const people = team.filter((o) => !o.archived_at || o.id === doc.operative_id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await safe(() =>
      updateDocumentDetails(doc.id, {
        label,
        category,
        operativeId: cat?.operative ? operativeId || null : null,
        expiresOn: expiresOn || null,
        coverAmount: cover || null,
      })
    );
    setBusy(false);
    if (r.ok) onSaved((r as { doc: DocumentRow }).doc);
    else setErr(r.error || 'Could not save');
  }

  return (
    <form className="sc-doc-edit" onSubmit={save}>
      <div className="sc-grid">
        <label>
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={doc.file_name} autoFocus />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        {cat?.operative && (
          <label>
            Team member
            <select value={operativeId} onChange={(e) => setOperativeId(e.target.value)} required>
              <option value="">Choose…</option>
              {people.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}{o.archived_at ? ' (left)' : ''}</option>
              ))}
            </select>
          </label>
        )}
        {cat && cat.expiry !== 'none' && (
          <label>
            Expiry date{cat.expiry === 'optional' ? ' (if any)' : ''}
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required={cat.expiry === 'required'} />
          </label>
        )}
        {cat?.cover && (
          <label>
            Cover amount
            <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="e.g. £2,000,000" />
          </label>
        )}
      </div>
      {err && <p className="sc-error">{err}</p>}
      <div className="sc-row">
        <button className="sc-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="sc-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Ask the firm for a document — anything, or a replacement for one that was rejected. */
function RequestForm({
  subId,
  team,
  preset,
  onDone,
  onCancel,
}: {
  subId: string;
  team: OperativeRow[];
  /** Asking for a replacement: what was rejected, and why. */
  preset?: { category: string; operativeId: string | null; label: string | null; note: string | null; replacesDocumentId: string };
  onDone: (request: DocRequestRow, warning?: string, closed?: string[]) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(preset?.category || DOC_CATEGORIES[0].key);
  const people = team.filter((o) => !o.archived_at);
  const [operativeId, setOperativeId] = useState(
    preset?.operativeId && people.some((o) => o.id === preset.operativeId) ? preset.operativeId : ''
  );
  const [label, setLabel] = useState(preset?.label || '');
  const [note, setNote] = useState(preset?.note || '');
  const [dueOn, setDueOn] = useState('');
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cat = CATEGORY_BY_KEY[category];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await safe(() =>
      requestDocument(subId, {
        category,
        operativeId: cat?.operative ? operativeId || null : null,
        label,
        note,
        dueOn: dueOn || null,
        email,
        replacesDocumentId: preset?.replacesDocumentId ?? null,
      })
    );
    setBusy(false);
    if (r.ok) {
      const done = r as { request: DocRequestRow; warning?: string; closedRequests?: string[] };
      onDone(done.request, done.warning, done.closedRequests);
    }
    else setErr(r.error || 'Could not save');
  }

  return (
    <form className="sc-doc-edit sc-request-form" onSubmit={save}>
      <div className="sc-grid">
        <label>
          Document
          <select value={category} onChange={(e) => setCategory(e.target.value)} autoFocus={!preset}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        {cat?.operative && (
          <label>
            For
            <select value={operativeId} onChange={(e) => setOperativeId(e.target.value)}>
              <option value="">Anyone on their team</option>
              {people.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          What exactly (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={category === 'card' ? 'e.g. IPAF card' : category === 'qualification' ? 'e.g. 18th Edition' : 'e.g. current certificate'}
          />
        </label>
        <label>
          Needed by (optional)
          <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
      </div>
      <label className="sc-field-wide">
        {preset ? 'Reason (they see this)' : 'Note to them (optional)'}
        <textarea className="sc-notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus={!!preset} />
      </label>
      <label className="sc-check">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
        Email them now (they&apos;re reminded on day 3, 7 and 14 until they upload it)
      </label>
      {err && <p className="sc-error">{err}</p>}
      <div className="sc-row">
        <button className="sc-btn" disabled={busy}>{busy ? 'Sending…' : email ? 'Send request' : 'Save request'}</button>
        <button type="button" className="sc-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** An open request: what was asked for, when, and resend / cancel behind the ▾. */
function RequestRow({
  req,
  onChange,
}: {
  req: DocRequestRow;
  onChange: (next: DocRequestRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const overdue = !!req.due_on && expiryState(req.due_on) === 'expired';

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const r = await safe(fn);
    setBusy(false);
    if (r.ok) onChange((r as unknown as { request: DocRequestRow }).request);
    else alert(r.error || 'Something went wrong');
  }

  return (
    <div className={`sc-doc sc-request${overdue ? ' is-overdue' : ''}`}>
      <div className="sc-doc-main">
        <strong>{req.replaces_document_id ? `Replacement: ${requestTitle(req)}` : requestTitle(req)}</strong>
        <span className="sc-sub">
          {[
            `asked ${fmt(req.created_at)}`,
            req.emailed_at ? `emailed ${fmt(req.emailed_at)}` : 'not emailed',
            req.due_on && `${overdue ? 'was ' : ''}needed by ${fmt(req.due_on)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {req.note && <span className="sc-sub">“{req.note}”</span>}
      </div>
      <div className="sc-doc-side">
        <span className={`sc-pill ${overdue ? 'is-bad' : 'is-warn'}`}>{overdue ? 'Overdue' : 'Requested'}{busy ? '…' : ''}</span>
        <div className="sc-doc-btns">
          <DocMenu
            disabled={busy}
            label={`Actions for the request for ${requestTitle(req)}`}
            items={[
              { label: req.emailed_at ? 'Resend email' : 'Email it now', onSelect: () => act(() => resendDocumentRequest(req.id)) },
              {
                label: 'Cancel request…',
                danger: true,
                onSelect: () => {
                  if (confirm(`Cancel the request for ${requestTitle(req)}? They won't be chased for it.`))
                    act(() => cancelDocumentRequest(req.id));
                },
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** Reject with a reason, optionally asking for a replacement (emailed now, then chased). */
function RejectForm({
  doc,
  personLeft,
  superseded,
  alreadyAsked,
  onSubmit,
  onCancel,
}: {
  doc: DocumentRow;
  /** Its person has left the team — no replacement can be asked for. */
  personLeft: boolean;
  /** A newer copy is already uploaded — review that instead of asking again. */
  superseded: boolean;
  /** There's already an open request for it. */
  alreadyAsked: boolean;
  onSubmit: (note: string, askForReplacement: boolean) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState(!personLeft && !superseded && !alreadyAsked);
  return (
    <form
      className="sc-doc-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) onSubmit(note.trim(), ask);
      }}
    >
      <label className="sc-field-wide">
        Reason for rejecting {doc.label || doc.file_name} (they see this)
        <textarea className="sc-notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} required autoFocus />
      </label>
      {personLeft ? (
        <p className="sc-muted">{doc.operative_name || 'This person'} has left their team, so no replacement will be asked for.</p>
      ) : superseded ? (
        <p className="sc-muted">They&apos;ve already uploaded a newer copy, so no replacement will be asked for — review that one.</p>
      ) : alreadyAsked ? (
        <p className="sc-muted">They&apos;ve already been asked for this (open request), so no new request will be made.</p>
      ) : (
        <label className="sc-check">
          <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} />
          Email them now and ask for a replacement (chased on day 3, 7 and 14 until they upload one)
        </label>
      )}
      <div className="sc-row">
        <button className="sc-btn" disabled={!note.trim()}>Reject</button>
        <button type="button" className="sc-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const CIS_RATE_SHORT: Record<CisRate, string> = { gross: 'gross (0%)', net: 'net (20%)', higher: 'the higher rate (30%)' };

/**
 * CIS: has our accountant verified this firm with HMRC, and at what rate? A tick-box —
 * ticking asks for what HMRC said; unticking removes the verification.
 */
function CisPanel({ sub }: { sub: SubcontractorRow }) {
  const router = useRouter();
  const d = sub.details || {};
  const declared = d.cisStatus ? DECLARED_CIS_RATE[d.cisStatus] : null;
  // What we just saved, shown until the refreshed page brings the same back (it changes cis_verified_at).
  type CisView = Pick<SubcontractorRow, 'cis_verified_on' | 'cis_rate' | 'cis_verification_ref' | 'cis_verified_by' | 'cis_verified_at'>;
  const [saved, setSaved] = useState<CisView | null>(null);
  const [savedFrom, setSavedFrom] = useState(sub.cis_verified_at ?? null);
  if ((sub.cis_verified_at ?? null) !== savedFrom) {
    setSavedFrom(sub.cis_verified_at ?? null);
    setSaved(null);
  }
  const v: CisView = saved ?? sub;
  const verified = !!v.cis_verified_on && !!v.cis_rate;
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState<CisRate>(v.cis_rate || declared || 'net');
  const [ref, setRef] = useState('');
  const [on, setOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Every time the form opens it starts from what's recorded now.
  function startEdit() {
    setRate(v.cis_rate || declared || 'net');
    setRef(v.cis_verification_ref || '');
    setOn(v.cis_verified_on || '');
    setErr('');
    setEditing(true);
  }

  async function save(next: Parameters<typeof setCisVerification>[1]) {
    setBusy(true);
    setErr('');
    const r = await safe(() => setCisVerification(sub.id, next));
    setBusy(false);
    if (!r.ok) return setErr(r.error || 'Could not save');
    setSaved((r as { cis: CisView }).cis);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="sc-card">
      <div className="sc-row-between">
        <h2>CIS verification</h2>
        <span className={`sc-pill ${verified ? 'is-ok' : 'is-warn'}`}>{verified ? 'Verified' : 'Not verified'}</span>
      </div>
      <p className="sc-muted">
        They told us: {d.cisStatus ? CIS_LABEL[d.cisStatus] : 'not given yet'}
        {d.utr && ` · UTR ${d.utr}`}
        {d.companyNumber && ` · Co. no. ${d.companyNumber}`}
      </p>
      <label className="sc-check">
        <input
          type="checkbox"
          checked={verified || editing}
          disabled={busy}
          onChange={(e) => {
            if (e.target.checked) return startEdit();
            if (!verified) return setEditing(false);
            if (confirm('Remove the CIS verification? It will show as not verified until it is ticked again.')) save({ verified: false });
          }}
        />
        Verified with HMRC by our accountants
      </label>

      {verified && !editing && v.cis_rate && (
        <>
          <dl className="sc-dl">
            <dt>HMRC rate</dt>
            <dd>{CIS_RATE_LABEL[v.cis_rate]}</dd>
            <dt>Verification no.</dt>
            <dd>{v.cis_verification_ref || '—'}</dd>
            <dt>Verified</dt>
            <dd>{fmt(v.cis_verified_on)}{v.cis_verified_by && ` · recorded by ${v.cis_verified_by}`}</dd>
          </dl>
          {declared && declared !== v.cis_rate && (
            <p className="sc-error">
              They told us {CIS_LABEL[d.cisStatus as string]}, but HMRC verified them at {CIS_RATE_SHORT[v.cis_rate]}. Deduct at HMRC&apos;s
              rate.
            </p>
          )}
          <button className="sc-btn-ghost" onClick={startEdit}>Edit details</button>
        </>
      )}

      {editing && (
        <form
          className="sc-doc-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save({ verified: true, rate, ref, verifiedOn: on });
          }}
        >
          <div className="sc-grid">
            <label>
              Rate HMRC gave
              <select value={rate} onChange={(e) => setRate(e.target.value as CisRate)} autoFocus>
                {(Object.keys(CIS_RATE_LABEL) as CisRate[]).map((k) => (
                  <option key={k} value={k}>{CIS_RATE_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <label>
              Verification number
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="V1234567890" />
            </label>
            <label>
              Date verified (blank = today)
              <input type="date" value={on} onChange={(e) => setOn(e.target.value)} max={londonToday()} />
            </label>
          </div>
          {err && <p className="sc-error">{err}</p>}
          <div className="sc-row">
            <button className="sc-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="sc-btn-ghost" onClick={() => { setEditing(false); setErr(''); }}>Cancel</button>
          </div>
        </form>
      )}
      {!editing && err && <p className="sc-error">{err}</p>}
    </section>
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

/**
 * Daily digest reminders for this firm: on/off, what they'd be told, and "send now".
 * Only shown while something is outstanding (or reminders are paused, so they can be resumed).
 */
function RemindersPanel({
  subId,
  paused,
  outstanding,
  onFlash,
}: {
  subId: string;
  paused: boolean;
  outstanding: { kind: string; text: string; urgent: boolean }[];
  /** Success goes to the page banner — resuming with nothing outstanding hides this panel. `toggled`: pause/resume. */
  onFlash: (f: { kind: 'ok' | 'err'; text: string }, toggled?: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, toggled = false) {
    setBusy(true);
    setMsg(null);
    const r = await safe(fn);
    setBusy(false);
    if (r.ok) onFlash({ kind: 'ok', text: okText }, toggled);
    else setMsg({ ok: false, text: r.error || 'Something went wrong' });
    router.refresh();
  }

  return (
    <section className="sc-card">
      <div className="sc-row-between">
        <h2>Reminders</h2>
        <span className={`sc-pill ${paused ? 'is-warn' : 'is-ok'}`}>{paused ? 'Paused' : 'On'}</span>
      </div>
      <p className="sc-muted">
        Automatic daily email listing everything outstanding — onboarding, missing or expiring documents, documents you
        have requested, crews to choose, NTP agreements to sign. Each chase goes once (e.g. day 3, 7, 14).
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
          onClick={() => act(() => setRemindersPaused(subId, !paused), paused ? 'Reminders resumed.' : 'Reminders paused.', true)}
        >
          {paused ? 'Resume automatic reminders' : 'Pause automatic reminders'}
        </button>
      </div>
      {msg && <p className={msg.ok ? 'sc-muted' : 'sc-error'}>{msg.text}</p>}
    </section>
  );
}
