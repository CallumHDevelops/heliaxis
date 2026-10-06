'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { CATEGORY_BY_KEY, compliance, DOC_CATEGORIES, expiryState } from '@/lib/subcontractors/documents';
import {
  CIS_LABEL,
  ENTITY_LABEL,
  STATUS_LABEL,
  type DocumentRow,
  type EventRow,
  type SubcontractorRow,
} from '@/lib/subcontractors/types';
import { countersign, deleteDocument, reviewDocument, saveNotes, sendLink, setStatus, syncToRams, updateTerms } from '../actions';
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
  rams,
}: {
  sub: SubcontractorRow;
  agreement: AgreementSummary;
  documents: DocumentRow[];
  events: EventRow[];
  adminName: string;
  rams: RamsInfo;
}) {
  const router = useRouter();
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
        </div>

        <aside className="sc-col-side">
          <RamsPanel rams={rams} subId={sub.id} status={sub.status} />

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

type RamsInfo = {
  configured: boolean;
  appUrl: string;
  ramsId: string | null;
  syncedAt: string | null;
  error: string | null;
  /** False until supabase/rams-sync.sql has been run. */
  setUp: boolean;
};

/** Copies of approved insurance, cards and qualifications go to the RAMS app. */
function RamsPanel({ rams, subId, status }: { rams: RamsInfo; subId: string; status: SubcontractorRow['status'] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  let body: React.ReactNode;
  if (!rams.configured) body = <p className="sc-muted">RAMS isn&apos;t connected — add RAMS_SUPABASE_URL and RAMS_SUPABASE_SERVICE_ROLE_KEY in Vercel.</p>;
  else if (!rams.setUp) body = <p className="sc-muted">Run <code>supabase/rams-sync.sql</code> in Supabase to switch syncing on.</p>;
  else
    body = (
      <>
        <dl className="sc-dl">
          <dt>Status</dt>
          <dd>
            {rams.ramsId ? `Synced ${fmt(rams.syncedAt, true)}` : status === 'active' ? 'Not synced yet' : 'Sent once countersigned'}
          </dd>
        </dl>
        {rams.error && <p className="sc-error">{rams.error}</p>}
        <div className="sc-row">
          <button
            className="sc-btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              const r = await syncToRams(subId);
              setBusy(false);
              setMsg(
                r.ok
                  ? { ok: true, text: `Synced — ${r.copied} new document${r.copied === 1 ? '' : 's'} copied.` }
                  : { ok: false, text: r.error }
              );
              router.refresh();
            }}
          >
            {busy ? 'Syncing…' : 'Sync to RAMS now'}
          </button>
          {rams.ramsId && (
            <a className="sc-link-btn" href={`${rams.appUrl}/subcontractors/${rams.ramsId}`} target="_blank" rel="noreferrer">
              Open in RAMS ↗
            </a>
          )}
        </div>
        {msg && <p className={msg.ok ? 'sc-muted' : 'sc-error'}>{msg.text}</p>}
      </>
    );

  return (
    <section className="sc-card">
      <h2>RAMS</h2>
      <p className="sc-muted">
        Approved insurance, cards and qualifications are copied to RAMS so this firm can be named on a RAMS. Photo ID and
        bank details stay here.
      </p>
      {body}
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
        {(doc as DocumentRow & { rams_row_id?: string | null }).rams_row_id && (
          <span className="sc-pill is-ok" title="Copied into RAMS">In RAMS</span>
        )}
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
