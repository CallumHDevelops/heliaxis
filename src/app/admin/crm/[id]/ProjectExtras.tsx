'use client';

/**
 * CRM opportunity extras: documents, the customer portal card, DNO + deposit, saved replies,
 * the document picker (WhatsApp / email) and the Microsoft 365 email composer.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fillText } from '@/lib/crm/settings-shared';
import type { TrackerStep } from '@/lib/crm/tracker';
import './extras.css';

export type CrmDoc = {
  id: string;
  category: string;
  name: string;
  mime: string | null;
  size: number | null;
  visible: boolean;
  needs_signature: boolean;
  created_at: string;
  /** crm-v3.sql: ticked as signed on paper or with another e-sign service. */
  signed_outside_at?: string | null;
  signed_outside_note?: string | null;
  /** site-commissioning.sql: generated documents keep every version; replaced ones are archived. */
  version?: number | null;
  generated_key?: string | null;
  source?: string | null;
  archived_at?: string | null;
};
type LibDoc = { id: string; name: string; description: string | null };
type Snippet = { id: string; title: string; body: string };

export const DOC_LABEL: Record<string, string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  dno: 'DNO',
  mcs: 'MCS certificate',
  warranty: 'Warranty',
  handover: 'Handover pack',
  design: 'Design',
  contract: 'Contract',
  receipt: 'Receipt',
  other: 'Other',
  commissioning: 'Commissioning',
  certificate: 'Certificate',
  po: 'Purchase order',
};
/** Kinds site-commissioning.sql adds: offered only once it's been run (the database refuses them before). */
const SITE_KINDS = ['commissioning', 'certificate', 'po'];

/** Quotes and contracts can be signed by the customer (in the portal, or ticked as signed outside it). */
const SIGNABLE = ['quote', 'contract'];

const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

async function uploadFile(url: string, file: File, extra: Record<string, unknown>) {
  const prep = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prepare', name: file.name, mime: file.type, size: file.size }),
  });
  const p = await prep.json().catch(() => ({}));
  if (!prep.ok) throw new Error(p.error || 'Upload failed');
  const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
  if (up.error) throw new Error(up.error.message);
  const save = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', path: p.path, name: file.name.replace(/\.[a-z0-9]+$/i, ''), mime: file.type, size: file.size, ...extra }),
  });
  const s = await save.json().catch(() => ({}));
  if (!save.ok) throw new Error(s.error || 'Upload failed');
}

/* ── The customer link's state (GET /api/crm/projects/{id}/portal) ─────────── */

type QuoteDoc = {
  id: string;
  name: string;
  category: string;
  needs_signature: boolean;
  signed_outside_at: string | null;
  signed_outside_by: string | null;
  signed_outside_note: string | null;
};
type PortalState = {
  url: string | null;
  mode: 'quote' | 'full' | null;
  stage: string;
  messages: { whatsappText: string; emailSubject: string; emailText: string } | null;
  accepted: { at: string; name: string; documentId: string | null; startEarly: boolean | null; hash: string | null } | null;
  quoteDocs: QuoteDoc[];
  customer: { first: string; email: string | null };
  emailConnected: boolean;
  crmV3: boolean;
};

/** Documents changed here (upload, signing marks, send for signing): the other cards reload. */
const DOCS_CHANGED = 'hx:documents-changed';
const docsChanged = () => window.dispatchEvent(new CustomEvent(DOCS_CHANGED));

const fetchPortalState = (id: string): Promise<PortalState | null> =>
  fetch(`/api/crm/projects/${id}/portal`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

function usePortalState(id: string, refreshKey: string) {
  const [state, setState] = useState<PortalState | null>(null);
  const load = useCallback(async () => {
    const d = await fetchPortalState(id);
    if (d) setState(d);
  }, [id]);
  useEffect(() => {
    let live = true;
    fetchPortalState(id).then((d) => {
      if (live && d) setState(d);
    });
    return () => {
      live = false;
    };
  }, [id, refreshKey]);
  useEffect(() => {
    const on = () => void load();
    window.addEventListener(DOCS_CHANGED, on);
    return () => window.removeEventListener(DOCS_CHANGED, on);
  }, [load]);
  return [state, load] as const;
}

/*
 * "+ Add" elsewhere on the record page (runtime contract): window.dispatchEvent(new CustomEvent(
 * 'hx:add-document', { detail: { category } })) opens the upload with that type set. The page may
 * switch to the Docs tab in the same tap, before this tab exists, so the last request is kept for a
 * few seconds and picked up when the tab mounts.
 */
const ADD_DOCUMENT = 'hx:add-document';
let pendingAdd: { category: string; at: number } | null = null;
const cleanCategory = (c: unknown) => (typeof c === 'string' && c in DOC_LABEL ? c : 'other');
if (typeof window !== 'undefined') {
  window.addEventListener(ADD_DOCUMENT, (e) => {
    pendingAdd = { category: cleanCategory((e as CustomEvent<{ category?: unknown }>).detail?.category), at: Date.now() };
  });
}
function takePendingAdd() {
  const p = pendingAdd;
  pendingAdd = null;
  return p && Date.now() - p.at < 5000 ? p.category : null;
}

/* ── Documents tab ─────────────────────────────────────────────────────────── */

export function DocumentsTab({ id, docs, onChanged, siteDocs = false }: { id: string; docs: CrmDoc[]; onChanged: () => Promise<void>; siteDocs?: boolean }) {
  const [cat, setCat] = useState('quote');
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [flash, setFlash] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const archived = docs.filter((d) => d.archived_at);
  const shown = showArchived ? docs : docs.filter((d) => !d.archived_at);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Reload the link state when the documents change (who signed, which one is the signed quote).
  const docsKey = docs.map((d) => `${d.id}:${d.needs_signature}:${d.signed_outside_at ?? ''}`).join(',');
  const [portal] = usePortalState(id, docsKey);
  const signedQuoteId = portal?.accepted?.documentId ?? null;
  const signedBy = new Map((portal?.quoteDocs ?? []).map((q) => [q.id, q]));

  const openUpload = useCallback((category: string) => {
    setCat(category);
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.current?.click();
  }, []);
  useEffect(() => {
    // A request made just before this tab appeared.
    const t = setTimeout(() => {
      const c = takePendingAdd();
      if (c) openUpload(c);
    }, 0);
    const on = (e: Event) => {
      pendingAdd = null;
      openUpload(cleanCategory((e as CustomEvent<{ category?: unknown }>).detail?.category));
    };
    window.addEventListener(ADD_DOCUMENT, on);
    return () => {
      clearTimeout(t);
      window.removeEventListener(ADD_DOCUMENT, on);
    };
  }, [openUpload]);

  async function refresh() {
    await onChanged();
    docsChanged();
  }
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr('');
    try {
      // Uploading never marks a document for signing: that's Send quote for signing (or the "Needs signing" chip),
      // so a new upload can't replace the quote the customer has been sent.
      for (const f of Array.from(files)) await uploadFile(`/api/crm/projects/${id}/documents`, f, { category: cat, visible, needs_signature: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    await refresh();
  }
  async function patch(docId: string, body: Record<string, unknown>) {
    setErr('');
    const r = await fetch(`/api/crm/documents/${docId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setErr(d.error || 'Not saved');
    await refresh();
    return r.ok;
  }
  async function remove(d: CrmDoc) {
    const msg = d.signed_outside_at ? `“${d.name}” is marked as signed. Delete it anyway?` : `Delete “${d.name}”?`;
    if (!window.confirm(msg)) return;
    setErr('');
    const r = await fetch(`/api/crm/documents/${d.id}`, { method: 'DELETE' });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'Not deleted');
    await refresh();
  }
  async function markSigned(d: CrmDoc) {
    if (await patch(d.id, { signed_outside: true, note })) {
      setMarking(null);
      setNote('');
    }
  }
  async function unmarkSigned(d: CrmDoc) {
    if (!window.confirm(`Untick “${d.name}” as signed? Only do this if it was ticked by mistake.`)) return;
    await patch(d.id, { signed_outside: false });
  }
  async function whatsapp(d: CrmDoc) {
    setErr('');
    setSent('');
    const r = await fetch(`/api/crm/projects/${id}/send-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'project', id: d.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || 'Not sent');
    else {
      setSent(`“${d.name}” sent on WhatsApp`);
      await onChanged();
    }
  }

  return (
    <div className="crm-docs">
      <div ref={box} className={`crm-doc-upload${flash ? ' qx-flash' : ''}`}>
        <select className="crm-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Document type">
          {Object.entries(DOC_LABEL)
            .filter(([k]) => siteDocs || !SITE_KINDS.includes(k))
            .map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
        </select>
        <label className="crm-check" style={{ marginTop: 0 }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show in their portal
        </label>
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : '⬆ Upload'}
        </button>
        <input ref={input} type="file" hidden multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => onFiles(e.target.files)} />
      </div>
      {cat === 'quote' && (
        <p className="crm-muted crm-small">
          To get a quote signed, use <b>Send quote for signing</b> on the customer portal card: they read and sign it on their phone.
        </p>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {sent && <p className="crm-banner">{sent}</p>}
      {archived.length > 0 && (
        <button type="button" className={`crm-chipbtn${showArchived ? ' on' : ''}`} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? `Hide archived (${archived.length})` : `Archived (${archived.length})`}
        </button>
      )}
      {shown.length === 0 ? (
        <p className="crm-muted crm-emptystate">
          No documents yet. Upload quotes, invoices, DNO letters and certificates. Ones marked visible appear in the customer’s portal once the job is
          Won.
        </p>
      ) : (
        <ul className="crm-doclist">
          {shown.map((d) => {
            const signable = SIGNABLE.includes(d.category);
            const isSignedQuote = d.id === signedQuoteId;
            const outside = signedBy.get(d.id);
            const outsideAt = d.signed_outside_at ?? outside?.signed_outside_at ?? null;
            return (
              <li key={d.id}>
                <a className="crm-doc-main" href={`/api/crm/documents/${d.id}`} target="_blank" rel="noreferrer">
                  <b>{d.name}</b>
                  <small>
                    {DOC_LABEL[d.category] || 'Document'} · {short(d.created_at)}
                    {d.generated_key || (d.version ?? 1) > 1 ? ` · v${d.version ?? 1}` : ''}
                    {d.archived_at ? ` · archived ${short(d.archived_at)}` : ''}
                  </small>
                </a>
                {isSignedQuote && portal?.accepted && (
                  <p className="qx-signed">
                    ✍ Signed in the portal by {portal.accepted.name}, {short(portal.accepted.at)}. It’s the evidence of the contract, so it can’t be
                    deleted or changed.
                  </p>
                )}
                {!isSignedQuote && outsideAt && (
                  <p className="qx-signed">
                    ✓ Signed outside the portal ({[short(outsideAt), outside?.signed_outside_by ? `ticked by ${outside.signed_outside_by}` : null].filter(Boolean).join(', ')})
                    {(outside?.signed_outside_note || d.signed_outside_note) && <small> · {outside?.signed_outside_note || d.signed_outside_note}</small>}
                  </p>
                )}
                <div className="crm-doc-actions">
                  <button type="button" className={`crm-chipbtn${d.visible ? ' on' : ''}`} onClick={() => patch(d.id, { visible: !d.visible })}>
                    {d.visible ? '👁 In portal' : 'Private'}
                  </button>
                  {signable && !isSignedQuote && (
                    <button type="button" className={`crm-chipbtn${d.needs_signature ? ' on' : ''}`} onClick={() => patch(d.id, { needs_signature: !d.needs_signature })}>
                      {d.needs_signature ? '✍ Needs signing' : 'No signing'}
                    </button>
                  )}
                  {signable && !isSignedQuote && portal?.crmV3 && (
                    <button
                      type="button"
                      className={`crm-chipbtn${outsideAt ? ' on' : ''}`}
                      aria-pressed={!!outsideAt}
                      onClick={() => (outsideAt ? unmarkSigned(d) : setMarking(marking === d.id ? null : d.id))}
                    >
                      {outsideAt ? '✓ Signed' : 'Mark as signed'}
                    </button>
                  )}
                  <button type="button" className="crm-chipbtn" onClick={() => whatsapp(d)}>
                    💬 Send
                  </button>
                  {!isSignedQuote && (
                    <button type="button" className="crm-chipbtn" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>
                      ✕
                    </button>
                  )}
                </div>
                {marking === d.id && (
                  <div className="qx-markform">
                    <p className="crm-small">
                      <b>Signed on paper or with another e-sign service?</b> Tick it here so the job shows it’s signed.
                    </p>
                    <input
                      className="crm-input"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note, e.g. Signed on paper at the survey"
                      aria-label="Note"
                      maxLength={300}
                    />
                    <div className="crm-actions" style={{ marginTop: 0 }}>
                      <button type="button" className="crm-btn crm-btn--solar" onClick={() => markSigned(d)}>
                        Mark as signed
                      </button>
                      <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setMarking(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Customer portal card ──────────────────────────────────────────────────── */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy the link', text);
    return false;
  }
}

/*
 * The record page's own "Send quote for signing" (the header button and the + sheet, runtime contract):
 * window.dispatchEvent(new CustomEvent('hx:send-quote', { detail: { id } })) opens this card's quote picker.
 */
export const SEND_QUOTE = 'hx:send-quote';

/**
 * The customer's private link. Before it exists (a sales stage): Send quote for signing. At Quote
 * sent: the quote-only page and how to send it. From Won: their full portal. Loads its own state, so
 * the props stay as they were (`open` and `portal` are only used until it has loaded).
 */
export function PortalCard({
  id,
  portal,
  open,
  tracker,
  onSendWhatsApp,
}: {
  id: string;
  portal: string | null;
  /** The job has started (Won onwards). */
  open: boolean;
  tracker: TrackerStep[];
  onSendWhatsApp: (text: string) => void;
}) {
  // Reload when the stage moves (the tracker changes with it).
  const [state, reload] = usePortalState(id, `${open}|${tracker.map((t) => `${t.key}:${t.state}`).join(',')}`);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const url = state?.url ?? made ?? portal;
  const mode = state ? state.mode : open ? 'full' : null;
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ id?: string }>).detail?.id !== id) return;
      setErr('');
      setPicking(true);
    };
    window.addEventListener(SEND_QUOTE, on);
    return () => window.removeEventListener(SEND_QUOTE, on);
  }, [id]);

  async function ensure() {
    if (url) return url;
    const r = await fetch(`/api/crm/projects/${id}/portal`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (d.url) setMade(d.url);
    else setErr(d.error || 'No link yet.');
    return (d.url as string) || null;
  }
  async function copy() {
    const u = await ensure();
    if (!u) return;
    if (await copyText(u)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  async function resetLink() {
    if (!window.confirm('Make a new link? The current link will stop working, so send them the new one.')) return;
    const r = await fetch(`/api/crm/projects/${id}/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (d.url) {
      setMade(d.url);
      await reload();
    } else window.alert(d.error || 'Couldn’t reset the link.');
  }
  async function sendForSigning() {
    const docId = pick || state?.quoteDocs.find((q) => q.needs_signature)?.id || state?.quoteDocs[0]?.id;
    if (!docId) return;
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${id}/send-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not sent');
    setMade(d.url);
    setPicking(false);
    setNote('Ready ✓ Now send them the link.');
    docsChanged();
    window.dispatchEvent(new CustomEvent('hx:project-changed', { detail: { id } }));
    await reload();
  }
  async function emailIt() {
    const m = state?.messages;
    const to = state?.customer.email;
    if (!m || !to) return;
    if (!state?.emailConnected) {
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(m.emailSubject)}&body=${encodeURIComponent(m.emailText)}`;
      return;
    }
    if (!window.confirm(`Email the link to ${to}?`)) return;
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: m.emailSubject, text: m.emailText }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(d.error || 'Email not sent');
    else setNote(`Emailed to ${to} ✓`);
  }

  const current = tracker.find((t) => t.state === 'current');
  const quoteDocs = state?.quoteDocs ?? [];
  const toSign = quoteDocs.find((q) => q.needs_signature);
  const chosen = pick || toSign?.id || quoteDocs[0]?.id || '';

  const picker = (
    <div className="qx-pick">
      {quoteDocs.length === 0 ? (
        <p className="crm-small qx-dim">Upload the quote under Docs first (type: Quote or Contract), then send it from here.</p>
      ) : (
        <>
          <div className="crm-docpick" role="radiogroup" aria-label="Which quote">
            {quoteDocs.map((q) => (
              <label key={q.id} className={chosen === q.id ? 'on' : ''}>
                <input type="radio" name={`sendq-${id}`} checked={chosen === q.id} onChange={() => setPick(q.id)} />
                <span>📄</span> {q.name}
                <small className="qx-dim"> · {DOC_LABEL[q.category] || q.category}</small>
              </label>
            ))}
          </div>
          <div className="crm-actions" style={{ marginTop: 0 }}>
            <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !chosen} onClick={sendForSigning}>
              {busy ? 'Getting it ready…' : 'Send for signing'}
            </button>
            {mode === 'quote' && (
              <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const shareButtons = (whatsappText: string | null) => (
    <div className="crm-actions" style={{ marginTop: 0 }}>
      <button
        type="button"
        className="crm-btn crm-btn--wa"
        onClick={async () => {
          const u = await ensure();
          if (!u) return;
          onSendWhatsApp(
            whatsappText ??
              (mode === 'quote'
                ? `Here's your Heliaxis quote page: ${u}`
                : `Here's your Heliaxis project page. You can see your progress, documents and key dates any time: ${u}`)
          );
        }}
      >
        {whatsappText ? 'WhatsApp it' : 'Send on WhatsApp'}
      </button>
      <button type="button" className="crm-btn crm-btn--ghost" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
      {mode === 'quote' && state?.messages && (
        <button
          type="button"
          className="crm-btn crm-btn--ghost"
          disabled={busy || !state.customer.email}
          title={state.customer.email ? undefined : 'No email address for this customer: add one under Details'}
          onClick={emailIt}
        >
          Email it
        </button>
      )}
      {url && (
        <a className="crm-btn crm-btn--ghost" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
      )}
    </div>
  );

  const resetButton = url && (
    <button type="button" className="crm-link" style={{ marginTop: 6 }} onClick={resetLink}>
      Reset link (if it’s been shared by mistake)
    </button>
  );

  if (mode === 'quote') {
    return (
      <div className="crm-portal">
        <div className="crm-portal-head">
          <b>Customer portal</b>
          <span className="crm-muted crm-small">✍ Waiting for their signature</span>
        </div>
        <p className="crm-muted crm-small">
          {toSign ? (
            <>
              Their link opens <b className="qx-light">{toSign.name}</b> to read and sign, with the 14-day cancellation wording. Signing moves the job
              to Won and the same link becomes their full portal.
            </>
          ) : (
            'Their link shows their quote once one is marked “Needs signing” in Docs.'
          )}
        </p>
        {note && <p className="qx-note">{note}</p>}
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        {picking ? (
          picker
        ) : (
          <>
            {shareButtons(state?.messages?.whatsappText ?? null)}
            <button type="button" className="crm-link" style={{ marginTop: 6 }} onClick={() => setPicking(true)}>
              Send a different quote
            </button>
          </>
        )}
        {resetButton}
      </div>
    );
  }

  if (mode !== 'full') {
    const lost = (state?.stage ?? '') === 'lost';
    return (
      <div className="crm-portal">
        <div className="crm-portal-head">
          <b>Customer portal</b>
          <span className="crm-muted crm-small">🔒 Not yet</span>
        </div>
        {!state ? (
          <p className="crm-muted crm-small">Loading…</p>
        ) : lost ? (
          <p className="crm-muted crm-small">There’s no customer link for a Lost job.</p>
        ) : (
          <>
            <p className="crm-muted crm-small">
              <b className="qx-light">Send quote for signing</b>: they get a private link to read the quote and sign it on their phone, with the 14-day
              cancellation wording. Signing moves the job to Won and opens their full portal (progress, documents, photos and deposit).
            </p>
            {err && <p className="crm-banner crm-banner--err">{err}</p>}
            {picking || quoteDocs.length === 0 ? (
              picker
            ) : (
              <div className="crm-actions" style={{ marginTop: 0 }}>
                <button type="button" className="crm-btn crm-btn--solar" onClick={() => setPicking(true)}>
                  Send quote for signing
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="crm-portal">
      <div className="crm-portal-head">
        <b>Customer portal</b>
        {current && <span className="crm-muted crm-small">Now: {current.label}</span>}
      </div>
      <ol className="crm-minitrack" aria-label="Their progress">
        {tracker.map((t) => (
          <li key={t.key} className={t.state} title={t.label} />
        ))}
      </ol>
      <p className="crm-muted crm-small">Their progress, dates, documents, photos and deposit, on one private link.</p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {shareButtons(null)}
      {resetButton}
    </div>
  );
}

/* ── DNO, deposit and acceptance ───────────────────────────────────────────── */

type DnoProject = {
  dno_status: string | null;
  dno_ref: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  /** crm-v3.sql */
  accepted_start_early?: boolean | null;
  accepted_hash?: string | null;
};

export function DnoDeposit({ project, stripe, onSave }: { project: DnoProject; stripe: boolean; onSave: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [ref, setRef] = useState(project.dno_ref || '');
  const [dep, setDep] = useState(project.deposit_amount == null ? '' : String(project.deposit_amount));
  return (
    <div className="crm-dno">
      <h3 className="crm-h3">Grid connection (DNO)</h3>
      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor="dno-status">
            Status
          </label>
          <select id="dno-status" className="crm-input" value={project.dno_status || 'not_started'} onChange={(e) => onSave({ dno_status: e.target.value })}>
            <option value="not_started">Not started</option>
            <option value="submitted">Applied — waiting</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected / changes</option>
            <option value="not_required">Not needed</option>
          </select>
        </div>
        <div>
          <label className="crm-label" htmlFor="dno-ref">
            Reference
          </label>
          <input id="dno-ref" className="crm-input" value={ref} onChange={(e) => setRef(e.target.value)} onBlur={() => ref !== (project.dno_ref || '') && onSave({ dno_ref: ref })} />
        </div>
      </div>
      <p className="crm-muted crm-small">Shown on the customer’s tracker. Upload the DNO letters under Documents.</p>

      <h3 className="crm-h3">Quote & deposit</h3>
      {project.accepted_at ? (
        <p className="crm-banner">
          ✍ Accepted and signed online by <b>{project.accepted_name}</b> on {short(project.accepted_at)}.
          {project.accepted_start_early === true && ' They asked us to start within the 14 days.'}
          {project.accepted_hash && (
            <small className="qx-hash" title="A fingerprint of the exact file they signed">
              {' '}
              Fingerprint {project.accepted_hash.slice(0, 12)}
            </small>
          )}
        </p>
      ) : (
        <p className="crm-muted crm-small">
          Use <b>Send quote for signing</b> on the customer portal card. Once they sign, the job moves to Won and they can pay the deposit.
        </p>
      )}
      <label className="crm-label" htmlFor="dep">
        Deposit £
      </label>
      <div className="crm-linkrow">
        <input id="dep" className="crm-input" inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} placeholder="e.g. 1500" />
        <button type="button" className="crm-btn crm-btn--ghost" disabled={dep === (project.deposit_amount == null ? '' : String(project.deposit_amount))} onClick={() => onSave({ deposit_amount: dep })}>
          Save
        </button>
      </div>
      <p className="crm-muted crm-small">
        {project.deposit_paid_at
          ? `💷 Paid ${short(project.deposit_paid_at)}.`
          : stripe
            ? 'The customer can pay it by card from their link once they’ve signed the quote.'
            : 'Card payments aren’t connected yet (Stripe). The portal shows the amount due.'}
      </p>
    </div>
  );
}

/* ── Saved replies ─────────────────────────────────────────────────────────── */

export function SnippetPicker({ projectId, name, onPick }: { projectId: string; name: string; onPick: (text: string) => void }) {
  const [items, setItems] = useState<Snippet[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || items) return;
    fetch('/api/crm/snippets', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, [open, items]);
  async function pick(s: Snippet) {
    let link: string | null = null;
    if (s.body.includes('{portal_link}')) {
      const r = await fetch(`/api/crm/projects/${projectId}/portal`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      link = d.url || null;
      if (!link) window.alert(d.error || 'No portal link yet.');
    }
    onPick(fillText(s.body, { name, portalLink: link }));
    setOpen(false);
  }
  return (
    <div className="crm-snippets">
      <button type="button" className="crm-link" style={{ margin: 0 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide saved replies' : '⚡ Saved replies'}
      </button>
      {open && (
        <div className="crm-snippet-list">
          {items === null ? (
            <span className="crm-muted crm-small">Loading…</span>
          ) : items.length === 0 ? (
            <span className="crm-muted crm-small">
              None yet — add them in <Link href="/admin/crm/settings">CRM settings</Link>.
            </span>
          ) : (
            items.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s)}>
                <b>{s.title}</b>
                <small>{s.body.slice(0, 80)}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Documents + library picker ────────────────────────────────────────────── */

export type PickedDoc = { source: 'project' | 'library'; id: string; name: string };

export function DocPicker({
  docs,
  selected,
  onToggle,
  single,
}: {
  docs: CrmDoc[];
  selected: PickedDoc[];
  onToggle: (d: PickedDoc) => void;
  single?: boolean;
}) {
  const [lib, setLib] = useState<LibDoc[] | null>(null);
  useEffect(() => {
    fetch('/api/crm/library', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLib(d.items || []))
      .catch(() => setLib([]));
  }, []);
  const isOn = (src: string, id: string) => selected.some((s) => s.source === src && s.id === id);
  const all: PickedDoc[] = [
    ...docs.map((d) => ({ source: 'project' as const, id: d.id, name: d.name })),
    ...(lib ?? []).map((d) => ({ source: 'library' as const, id: d.id, name: d.name })),
  ];
  if (!all.length) {
    return (
      <p className="crm-muted crm-small">
        No documents yet — upload to this opportunity, or add guides to the <Link href="/admin/crm/settings">library</Link>.
      </p>
    );
  }
  return (
    <div className="crm-docpick">
      {all.map((d) => (
        <label key={`${d.source}-${d.id}`} className={isOn(d.source, d.id) ? 'on' : ''}>
          <input type={single ? 'radio' : 'checkbox'} name="docpick" checked={isOn(d.source, d.id)} onChange={() => onToggle(d)} />
          <span>{d.source === 'library' ? '📚' : '📄'}</span> {d.name}
        </label>
      ))}
    </div>
  );
}

/* ── Email (Microsoft 365, or your mail app until it's connected) ──────────── */

export function EmailComposerV2({
  id,
  customer,
  docs,
  connected,
  onSaved,
}: {
  id: string;
  customer: { name: string; email: string };
  docs: CrmDoc[];
  connected: boolean;
  onSaved: () => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(`Hi ${customer.name.split(/\s+/)[0] || ''},\n\n`);
  const [files, setFiles] = useState<PickedDoc[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!customer.email) {
    return (
      <div>
        <h2>Email</h2>
        <p className="crm-muted">No email address for this customer — add one under Details.</p>
      </div>
    );
  }
  async function send() {
    setBusy(true);
    setErr('');
    if (!connected) {
      window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await fetch(`/api/crm/projects/${id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'email', body: `To ${customer.email}${subject ? ` — ${subject}` : ''}\n\n${body.trim()}` }),
      }).catch(() => {});
      setBusy(false);
      return onSaved();
    }
    const r = await fetch(`/api/crm/projects/${id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        text: body,
        documentIds: files.filter((f) => f.source === 'project').map((f) => f.id),
        libraryIds: files.filter((f) => f.source === 'library').map((f) => f.id),
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not sent');
    await onSaved();
  }
  return (
    <div>
      <h2>Email {customer.name}</h2>
      <p className="crm-muted crm-small">
        To {customer.email} · {connected ? 'sent from the shared Heliaxis mailbox; replies appear on the timeline.' : 'opens your email app (Microsoft 365 not connected yet) and is logged here.'}
      </p>
      <SnippetPicker projectId={id} name={customer.name} onPick={(t) => setBody((b) => (b.trim().split('\n').length <= 2 ? `${b}${t}` : `${b}\n${t}`))} />
      <input className="crm-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="crm-input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      {connected && (
        <>
          <button type="button" className="crm-link" style={{ margin: '0.4rem 0 0' }} onClick={() => setShowFiles((v) => !v)}>
            📎 Attach{files.length ? ` (${files.length})` : ''}
          </button>
          {showFiles && (
            <DocPicker
              docs={docs}
              selected={files}
              onToggle={(d) =>
                setFiles((cur) => (cur.some((c) => c.source === d.source && c.id === d.id) ? cur.filter((c) => !(c.source === d.source && c.id === d.id)) : [...cur, d]))
              }
            />
          )}
        </>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !body.trim()} onClick={send}>
          {busy ? 'Sending…' : connected ? 'Send email' : 'Write in email app'}
        </button>
      </div>
    </div>
  );
}

/** Send one document (theirs or from the library) on WhatsApp. */
export function WhatsAppDocSend({ id, docs, onSent }: { id: string; docs: CrmDoc[]; onSent: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<PickedDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="crm-snippets">
      <button type="button" className="crm-link" style={{ margin: 0 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide documents' : '📎 Send a document'}
      </button>
      {open && (
        <>
          <DocPicker docs={docs} selected={pick} single onToggle={(d) => setPick([d])} />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <button
            type="button"
            className="crm-btn crm-btn--wa"
            disabled={busy || !pick.length}
            onClick={async () => {
              setBusy(true);
              setErr('');
              const r = await fetch(`/api/crm/projects/${id}/send-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: pick[0].source, id: pick[0].id }),
              });
              const d = await r.json().catch(() => ({}));
              setBusy(false);
              if (!r.ok) return setErr(d.error || 'Not sent');
              await onSent();
            }}
          >
            {busy ? 'Sending…' : 'Send document'}
          </button>
        </>
      )}
    </div>
  );
}
