'use client';

/**
 * CRM opportunity extras: documents, the customer portal card, DNO + deposit, saved replies,
 * the document picker (WhatsApp / email) and the Microsoft 365 email composer.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fillText } from '@/lib/crm/settings-shared';
import type { TrackerStep } from '@/lib/crm/tracker';

export type CrmDoc = {
  id: string;
  category: string;
  name: string;
  mime: string | null;
  size: number | null;
  visible: boolean;
  needs_signature: boolean;
  created_at: string;
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
};

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

/* ── Documents tab ─────────────────────────────────────────────────────────── */

export function DocumentsTab({ id, docs, onChanged }: { id: string; docs: CrmDoc[]; onChanged: () => Promise<void> }) {
  const [cat, setCat] = useState('quote');
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr('');
    try {
      for (const f of Array.from(files)) await uploadFile(`/api/crm/projects/${id}/documents`, f, { category: cat, visible, needs_signature: cat === 'quote' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    await onChanged();
  }
  async function patch(docId: string, body: Record<string, unknown>) {
    await fetch(`/api/crm/documents/${docId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await onChanged();
  }
  async function remove(d: CrmDoc) {
    if (!window.confirm(`Delete “${d.name}”?`)) return;
    await fetch(`/api/crm/documents/${d.id}`, { method: 'DELETE' });
    await onChanged();
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
      <div className="crm-doc-upload">
        <select className="crm-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Document type">
          {Object.entries(DOC_LABEL).map(([k, l]) => (
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
      {cat === 'quote' && <p className="crm-muted crm-small">Quotes in the portal get an “Accept & sign” button for the customer.</p>}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {sent && <p className="crm-banner">{sent}</p>}
      {docs.length === 0 ? (
        <p className="crm-muted crm-emptystate">No documents yet. Upload quotes, invoices, DNO letters and certificates — ones marked visible appear in the customer’s portal once the job starts.</p>
      ) : (
        <ul className="crm-doclist">
          {docs.map((d) => (
            <li key={d.id}>
              <a className="crm-doc-main" href={`/api/crm/documents/${d.id}`} target="_blank" rel="noreferrer">
                <b>{d.name}</b>
                <small>
                  {DOC_LABEL[d.category] || 'Document'} · {short(d.created_at)}
                </small>
              </a>
              <div className="crm-doc-actions">
                <button type="button" className={`crm-chipbtn${d.visible ? ' on' : ''}`} onClick={() => patch(d.id, { visible: !d.visible })}>
                  {d.visible ? '👁 In portal' : 'Private'}
                </button>
                {d.category === 'quote' && (
                  <button type="button" className={`crm-chipbtn${d.needs_signature ? ' on' : ''}`} onClick={() => patch(d.id, { needs_signature: !d.needs_signature })}>
                    {d.needs_signature ? '✍ Needs signing' : 'No signing'}
                  </button>
                )}
                <button type="button" className="crm-chipbtn" onClick={() => whatsapp(d)}>
                  💬 Send
                </button>
                <button type="button" className="crm-chipbtn" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Customer portal card ──────────────────────────────────────────────────── */

export function PortalCard({
  id,
  portal,
  open,
  tracker,
  onSendWhatsApp,
}: {
  id: string;
  portal: string | null;
  /** The job has started (Won onwards) — before that the customer has no portal. */
  open: boolean;
  tracker: TrackerStep[];
  onSendWhatsApp: (text: string) => void;
}) {
  const [url, setUrl] = useState(portal);
  const [copied, setCopied] = useState(false);
  async function ensure() {
    if (url) return url;
    const r = await fetch(`/api/crm/projects/${id}/portal`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (d.url) setUrl(d.url);
    return (d.url as string) || null;
  }
  const current = tracker.find((t) => t.state === 'current');
  if (!open)
    return (
      <div className="crm-portal">
        <div className="crm-portal-head">
          <b>Customer portal</b>
          <span className="crm-muted crm-small">🔒 Not yet</span>
        </div>
        <p className="crm-muted crm-small">
          Opens when the job starts. Move this opportunity to <b>Won</b> and you can send them their private link with progress, documents,
          photos and deposit.
        </p>
      </div>
    );
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
      <p className="crm-muted crm-small">Their progress, dates, documents, photos and deposit — on one private link.</p>
      <div className="crm-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="crm-btn crm-btn--wa"
          onClick={async () => {
            const u = await ensure();
            if (u) onSendWhatsApp(`Here's your Heliaxis project page — you can see your progress, documents and key dates any time: ${u}`);
          }}
        >
          Send on WhatsApp
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost"
          onClick={async () => {
            const u = await ensure();
            if (!u) return;
            try {
              await navigator.clipboard.writeText(u);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt('Copy the link', u);
            }
          }}
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        {url && (
          <a className="crm-btn crm-btn--ghost" href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </div>
      {url && (
        <button
          type="button"
          className="crm-link"
          style={{ marginTop: 6 }}
          onClick={async () => {
            if (!window.confirm('Make a new link? The current link will stop working, so send them the new one.')) return;
            const r = await fetch(`/api/crm/projects/${id}/portal`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reset: true }),
            });
            const d = await r.json().catch(() => ({}));
            if (d.url) setUrl(d.url);
            else window.alert(d.error || 'Couldn’t reset the link.');
          }}
        >
          Reset link (if it’s been shared by mistake)
        </button>
      )}
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
        </p>
      ) : (
        <p className="crm-muted crm-small">Once the job has started, quotes uploaded under Documents (type: Quote) can be accepted and signed in their portal.</p>
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
            ? 'The customer can pay it by card from their portal once the job has started.'
            : 'Card payments aren’t connected yet (Stripe) — the portal shows the amount due.'}
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
