'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { useDocViewer, type ViewerDoc } from '@/components/subcontractors/DocViewer';
import { shrinkImage } from '@/lib/subcontractors/shrink-image';
import { NTP_TECHNOLOGIES } from '@/lib/subcontractors/ntp-agreement';
import {
  ALLOWED_MIME,
  CATEGORY_BY_KEY,
  MAX_TOTAL_UPLOAD_BYTES,
  compliance,
  DOC_CATEGORIES,
  expiryState,
  MAX_FILE_BYTES,
  operativeCompliance,
  requestTitle,
  type DocCategory,
} from '@/lib/subcontractors/documents';
import {
  ASSIGNMENT_LABEL,
  missingDetails,
  NTP_STATUS_LABEL,
  type NtpStatus,
  type AssignmentRow,
  type DocumentRow,
  type OperativeRow,
  type PortalRequest,
  type SubDetails,
  type SubStatus,
} from '@/lib/subcontractors/types';

type PortalDoc = Omit<DocumentRow, 'storage_path'>;

type Props = {
  sub: {
    ref: string;
    companyName: string;
    contactName: string;
    email: string;
    phone: string | null;
    trade: string | null;
    status: SubStatus;
    details: SubDetails;
    docsSubmittedAt: string | null;
  };
  agreement: { subName: string; subSignedAt: string; hlxName: string | null; hlxSignedAt: string | null } | null;
  documents: PortalDoc[];
  operatives: OperativeRow[];
  /** Documents Heliaxis has asked for that haven't been uploaded yet. */
  requests: PortalRequest[];
  jobs: AssignmentRow[];
  ntps: PortalNtp[];
  ntpViews: Record<string, ReactNode>;
  hash: string;
  agreementView: ReactNode;
};

type Step = 'details' | 'agreement' | 'team' | 'documents' | 'jobs' | 'ntp';

async function post<T = Record<string, unknown>>(url: string, body: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error || 'Something went wrong — please try again.');
  return data;
}

// One document can be built from several files (pages); the server merges them into a PDF.
const MAX_UPLOAD_FILES = 10;
const fmtSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

const fmt = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function PortalApp({ sub, agreement, documents, operatives, requests, jobs, ntps, ntpViews, hash, agreementView }: Props) {
  const router = useRouter();
  const signed = !!agreement;
  const [details, setDetails] = useState<SubDetails>(() => ({
    legalName: sub.companyName,
    primaryContact: sub.contactName,
    noticesEmail: sub.email,
    accountsEmail: sub.email,
    phone: sub.phone || '',
    ...sub.details,
  }));
  const savedComplete = missingDetails(sub.details).length === 0;
  const [docs, setDocs] = useState<PortalDoc[]>(documents);
  const [team, setTeam] = useState<OperativeRow[]>(operatives);
  const activeTeam = team.filter((o) => !o.archived_at);
  const [reqs, setReqs] = useState<PortalRequest[]>(requests);
  // A request for someone who has since left the team can't be answered here.
  const openReqs = reqs.filter((q) => !q.operativeId || activeTeam.some((o) => o.id === q.operativeId));
  const waitingJobs = jobs.filter((j) => j.status === 'awaiting_crew').length;
  const ntpToSign = ntps.filter((n) => n.status === 'awaiting_signature' && !n.signsByLink).length;
  const [step, setStep] = useState<Step>(
    !savedComplete
      ? 'details'
      : !signed
        ? 'agreement'
        : ntpToSign
          ? 'ntp'
          : waitingJobs
            ? 'jobs'
            : openReqs.length
              ? 'documents'
              : !activeTeam.length
              ? 'team'
              : 'documents'
  );

  const comp = useMemo(() => compliance(details, docs as DocumentRow[]), [details, docs]);

  const steps: { key: Step; label: string; done: boolean }[] = [
    { key: 'details', label: 'Your details', done: savedComplete },
    { key: 'agreement', label: 'Sign agreement', done: signed },
    { key: 'team', label: 'Your team', done: activeTeam.length > 0 },
    {
      key: 'documents',
      label: openReqs.length ? `Documents (${openReqs.length} requested)` : 'Documents',
      done: !!sub.docsSubmittedAt && comp.ok && !openReqs.length,
    },
    { key: 'jobs', label: waitingJobs ? `Jobs (${waitingJobs} to answer)` : 'Jobs', done: !!jobs.length && !waitingJobs },
    ...(ntps.length
      ? [{ key: 'ntp' as Step, label: ntpToSign ? `NTP (${ntpToSign} to sign)` : 'NTP', done: !ntpToSign }]
      : []),
  ];

  return (
    <div className="pt-wrap">
      <section className="pt-hero">
        <div className="pt-row-between">
          <p className="pt-kicker">{sub.ref}</p>
          <button
            type="button"
            className="pt-inline pt-signout"
            onClick={async () => {
              await fetch('/api/portal/logout', { method: 'POST' });
              router.replace('/portal');
            }}
          >
            Sign out
          </button>
        </div>
        <h1>{sub.companyName}</h1>
        <StatusBanner status={sub.status} agreement={agreement} comp={comp} requested={openReqs.length} />
      </section>

      <nav className="pt-steps" aria-label="Onboarding steps">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`pt-step${step === s.key ? ' is-active' : ''}${s.done ? ' is-done' : ''}`}
            onClick={() => setStep(s.key)}
            aria-current={step === s.key ? 'step' : undefined}
          >
            <span className="pt-step-n">{s.done ? '✓' : i + 1}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {step === 'details' && (
        <DetailsStep
          details={details}
          setDetails={setDetails}
          locked={signed}
          onSaved={(complete) => {
            router.refresh();
            if (complete) setStep('agreement');
          }}
        />
      )}
      {step === 'agreement' && (
        <AgreementStep
          hash={hash}
          agreement={agreement}
          detailsComplete={savedComplete}
          defaultName={sub.contactName}
          defaultTitle={sub.trade || ''}
          view={agreementView}
          goDetails={() => setStep('details')}
          onSigned={() => {
            router.refresh();
            setStep('documents');
          }}
        />
      )}
      {step === 'team' && <TeamStep team={team} setTeam={setTeam} docs={docs} ntps={ntps} />}
      {step === 'ntp' && <NtpStep ntps={ntps} views={ntpViews} onChanged={() => router.refresh()} />}
      {step === 'jobs' && <JobsStep jobs={jobs} team={activeTeam} docs={docs} onChanged={() => router.refresh()} />}
      {step === 'documents' && (
        <DocumentsStep
          operatives={activeTeam}
          details={details}
          docs={docs}
          setDocs={setDocs}
          requests={openReqs}
          onFulfilled={(ids) => setReqs((list) => list.filter((q) => !ids.includes(q.id)))}
          onReopened={(back) => setReqs((list) => [...list.filter((q) => !back.some((b) => b.id === q.id)), ...back])}
          submittedAt={sub.docsSubmittedAt}
          onSubmitted={() => router.refresh()}
        />
      )}
    </div>
  );
}

function StatusBanner({
  status,
  agreement,
  comp,
  requested,
}: {
  status: SubStatus;
  agreement: Props['agreement'];
  comp: ReturnType<typeof compliance>;
  /** Open document requests from Heliaxis. */
  requested: number;
}) {
  if (status === 'suspended')
    return <p className="pt-banner is-bad">Your account is suspended. Please contact Heliaxis.</p>;
  if (agreement?.hlxSignedAt)
    return (
      <p className={`pt-banner ${comp.ok && !comp.expiring.length && !requested ? 'is-ok' : 'is-warn'}`}>
        Agreement live since {fmt(agreement.hlxSignedAt)}.{' '}
        {comp.expired.length
          ? `${comp.expired.length} document(s) have expired — please upload renewals.`
          : comp.expiring.length
            ? `${comp.expiring.length} document(s) expire within 30 days — please upload renewals.`
            : comp.missing.length
              ? `Still needed: ${comp.missing.join(', ')}.`
              : requested
                ? `Heliaxis has asked for ${requested === 1 ? 'a document' : `${requested} documents`} — see Documents.`
                : 'Your documents are up to date.'}
      </p>
    );
  if (agreement)
    return (
      <p className="pt-banner is-info">
        You signed on {fmt(agreement.subSignedAt)}. Heliaxis will countersign once your documents have been checked.
      </p>
    );
  return <p className="pt-banner is-info">Confirm your details, sign the agreement, add your team and upload your documents.</p>;
}

// ---------------------------------------------------------------- details

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`pt-field${wide ? ' is-wide' : ''}`}>
      <span className="pt-label">{label}</span>
      {children}
      {hint && <span className="pt-hint">{hint}</span>}
    </label>
  );
}

function DetailsStep({
  details: d,
  setDetails,
  locked,
  onSaved,
}: {
  details: SubDetails;
  setDetails: (fn: (d: SubDetails) => SubDetails) => void;
  locked: boolean;
  onSaved: (complete: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const set = <K extends keyof SubDetails>(k: K) => (v: SubDetails[K]) => setDetails((x) => ({ ...x, [k]: v }));
  const text = (k: keyof SubDetails) => ({
    value: (d[k] as string) || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value as never),
    disabled: locked,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ complete: boolean; missing: string[] }>('/api/portal/details', { details: d });
      setMsg(
        r.complete
          ? { kind: 'ok', text: 'Saved.' }
          : { kind: 'err', text: `Saved — still needed before you can sign: ${r.missing.join(', ')}.` }
      );
      onSaved(r.complete);
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pt-card" onSubmit={save}>
      <h2>Your details</h2>
      <p className="pt-muted">
        These complete Schedule B of the agreement (party details and notices) and let us pay you.
        {locked && ' Your agreement is signed, so these are now locked — email us if anything changes.'}
      </p>

      <fieldset className="pt-grid" disabled={locked}>
        <legend>Business</legend>
        <Field label="Business type">
          <select value={d.entityType || ''} onChange={(e) => set('entityType')((e.target.value || undefined) as SubDetails['entityType'])}>
            <option value="">Choose…</option>
            <option value="limited">Limited company</option>
            <option value="sole_trader">Sole trader</option>
            <option value="partnership">Partnership</option>
          </select>
        </Field>
        <Field label="Legal / trading name"><input {...text('legalName')} autoComplete="organization" /></Field>
        {d.entityType === 'limited' && (
          <Field label="Company number"><input {...text('companyNumber')} inputMode="text" /></Field>
        )}
        <Field label="VAT number" hint="Leave blank if not VAT registered"><input {...text('vatNumber')} /></Field>
        <Field label="Registered address" wide><textarea rows={2} {...text('registeredAddress')} autoComplete="street-address" /></Field>
        <Field label="Principal place of work" hint="Where you travel from — mileage beyond 70 miles is measured from here (Clause 4.4)" wide>
          <textarea rows={2} {...text('baseAddress')} />
        </Field>
      </fieldset>

      <fieldset className="pt-grid" disabled={locked}>
        <legend>Tax &amp; CIS</legend>
        <Field label="UTR" hint="10-digit Unique Taxpayer Reference"><input {...text('utr')} inputMode="numeric" /></Field>
        <Field label="CIS status">
          <select value={d.cisStatus || ''} onChange={(e) => set('cisStatus')((e.target.value || undefined) as SubDetails['cisStatus'])}>
            <option value="">Choose…</option>
            <option value="gross">Registered — gross payment status</option>
            <option value="net">Registered — net payment status</option>
            <option value="unregistered">Not registered</option>
          </select>
        </Field>
        {d.cisStatus && d.cisStatus !== 'unregistered' && (
          <Field label="CIS verification number" hint="If you have one"><input {...text('cisNumber')} /></Field>
        )}
      </fieldset>

      <fieldset className="pt-grid" disabled={locked}>
        <legend>Contacts &amp; notices</legend>
        <Field label="Primary contact"><input {...text('primaryContact')} autoComplete="name" /></Field>
        <Field label="Phone"><input {...text('phone')} type="tel" autoComplete="tel" /></Field>
        <Field label="Notices email" hint="Formal notices under the agreement go here"><input {...text('noticesEmail')} type="email" /></Field>
        <Field label="Accounts / invoices email"><input {...text('accountsEmail')} type="email" /></Field>
      </fieldset>

      <fieldset className="pt-grid" disabled={locked}>
        <legend>Bank details for payment</legend>
        <Field label="Account name"><input {...text('bankAccountName')} /></Field>
        <Field label="Sort code" hint="e.g. 12-34-56"><input {...text('sortCode')} inputMode="numeric" /></Field>
        <Field label="Account number" hint="8 digits"><input {...text('accountNumber')} inputMode="numeric" /></Field>
      </fieldset>

      <fieldset className="pt-grid" disabled={locked}>
        <legend>Your team</legend>
        <Field label="Do you employ anyone?" hint="If yes, we'll need Employers' Liability insurance (£5m)">
          <select
            value={d.employsStaff === undefined ? '' : d.employsStaff ? 'yes' : 'no'}
            onChange={(e) => set('employsStaff')(e.target.value === '' ? undefined : e.target.value === 'yes')}
          >
            <option value="">Choose…</option>
            <option value="no">No — just me / partners</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </fieldset>

      {!locked && (
        <div className="pt-actions">
          {msg && <p className={`pt-msg is-${msg.kind}`}>{msg.text}</p>}
          <button className="pt-btn" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- agreement

function AgreementStep({
  hash,
  agreement,
  detailsComplete,
  defaultName,
  defaultTitle,
  view,
  goDetails,
  onSigned,
}: {
  hash: string;
  agreement: Props['agreement'];
  detailsComplete: boolean;
  defaultName: string;
  defaultTitle: string;
  view: ReactNode;
  goDetails: () => void;
  onSigned: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState(defaultTitle);
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function sign() {
    setBusy(true);
    setErr('');
    try {
      await post('/api/portal/sign', { name, title, signature: sig, agree, hash });
      onSigned();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-card">
      <div className="pt-row-between">
        <h2>Subcontractor Framework Agreement</h2>
        <a className="pt-link" href="/portal/app/agreement" target="_blank" rel="noreferrer">
          Open full page / print ↗
        </a>
      </div>
      {!detailsComplete && !agreement && (
        <p className="pt-banner is-warn">
          Please <button type="button" className="pt-inline" onClick={goDetails}>complete your details</button> first —
          they&apos;re written into the agreement.
        </p>
      )}
      <div className="pt-doc">{view}</div>

      {agreement ? (
        <p className="pt-banner is-ok">
          Signed by {agreement.subName} on {fmt(agreement.subSignedAt)}.{' '}
          {agreement.hlxSignedAt
            ? `Countersigned by ${agreement.hlxName} on ${fmt(agreement.hlxSignedAt)} — the agreement is live.`
            : 'Awaiting Heliaxis countersignature.'}
        </p>
      ) : (
        detailsComplete && (
          <div className="pt-sign">
            <h3>Sign for and on behalf of the Subcontractor</h3>
            <div className="pt-grid">
              <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
              <Field label="Title / trade" hint="e.g. Director, Electrician"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            </div>
            <SignaturePad onChange={setSig} />
            <label className="pt-check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I have read the Subcontractor Framework Agreement above, I am authorised to sign it on behalf of the
                Subcontractor, and I agree that my electronic signature is legally binding.
              </span>
            </label>
            {err && <p className="pt-msg is-err">{err}</p>}
            <button className="pt-btn" type="button" disabled={busy || !agree || !sig || name.trim().length < 2} onClick={sign}>
              {busy ? 'Signing…' : 'Sign agreement'}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------- documents

function chip(d: PortalDoc) {
  const ex = expiryState(d.expires_on);
  if (d.status === 'rejected') return <span className="pt-chip is-bad">Rejected</span>;
  if (ex === 'expired') return <span className="pt-chip is-bad">Expired {fmt(d.expires_on)}</span>;
  if (ex === 'expiring') return <span className="pt-chip is-warn">Expires {fmt(d.expires_on)}</span>;
  if (d.status === 'approved') return <span className="pt-chip is-ok">Approved</span>;
  return <span className="pt-chip">Awaiting review</span>;
}

function DocumentsStep({
  operatives,
  details,
  docs,
  setDocs,
  requests,
  onFulfilled,
  onReopened,
  submittedAt,
  onSubmitted,
}: {
  operatives: OperativeRow[];
  details: SubDetails;
  docs: PortalDoc[];
  setDocs: (fn: (d: PortalDoc[]) => PortalDoc[]) => void;
  requests: PortalRequest[];
  onFulfilled: (ids: string[]) => void;
  onReopened: (reqs: PortalRequest[]) => void;
  submittedAt: string | null;
  onSubmitted: () => void;
}) {
  const comp = compliance(details, docs as DocumentRow[]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await post('/api/portal/submit', {});
      setMsg({ kind: 'ok', text: "Thanks — we've been notified and will review your documents." });
      onSubmitted();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this document?')) return;
    try {
      const r = await post<{ reopened?: PortalRequest[] }>('/api/portal/documents', { id }, 'DELETE');
      setDocs((list) => list.filter((d) => d.id !== id));
      // It was answering a request — that request is back on the list.
      if (r.reopened?.length) onReopened(r.reopened);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const [notice, setNotice] = useState('');
  // Documents open in an in-page viewer (phones can't show PDFs in a new tab reliably).
  const { open: view, viewer } = useDocViewer();
  const liveRef = useRef<HTMLParagraphElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const added = (doc: PortalDoc, fulfilled: string[], note?: string, fromCard = false) => {
    setDocs((list) => [doc, ...list]);
    if (fulfilled.length) onFulfilled(fulfilled);
    setNotice(note || '');
    // Uploaded from a request card: the card (and the button focused in it) has gone — keep the user's place.
    if (fromCard) setTimeout(() => (note ? liveRef.current : headRef.current)?.focus(), 0);
  };

  return (
    <div className="pt-card">
      <h2 ref={headRef} tabIndex={-1}>Documents</h2>
      <p className="pt-muted">
        PDFs or clear photos, up to 15 MB each. Come back to this page whenever something renews — the agreement asks you
        to send renewals at least 30 days before expiry (Clause 3A.2).
      </p>

      {viewer}
      {/* Always present, so screen readers announce the text when it appears. */}
      <p ref={liveRef} tabIndex={-1} className="pt-msg is-ok pt-live" role="status" aria-live="polite">
        {notice}
      </p>
      {requests.length > 0 && (
        <section className="pt-requests" aria-label="Requested by Heliaxis">
          <h3>Heliaxis has asked for {requests.length === 1 ? 'this' : `these ${requests.length}`}</h3>
          {requests.map((q) => (
            <RequestCard key={q.id} q={q} operatives={operatives} onAdded={added} />
          ))}
        </section>
      )}

      <div className="pt-cats">
        {DOC_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            cat={cat}
            required={cat.required(details)}
            docs={docs.filter((d) => d.category === cat.key)}
            operatives={operatives}
            requests={requests.filter((q) => q.category === cat.key)}
            onView={view}
            onAdded={added}
            onRemove={remove}
          />
        ))}
      </div>

      <div className="pt-actions">
        {comp.missing.length > 0 && <p className="pt-msg is-err">Still needed: {comp.missing.join(', ')}.</p>}
        {msg && <p className={`pt-msg is-${msg.kind}`}>{msg.text}</p>}
        {submittedAt && !msg && <p className="pt-muted">Last sent for review {fmt(submittedAt)}.</p>}
        <button className="pt-btn" type="button" disabled={busy || comp.missing.length > 0} onClick={submit}>
          {busy ? 'Sending…' : submittedAt ? 'Notify Heliaxis of new uploads' : 'Send to Heliaxis for review'}
        </button>
      </div>
    </div>
  );
}

const reqTitle = (q: PortalRequest) => requestTitle({ category: q.category, label: q.label, operative_name: q.operativeName });

/** Something Heliaxis has asked for, with its own upload form. */
function RequestCard({
  q,
  operatives,
  onAdded,
}: {
  q: PortalRequest;
  operatives: OperativeRow[];
  onAdded: (d: PortalDoc, fulfilled: string[], notice?: string, fromCard?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY_BY_KEY[q.category];
  const overdue = !!q.dueOn && expiryState(q.dueOn) === 'expired';
  return (
    <div className={`pt-request${overdue ? ' is-overdue' : ''}`}>
      <div className="pt-request-head">
        <div>
          <strong>{q.replacement ? `New ${reqTitle(q)}` : reqTitle(q)}</strong>
          <span className="pt-docmeta">
            {[q.replacement ? 'Replacement for one we couldn’t accept' : `Requested ${fmt(q.createdAt)}`, q.dueOn && `${overdue ? 'was ' : ''}needed by ${fmt(q.dueOn)}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {q.note && <span className={q.replacement ? 'pt-docnote' : 'pt-reqnote'}>{q.replacement ? `Why: ${q.note}` : q.note}</span>}
        </div>
        {!open && cat && (
          <button type="button" className="pt-btn" onClick={() => setOpen(true)}>
            Upload
          </button>
        )}
      </div>
      {open && cat && <UploadForm cat={cat} operatives={operatives} requests={[]} fixed={q} onAdded={onAdded} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CategoryCard({
  cat,
  required,
  docs,
  operatives,
  requests,
  onView,
  onAdded,
  onRemove,
}: {
  cat: DocCategory;
  required: boolean;
  docs: PortalDoc[];
  operatives: OperativeRow[];
  /** Open requests in this category. */
  requests: PortalRequest[];
  onView: (doc: ViewerDoc) => void;
  onAdded: (d: PortalDoc, fulfilled: string[], notice?: string, fromCard?: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const has = docs.some((d) => d.status !== 'rejected');

  return (
    <section className={`pt-cat${(required && !has) || requests.length ? ' is-needed' : ''}`}>
      <header className="pt-cat-head">
        <div>
          <h3>
            {cat.label} {required ? <span className="pt-req">Required</span> : <span className="pt-opt">If applicable</span>}
            {requests.length > 0 && <> <span className="pt-req">Requested</span></>}
          </h3>
          <p className="pt-hint">
            {cat.hint}
            {cat.clause && <> · Clause {cat.clause}</>}
          </p>
        </div>
        {!open && (
          <button type="button" className="pt-btn-ghost" onClick={() => setOpen(true)}>
            + Add
          </button>
        )}
      </header>

      {docs.length > 0 && (
        <ul className="pt-doclist">
          {docs.map((d) => (
            <li key={d.id}>
              <a
                href={`/api/portal/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onView({
                    src: `/api/portal/documents/${d.id}`,
                    title: d.label || d.file_name,
                    mime: d.mime,
                    downloadHref: `/api/portal/documents/${d.id}?download=1`,
                  });
                }}
              >
                {d.label || d.file_name}
              </a>
              <span className="pt-docmeta">
                {[d.operative_name, d.cover_amount, d.reference].filter(Boolean).join(' · ')}
              </span>
              {chip(d)}
              {d.status === 'rejected' && d.review_note && <span className="pt-docnote">{d.review_note}</span>}
              {d.status !== 'approved' && (
                <button type="button" className="pt-x" onClick={() => onRemove(d.id)} aria-label="Remove document">
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && <UploadForm cat={cat} operatives={operatives} requests={requests} onAdded={onAdded} onClose={() => setOpen(false)} />}
    </section>
  );
}

/**
 * Upload one file into a category. From a request card it answers that request (and the
 * person is fixed); from a category with open requests it asks which one, if any, it's for.
 */
function UploadForm({
  cat,
  operatives,
  requests,
  fixed,
  onAdded,
  onClose,
}: {
  cat: DocCategory;
  operatives: OperativeRow[];
  requests: PortalRequest[];
  fixed?: PortalRequest;
  onAdded: (d: PortalDoc, fulfilled: string[], notice?: string, fromCard?: boolean) => void;
  onClose: () => void;
}) {
  // From a category's "+ Add", the firm says which request (if any) this answers — never assumed,
  // except when there's exactly one and it's a plain "any one of these" request.
  const only = requests.length === 1 && !requests[0].label && !requests[0].operativeId ? requests[0].id : '';
  const [forReq, setForReq] = useState(fixed?.id ?? only);
  // The chosen request may have been answered (from its card) since this form opened.
  const cur = fixed ? fixed.id : forReq === 'none' || requests.some((q) => q.id === forReq) ? forReq : '';
  const sel = fixed ?? requests.find((q) => q.id === cur);
  // Several files (e.g. a card's front and back) become one PDF, in this order.
  const [files, setFiles] = useState<File[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [stage, setStage] = useState('');
  const uid = useId();
  const [operativeId, setOperativeId] = useState(sel?.operativeId || operatives[0]?.id || '');
  const [label, setLabel] = useState(sel?.label || '');
  // The description we filled in from a request (replaced when the choice changes; typed text is kept).
  const [autoLabel, setAutoLabel] = useState(sel?.label || '');
  const [reference, setReference] = useState('');
  const [cover, setCover] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // A request for a named person can only be answered with that person's document.
  const person = sel?.operativeId || operativeId;

  function chooseRequest(id: string) {
    setForReq(id);
    const q = requests.find((x) => x.id === id);
    if (q?.operativeId) setOperativeId(q.operativeId);
    if (label === autoLabel) {
      setLabel(q?.label || '');
      setAutoLabel(q?.label || '');
    }
  }

  // Some browsers (notably Windows) report HEIC photos with an empty type.
  const mimeOf = (f: File) => f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : '');

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    setPickerKey((k) => k + 1); // so picking the same file again still fires
    if (!picked.length) return;
    const bad = picked.find((f) => !ALLOWED_MIME.includes(mimeOf(f)));
    if (bad) return setErr(`${bad.name} isn't a PDF or a photo (JPG, PNG, WebP, HEIC).`);
    const big = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return setErr(`${big.name} is over 15 MB.`);
    const next = [...files, ...picked];
    if (next.length > MAX_UPLOAD_FILES) return setErr(`Up to ${MAX_UPLOAD_FILES} files per document.`);
    // Roughly what will actually upload: big photos are shrunk to ~1.5 MB first; PDFs and HEIC go as they are.
    const willSend = (f: File) => (/^image\/(jpeg|png|webp)$/.test(mimeOf(f)) ? Math.min(f.size, 1_500_000) : f.size);
    if (next.reduce((n, f) => n + willSend(f), 0) > MAX_TOTAL_UPLOAD_BYTES) {
      return setErr('Those files add up to more than 80 MB — upload them as separate documents.');
    }
    setErr('');
    setFiles(next);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return setErr('Choose a file.');
    if (!fixed && requests.length && !cur) return setErr('Say whether this is for something Heliaxis asked for.');
    setBusy(true);
    setErr('');
    const uploaded: { path: string; fileName: string; size: number }[] = [];
    // Files that went up but never became a document — removed if this attempt fails.
    const cleanup = (paths: string[]) => {
      if (paths.length) post('/api/portal/upload-url', { paths }, 'DELETE').catch(() => {});
    };
    let uploading = '';
    try {
      for (const [i, original] of files.entries()) {
        setStage(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…');
        const file = await shrinkImage(original);
        const mime = mimeOf(file);
        const u = await post<{ path: string; uploadToken: string; bucket: string }>('/api/portal/upload-url', {
          category: cat.key,
          fileName: file.name,
          size: file.size,
          mime,
        });
        uploading = u.path; // it may have landed even if the upload reports an error
        const { error } = await createClient().storage.from(u.bucket).uploadToSignedUrl(u.path, u.uploadToken, file, {
          contentType: mime,
        });
        if (error) throw new Error('Upload failed — please check your connection and try again.');
        // The name of what was actually sent (a shrunk photo is a .jpg).
        uploaded.push({ path: u.path, fileName: file.name, size: file.size });
        uploading = '';
      }
      setStage(files.length > 1 || files.some((f) => mimeOf(f) !== 'application/pdf') ? 'Converting to PDF…' : 'Saving…');
      const posted = uploaded.splice(0); // the server owns them from here (and cleans up if it refuses)
      const res = await fetch('/api/portal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: posted,
          category: cat.key,
          label,
          operativeId: person,
          reference,
          cover,
          expiresOn,
          requestId: fixed ? fixed.id : requests.length ? cur : undefined,
        }),
      }).catch(() => null);
      if (!res) {
        // Signal dropped mid-request: the server may well have saved it. Reload to see, rather
        // than invite a second upload (and don't delete files it may be using).
        setErr('Connection lost — we may have received it. Reloading to check…');
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
      const r = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; document: PortalDoc; fulfilled?: string[] } | null;
      if (!r) {
        // Not our reply — the request was cut off (timed out). Its files belong to no document.
        cleanup(posted.map((p) => p.path));
        throw new Error('That took too long — try fewer or smaller files.');
      }
      if (!res.ok || r.ok === false) throw new Error(r.error || 'Something went wrong — please try again.');
      const fulfilled = r.fulfilled ?? [];
      // Uploaded against a request that had already been closed (by Heliaxis, or from another
      // device): drop it from the page and say so, rather than leave it looking unanswered.
      const asked = fixed?.id ?? (cur && cur !== 'none' ? cur : '');
      if (asked && !fulfilled.includes(asked)) {
        onAdded(r.document, [...fulfilled, asked], 'Uploaded. That request had already been closed, so there was nothing left to tick off.', !!fixed);
      } else {
        onAdded(r.document, fulfilled, undefined, !!fixed);
      }
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
      // Files that went up before something failed aren't part of any document — remove them.
      cleanup([...uploaded.map((u) => u.path), ...(uploading ? [uploading] : [])]);
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  return (
    <form className="pt-upload" onSubmit={upload}>
      <div className="pt-grid">
        {!fixed && requests.length > 0 && (
          <Field label="Is this for something Heliaxis asked for?" wide>
            <select value={cur} onChange={(e) => chooseRequest(e.target.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {requests.map((q) => (
                <option key={q.id} value={q.id}>Yes — {reqTitle(q)}</option>
              ))}
              <option value="none">No — something else</option>
            </select>
          </Field>
        )}
        <div className="pt-field is-wide">
          <span className="pt-label" id={`${uid}-files`}>{files.length ? 'Files (in page order)' : 'File'}</span>
          {files.length > 0 && (
            <ol className="pt-files" aria-labelledby={`${uid}-files`}>
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`}>
                  <span className="pt-file-n" aria-hidden="true">{i + 1}.</span>
                  <span className="pt-file-name">{f.name}</span>
                  <span className="pt-docmeta">{fmtSize(f.size)}</span>
                  <button
                    type="button"
                    className="pt-x"
                    disabled={busy}
                    onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
          {files.length < MAX_UPLOAD_FILES && (
            <input
              key={pickerKey}
              type="file"
              multiple
              accept={ALLOWED_MIME.join(',')}
              onChange={(e) => addFiles(e.target.files)}
              disabled={busy}
              aria-labelledby={`${uid}-files`}
              aria-describedby={`${uid}-hint`}
            />
          )}
          <span className="pt-hint" id={`${uid}-hint`}>
            {files.length
              ? 'Add more to put them in the same PDF.'
              : `A PDF or photos — several photos (e.g. ${cat.key === 'card' ? 'front and back' : 'each page'}) become one PDF. Up to 80 MB in total.`}
          </span>
        </div>
        {cat.operative && (
          <Field label="Team member" hint={operatives.length ? undefined : 'Add your team first (Your team tab)'}>
            <select value={person} onChange={(e) => setOperativeId(e.target.value)} disabled={!!sel?.operativeId} required>
              <option value="">Choose…</option>
              {operatives.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Description" hint={cat.key === 'qualification' ? 'e.g. C&G 2391-52' : cat.key === 'card' ? 'e.g. ECS Gold card' : undefined}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label={cat.cover ? 'Policy number' : 'Reference / card number'}>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {cat.cover && (
          <Field label="Cover amount" hint="e.g. £2,000,000">
            <input value={cover} onChange={(e) => setCover(e.target.value)} />
          </Field>
        )}
        {cat.expiry !== 'none' && (
          <Field label={`Expiry date${cat.expiry === 'optional' ? ' (if any)' : ''}`}>
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required={cat.expiry === 'required'} />
          </Field>
        )}
      </div>
      {err && <p className="pt-msg is-err">{err}</p>}
      {busy && stage && <p className="pt-msg" role="status">{stage}</p>}
      <div className="pt-row">
        <button className="pt-btn" disabled={busy || !files.length}>{busy ? stage || 'Uploading…' : 'Upload'}</button>
        <button type="button" className="pt-btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- team

function ReadyChip({ c }: { c: ReturnType<typeof operativeCompliance> }) {
  if (c.ready && !c.expiring) return <span className="pt-chip is-ok">Ready for site</span>;
  if (c.ready) return <span className="pt-chip is-warn">{c.expiring} expiring soon</span>;
  return (
    <span className="pt-chip is-bad" title={c.missing.join(', ')}>
      {c.missing.length ? `Needs ${c.missing.join(' + ').toLowerCase()}` : `${c.expired} expired`}
    </span>
  );
}

function TeamStep({
  team,
  setTeam,
  docs,
  ntps,
}: {
  team: OperativeRow[];
  setTeam: (fn: (t: OperativeRow[]) => OperativeRow[]) => void;
  docs: PortalDoc[];
  ntps: PortalNtp[];
}) {
  const ntpOf = (id: string) =>
    ntps
      .filter((n) => n.operativeId === id && ['active', 'awaiting_signature', 'awaiting_countersign'].includes(n.status))
      .map((n) => ({
        techs: n.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label.split(' (')[0] ?? k).join(', '),
        live: n.status === 'active',
        suffix: n.status === 'awaiting_signature' ? ' (to sign)' : n.status === 'awaiting_countersign' ? ' (signed — awaiting Heliaxis)' : '',
      }));
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await post<{ operative: OperativeRow }>('/api/portal/operatives', { fullName: name, role, phone });
      setTeam((t) => [...t, r.operative].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setName('');
      setRole('');
      setPhone('');
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive(o: OperativeRow, archived: boolean) {
    if (archived && !confirm(`Remove ${o.full_name} from your active team? Past jobs keep their record.`)) return;
    try {
      const r = await post<{ operative: OperativeRow }>('/api/portal/operatives', { id: o.id, archive: archived }, 'PATCH');
      setTeam((t) => t.map((x) => (x.id === o.id ? r.operative : x)));
    } catch (e2) {
      alert((e2 as Error).message);
    }
  }

  const active = team.filter((o) => !o.archived_at);
  const archived = team.filter((o) => o.archived_at);

  return (
    <div className="pt-card">
      <h2>Your team</h2>
      <p className="pt-muted">
        Everyone you might send to a Heliaxis site. Each person needs photo ID and their qualifications uploaded (Documents
        tab) before they can be put on a job.
      </p>

      {active.length > 0 && (
        <ul className="pt-team">
          {active.map((o) => (
            <li key={o.id}>
              <div>
                <strong>{o.full_name}</strong>
                <span className="pt-docmeta">{[o.role, o.phone].filter(Boolean).join(' · ')}</span>
                {ntpOf(o.id).map((x, i) => (
                  <span key={i} className={`pt-chip ${x.live ? 'is-ok' : 'is-warn'}`} style={{ alignSelf: 'flex-start', marginLeft: 0, marginTop: '0.25rem' }}>
                    Heliaxis NTP: {x.techs}
                    {x.suffix}
                  </span>
                ))}
              </div>
              <ReadyChip c={operativeCompliance(o.id, docs)} />
              <button type="button" className="pt-x" onClick={() => archive(o, true)} aria-label={`Remove ${o.full_name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="pt-upload" onSubmit={add}>
        <h3 className="pt-h3">Add someone</h3>
        <div className="pt-grid">
          <Field label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Role / trade" hint="e.g. Electrician, Roofer, Labourer">
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Field label="Mobile" hint="Optional">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </Field>
        </div>
        {err && <p className="pt-msg is-err">{err}</p>}
        <div className="pt-row">
          <button className="pt-btn" disabled={busy || name.trim().length < 2}>{busy ? 'Adding…' : 'Add to team'}</button>
        </div>
      </form>

      {archived.length > 0 && (
        <p className="pt-hint" style={{ marginTop: '1rem' }}>
          <button type="button" className="pt-inline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} {archived.length} former team member{archived.length > 1 ? 's' : ''}
          </button>
        </p>
      )}
      {showArchived && (
        <ul className="pt-team is-archived">
          {archived.map((o) => (
            <li key={o.id}>
              <div><strong>{o.full_name}</strong></div>
              <button type="button" className="pt-btn-ghost" onClick={() => archive(o, false)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- jobs

function JobsStep({
  jobs,
  team,
  docs,
  onChanged,
}: {
  jobs: AssignmentRow[];
  team: OperativeRow[];
  docs: PortalDoc[];
  onChanged: () => void;
}) {
  if (!jobs.length)
    return (
      <div className="pt-card">
        <h2>Jobs</h2>
        <p className="pt-muted">
          When Heliaxis books you onto a job you&apos;ll get an email, and it will appear here for you to choose who&apos;s going.
        </p>
      </div>
    );
  return (
    <div className="pt-card">
      <h2>Jobs</h2>
      <p className="pt-muted">
        Choose who you&apos;re sending to each job. Their qualifications and cards, plus your insurance, are then added to
        the job&apos;s RAMS automatically.
      </p>
      <div className="pt-cats">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} team={team} docs={docs} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function JobCard({
  job,
  team,
  docs,
  onChanged,
}: {
  job: AssignmentRow;
  team: OperativeRow[];
  docs: PortalDoc[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(job.status === 'awaiting_crew');
  const [crew, setCrew] = useState<string[]>(job.crew);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosenNames = team.filter((o) => job.crew.includes(o.id)).map((o) => o.full_name);

  async function send(body: unknown) {
    setBusy(true);
    setErr('');
    try {
      await post(`/api/portal/assignments/${job.id}`, body);
      setEditing(false);
      setDeclining(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusClass = job.status === 'awaiting_crew' ? 'is-warn' : job.status === 'crew_confirmed' ? 'is-ok' : 'is-bad';

  return (
    <section className={`pt-cat${job.status === 'awaiting_crew' ? ' is-needed' : ''}`}>
      <header className="pt-cat-head">
        <div>
          <h3>{job.rams_project_name}</h3>
          <p className="pt-hint">
            {[job.rams_project_ref, job.start_date && `Starts ${fmt(job.start_date)}`, job.site_address].filter(Boolean).join(' · ')}
          </p>
          {job.scope && <p className="pt-hint">Scope: {job.scope}</p>}
        </div>
        <span className={`pt-chip ${statusClass}`}>{ASSIGNMENT_LABEL[job.status]}</span>
      </header>

      {job.status === 'declined' && <p className="pt-hint">You declined: {job.decline_reason}</p>}

      {job.status === 'crew_confirmed' && !editing && (
        <div className="pt-row" style={{ marginTop: '0.6rem' }}>
          <span>
            Crew: <strong>{chosenNames.join(', ') || '—'}</strong>
          </span>
          <button type="button" className="pt-btn-ghost" onClick={() => setEditing(true)}>Change crew</button>
        </div>
      )}

      {editing && !declining && (
        <div className="pt-upload">
          {team.length === 0 ? (
            <p className="pt-msg is-err">Add your team first (Your team tab).</p>
          ) : (
            <ul className="pt-crew">
              {team.map((o) => (
                <li key={o.id}>
                  <label className="pt-check">
                    <input
                      type="checkbox"
                      checked={crew.includes(o.id)}
                      onChange={(e) => setCrew((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))}
                    />
                    <span>
                      {o.full_name}
                      {o.role && <span className="pt-docmeta"> · {o.role}</span>}
                    </span>
                  </label>
                  <ReadyChip c={operativeCompliance(o.id, docs)} />
                </li>
              ))}
            </ul>
          )}
          {crew.some((id) => !operativeCompliance(id, docs).ready) && (
            <p className="pt-msg is-err">
              Someone you&apos;ve chosen is missing documents — upload them on the Documents tab so they appear on the RAMS.
            </p>
          )}
          {err && <p className="pt-msg is-err">{err}</p>}
          <div className="pt-row">
            <button
              className="pt-btn"
              disabled={busy || !crew.length}
              onClick={() => send({ action: 'confirm', operativeIds: crew })}
            >
              {busy ? 'Saving…' : job.status === 'crew_confirmed' ? 'Save crew' : 'Confirm crew'}
            </button>
            {job.status === 'awaiting_crew' && (
              <button type="button" className="pt-btn-ghost" onClick={() => setDeclining(true)}>
                Can&apos;t do this job
              </button>
            )}
            {job.status === 'crew_confirmed' && (
              <button
                type="button"
                className="pt-btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setCrew(job.crew);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {declining && (
        <div className="pt-upload">
          <Field label="Why can't you do it?" wide>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {err && <p className="pt-msg is-err">{err}</p>}
          <div className="pt-row">
            <button className="pt-btn" disabled={busy || !reason.trim()} onClick={() => send({ action: 'decline', reason })}>
              Decline job
            </button>
            <button type="button" className="pt-btn-ghost" onClick={() => setDeclining(false)}>Back</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- NTP

export type PortalNtp = {
  id: string;
  ref: string;
  status: NtpStatus;
  ntpName: string;
  operativeId: string | null;
  /** Sent to the NTP personally — they sign from their own link, not the firm. */
  signsByLink: boolean;
  technologies: string[];
  validFrom: string | null;
  expiresOn: string | null;
  hash: string;
};

function NtpStep({ ntps, views, onChanged }: { ntps: PortalNtp[]; views: Record<string, ReactNode>; onChanged: () => void }) {
  return (
    <div className="pt-card">
      <h2>NTP agreements</h2>
      <p className="pt-muted">
        Appointments of your named person as Heliaxis&apos;s Nominated Technical Person (NTP) for MCS technologies. Each runs
        for 12 months and is renewed every year.
      </p>
      <div className="pt-cats">
        {ntps.map((n) => (
          <NtpCard key={n.id} ntp={n} view={views[n.id]} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function NtpCard({ ntp, view, onChanged }: { ntp: PortalNtp; view?: ReactNode; onChanged: () => void }) {
  const [name, setName] = useState(ntp.ntpName);
  const [title, setTitle] = useState('Nominated Technical Person');
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const techs = ntp.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label || k).join(', ');
  const cls = ntp.status === 'active' ? 'is-ok' : ntp.status === 'awaiting_signature' ? 'is-warn' : ntp.status === 'expired' ? 'is-bad' : '';

  async function sign() {
    setBusy(true);
    setErr('');
    try {
      await post(`/api/portal/ntp/${ntp.id}/sign`, { name, title, signature: sig, agree, hash: ntp.hash });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`pt-cat${ntp.status === 'awaiting_signature' ? ' is-needed' : ''}`}>
      <header className="pt-cat-head">
        <div>
          <h3>{ntp.ntpName} — {techs}</h3>
          <p className="pt-hint">
            {ntp.ref}
            {ntp.validFrom && ` · ${fmt(ntp.validFrom)} to ${fmt(ntp.expiresOn)}`}
          </p>
        </div>
        <span className={`pt-chip ${cls}`}>{NTP_STATUS_LABEL[ntp.status]}</span>
      </header>

      {ntp.status === 'awaiting_signature' && ntp.signsByLink ? (
        <p className="pt-hint" style={{ marginTop: '0.5rem' }}>
          Sent to {ntp.ntpName} to sign from the personal link we emailed them. Nothing for you to do.
        </p>
      ) : ntp.status === 'awaiting_signature' ? (
        <>
          <div className="pt-doc">{view}</div>
          <div className="pt-sign">
            <h3>Sign as the NTP, for yourself and your business</h3>
            <div className="pt-grid">
              <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            </div>
            <SignaturePad onChange={setSig} />
            <label className="pt-check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I have read this NTP agreement, I am the person named as NTP, I am authorised to sign for the Subcontractor,
                and I agree that my electronic signature is legally binding.
              </span>
            </label>
            {err && <p className="pt-msg is-err">{err}</p>}
            <button className="pt-btn" type="button" disabled={busy || !agree || !sig || name.trim().length < 2} onClick={sign}>
              {busy ? 'Signing…' : 'Sign NTP agreement'}
            </button>
          </div>
        </>
      ) : (
        <p className="pt-hint" style={{ marginTop: '0.5rem' }}>
          <a className="pt-link" href={`/portal/app/ntp/${ntp.id}`} target="_blank" rel="noreferrer">View / print ↗</a>
        </p>
      )}
    </section>
  );
}
