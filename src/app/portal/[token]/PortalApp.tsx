'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import {
  ALLOWED_MIME,
  compliance,
  DOC_CATEGORIES,
  expiryState,
  MAX_FILE_BYTES,
  type DocCategory,
} from '@/lib/subcontractors/documents';
import { missingDetails, type DocumentRow, type SubDetails, type SubStatus } from '@/lib/subcontractors/types';

type PortalDoc = Omit<DocumentRow, 'storage_path'>;

type Props = {
  token: string;
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
  hash: string;
  agreementView: ReactNode;
};

type Step = 'details' | 'agreement' | 'documents';

async function post<T = Record<string, unknown>>(url: string, body: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error || 'Something went wrong — please try again.');
  return data;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function PortalApp({ token, sub, agreement, documents, hash, agreementView }: Props) {
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
  const [step, setStep] = useState<Step>(!savedComplete ? 'details' : !signed ? 'agreement' : 'documents');
  const [docs, setDocs] = useState<PortalDoc[]>(documents);

  const comp = useMemo(() => compliance(details, docs as DocumentRow[]), [details, docs]);

  const steps: { key: Step; label: string; done: boolean }[] = [
    { key: 'details', label: 'Your details', done: savedComplete },
    { key: 'agreement', label: 'Sign agreement', done: signed },
    { key: 'documents', label: 'Documents', done: !!sub.docsSubmittedAt && comp.ok },
  ];

  return (
    <div className="pt-wrap">
      <section className="pt-hero">
        <p className="pt-kicker">{sub.ref}</p>
        <h1>{sub.companyName}</h1>
        <StatusBanner status={sub.status} agreement={agreement} comp={comp} />
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
          token={token}
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
          token={token}
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
      {step === 'documents' && (
        <DocumentsStep
          token={token}
          details={details}
          docs={docs}
          setDocs={setDocs}
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
}: {
  status: SubStatus;
  agreement: Props['agreement'];
  comp: ReturnType<typeof compliance>;
}) {
  if (status === 'suspended')
    return <p className="pt-banner is-bad">Your account is suspended. Please contact Heliaxis.</p>;
  if (agreement?.hlxSignedAt)
    return (
      <p className={`pt-banner ${comp.ok && !comp.expiring.length ? 'is-ok' : 'is-warn'}`}>
        Agreement live since {fmt(agreement.hlxSignedAt)}.{' '}
        {comp.expired.length
          ? `${comp.expired.length} document(s) have expired — please upload renewals.`
          : comp.expiring.length
            ? `${comp.expiring.length} document(s) expire within 30 days — please upload renewals.`
            : comp.missing.length
              ? `Still needed: ${comp.missing.join(', ')}.`
              : 'Your documents are up to date.'}
      </p>
    );
  if (agreement)
    return (
      <p className="pt-banner is-info">
        You signed on {fmt(agreement.subSignedAt)}. Heliaxis will countersign once your documents have been checked.
      </p>
    );
  return <p className="pt-banner is-info">Three short steps: confirm your details, sign the agreement, upload your documents.</p>;
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
  token,
  details: d,
  setDetails,
  locked,
  onSaved,
}: {
  token: string;
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
      const r = await post<{ complete: boolean; missing: string[] }>('/api/portal/details', { token, details: d });
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
        <Field label="Operatives who will attend site" hint="One name per line — we need photo ID and qualifications for each" wide>
          <textarea rows={3} {...text('operatives')} />
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
  token,
  hash,
  agreement,
  detailsComplete,
  defaultName,
  defaultTitle,
  view,
  goDetails,
  onSigned,
}: {
  token: string;
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
      await post('/api/portal/sign', { token, name, title, signature: sig, agree, hash });
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
        <a className="pt-link" href={`/portal/${token}/agreement`} target="_blank" rel="noreferrer">
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
  token,
  details,
  docs,
  setDocs,
  submittedAt,
  onSubmitted,
}: {
  token: string;
  details: SubDetails;
  docs: PortalDoc[];
  setDocs: (fn: (d: PortalDoc[]) => PortalDoc[]) => void;
  submittedAt: string | null;
  onSubmitted: () => void;
}) {
  const comp = compliance(details, docs as DocumentRow[]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const operatives = (details.operatives || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await post('/api/portal/submit', { token });
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
      await post('/api/portal/documents', { token, id }, 'DELETE');
      setDocs((list) => list.filter((d) => d.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="pt-card">
      <h2>Documents</h2>
      <p className="pt-muted">
        PDFs or clear photos, up to 25 MB each. Come back to this page whenever something renews — the agreement asks you
        to send renewals at least 30 days before expiry (Clause 3A.2).
      </p>

      <div className="pt-cats">
        {DOC_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            cat={cat}
            required={cat.required(details)}
            docs={docs.filter((d) => d.category === cat.key)}
            token={token}
            operatives={operatives}
            onAdded={(doc) => setDocs((list) => [doc, ...list])}
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

function CategoryCard({
  cat,
  required,
  docs,
  token,
  operatives,
  onAdded,
  onRemove,
}: {
  cat: DocCategory;
  required: boolean;
  docs: PortalDoc[];
  token: string;
  operatives: string[];
  onAdded: (d: PortalDoc) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [operative, setOperative] = useState(operatives[0] || '');
  const [label, setLabel] = useState('');
  const [reference, setReference] = useState('');
  const [cover, setCover] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const has = docs.some((d) => d.status !== 'rejected');

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setErr('Choose a file.');
    // Some browsers (notably Windows) report HEIC photos with an empty type.
    const mime = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : '');
    if (!ALLOWED_MIME.includes(mime)) return setErr('Please upload a PDF or a photo (JPG, PNG, WebP, HEIC).');
    if (file.size > MAX_FILE_BYTES) return setErr('Files must be under 25 MB.');
    setBusy(true);
    setErr('');
    try {
      const u = await post<{ path: string; uploadToken: string; bucket: string }>('/api/portal/upload-url', {
        token,
        category: cat.key,
        fileName: file.name,
        size: file.size,
        mime,
      });
      const { error } = await createClient().storage.from(u.bucket).uploadToSignedUrl(u.path, u.uploadToken, file, {
        contentType: mime,
      });
      if (error) throw new Error('Upload failed — please check your connection and try again.');
      const r = await post<{ document: PortalDoc }>('/api/portal/documents', {
        token,
        path: u.path,
        fileName: file.name,
        mime,
        size: file.size,
        category: cat.key,
        label,
        operative,
        reference,
        cover,
        expiresOn,
      });
      onAdded(r.document);
      setFile(null);
      setLabel('');
      setReference('');
      setCover('');
      setExpiresOn('');
      setOpen(false);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`pt-cat${required && !has ? ' is-needed' : ''}`}>
      <header className="pt-cat-head">
        <div>
          <h3>
            {cat.label} {required ? <span className="pt-req">Required</span> : <span className="pt-opt">If applicable</span>}
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
              <a href={`/api/portal/documents/${d.id}?t=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer">
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

      {open && (
        <form className="pt-upload" onSubmit={upload}>
          <div className="pt-grid">
            <Field label="File" wide>
              <input
                type="file"
                accept={ALLOWED_MIME.join(',')}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </Field>
            {cat.operative && (
              <Field label="Operative">
                <input list={`ops-${cat.key}`} value={operative} onChange={(e) => setOperative(e.target.value)} />
                <datalist id={`ops-${cat.key}`}>
                  {operatives.map((o) => <option key={o} value={o} />)}
                </datalist>
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
          <div className="pt-row">
            <button className="pt-btn" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</button>
            <button type="button" className="pt-btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
