'use client';

import { useRef, useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { F78_DECLARATION, type CopyField } from '@/lib/handover/inputs';
import type { HandoverView } from '@/lib/handover/server';
import { slotDef, UPLOAD_PICKS, type SlotCode } from '@/lib/handover/slots';
import { createClient } from '@/lib/supabase/client';
import { PlainSheet } from './RecordSheets';
import { copyText, send } from './record-shared';

/**
 * The Handover tab's sheets (screens D7–D11): upload straight into the customer's pack, Not needed
 * with a reason, the F78 design signature, values typed for an item, what's still to put right,
 * Copy for MID and Notify building control, Send to customer, and the final invoice with recorded
 * payments. Each posts to /api/crm/projects/{id}/handover (or the documents route) and hands the
 * tab's fresh data back.
 */

type Done = (v: HandoverView & { notes?: string[] }) => void;
const ACCEPT = '.pdf,image/*,.doc,.docx,.xls,.xlsx';
const G99_PARTS: [string, string][] = [
  ['application', 'The G99 application (A1-1 / A1-2)'],
  ['acceptance', 'The DNO’s acceptance'],
  ['installation', 'The installation document (A3-x)'],
  ['g100', 'G100 Form C (export limitation)'],
];

/** prepare → straight to storage → save, as the Docs tab uploads. Returns the save's reply. */
async function uploadInto(projectId: string, file: File, extra: Record<string, unknown>): Promise<{ read?: { mcs_cert_no: string } | null }> {
  const url = `/api/crm/projects/${projectId}/documents`;
  const p = await send<{ bucket: string; path: string; token: string }>(url, 'POST', { action: 'prepare', name: file.name, mime: file.type, size: file.size }, 'Upload failed');
  const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
  if (up.error) throw new Error(up.error.message);
  return send(url, 'POST', { action: 'save', path: p.path, name: file.name.replace(/\.[a-z0-9]+$/i, ''), mime: file.type, size: file.size, ...extra }, 'Upload failed');
}

/* ── Upload straight into the pack (D7, owner's ask [8]) ──────────────────── */

export function UploadSheet({
  projectId,
  preset,
  replace,
  tellDefault,
  customer,
  onClose,
  onDone,
}: {
  projectId: string;
  preset: SlotCode | null;
  replace?: { id: string; name: string } | null;
  tellDefault: boolean;
  customer: HandoverView['customer'];
  onClose: () => void;
  onDone: (msg: string, read?: string | null) => void;
}) {
  const [slot, setSlot] = useState<SlotCode | null>(preset);
  const [name, setName] = useState('');
  const [hold, setHold] = useState(false);
  const [part, setPart] = useState('');
  const [tell, setTell] = useState(tellDefault);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const def = slot ? slotDef(slot) : null;
  const via = [customer.mobile && 'whatsapp', customer.email && 'email'].filter(Boolean) as string[];

  async function go(files: FileList | null) {
    if (!files?.length || !slot) return;
    if (slot === 'F76' && !part) return setErr('Say which G99 paper it is first.');
    setBusy(true);
    setErr('');
    try {
      let read: string | null = null;
      for (const f of Array.from(files)) {
        const r = await uploadInto(projectId, f, {
          handover_slot: slot,
          hold,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(replace ? { replace: replace.id } : {}),
          ...(part ? { part } : {}),
          tell: tell && !hold ? via : [],
        });
        read = r.read?.mcs_cert_no ?? read;
      }
      onDone(`${def?.title ?? 'Document'}: ${replace ? 'replaced' : 'added'}${hold ? ', held until the pack goes' : ', in their portal now'}.${tell && !hold && via.length ? ' They’ll be told.' : ''}`, read);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setBusy(false);
  }

  return (
    <PlainSheet label="Add to the handover pack" onClose={onClose}>
      <h2>{replace ? `Replace ${replace.name}` : def ? `Add: ${def.title}` : 'Add a document'}</h2>
      {!preset && (
        <fieldset className="hv-picks">
          <legend className="crm-label">Which is it?</legend>
          {UPLOAD_PICKS.map((p) => (
            <label key={p.code} className={`hv-pick${slot === p.code ? ' on' : ''}`}>
              <input type="radio" name="hv-pick" checked={slot === p.code} onChange={() => setSlot(p.code)} />
              <span>{p.pick}</span>
              <small>{p.code}</small>
            </label>
          ))}
        </fieldset>
      )}
      {slot === 'CCMH' && (
        <>
          <label className="crm-label" htmlFor="hv-up-name">
            What is it?
          </label>
          <input id="hv-up-name" className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smart Export Guarantee guide" maxLength={140} />
        </>
      )}
      {slot === 'F76' && (
        <>
          <label className="crm-label" htmlFor="hv-up-part">
            Which G99 paper?
          </label>
          <select id="hv-up-part" className="crm-input" value={part} onChange={(e) => setPart(e.target.value)}>
            <option value="">Choose…</option>
            {G99_PARTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}
      {slot && (
        <>
          <div className="hv-radio" role="radiogroup" aria-label="When the customer sees it">
            <label className={!hold ? 'on' : ''}>
              <input type="radio" checked={!hold} onChange={() => setHold(false)} /> <b>Show it in their portal now</b>
            </label>
            <label className={hold ? 'on' : ''}>
              <input type="radio" checked={hold} onChange={() => setHold(true)} /> Hold it until the pack is sent
            </label>
          </div>
          {!hold && (
            <label className="crm-check hv-tell">
              <input type="checkbox" checked={tell && via.length > 0} disabled={!via.length} onChange={(e) => setTell(e.target.checked)} /> Tell {customer.first || 'the customer'} it’s there
              {via.length ? ` (${via.map((v) => (v === 'whatsapp' ? 'WhatsApp' : 'email')).join(' and ')})` : ': no mobile or email on file'}
            </label>
          )}
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="hv-upbtns">
            <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? 'Uploading…' : 'Choose the file'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--big hv-camera" disabled={busy} onClick={() => camera.current?.click()}>
              Take a photo
            </button>
          </div>
          <p className="crm-muted crm-small">PDF, photo, Word or Excel. A photo becomes a PDF page. Large files go straight to storage.</p>
          <input ref={file} type="file" hidden multiple={!replace} accept={ACCEPT} onChange={(e) => void go(e.target.files)} />
          <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => void go(e.target.files)} />
        </>
      )}
    </PlainSheet>
  );
}

/* ── Not needed, with a reason ────────────────────────────────────────────── */

export function NotNeededSheet({ projectId, slot, reasons, onClose, onDone }: { projectId: string; slot: SlotCode; reasons: string[]; onClose: () => void; onDone: Done }) {
  const [pick, setPick] = useState(reasons[0] ?? '');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const reason = pick === '__other' ? other.trim() : pick;
  return (
    <PlainSheet label="Not needed" onClose={onClose}>
      <h2>{slotDef(slot)?.title}: not needed</h2>
      <p className="crm-muted crm-small">Why? It’s recorded with your name, and you can restore it.</p>
      <div className="hv-radio" role="radiogroup">
        {reasons.map((r) => (
          <label key={r} className={pick === r ? 'on' : ''}>
            <input type="radio" checked={pick === r} onChange={() => setPick(r)} /> {r}
          </label>
        ))}
        <label className={pick === '__other' ? 'on' : ''}>
          <input type="radio" checked={pick === '__other'} onChange={() => setPick('__other')} /> Other
        </label>
      </div>
      {pick === '__other' && <input className="crm-input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Why it isn’t needed" maxLength={200} autoFocus />}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={busy || !reason}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'na', slot, reason: pick === '__other' ? `Other: ${reason}` : reason }));
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not saved');
              setBusy(false);
            }
          }}
        >
          Mark not needed
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PlainSheet>
  );
}

/* ── F78's design part, signed in the office ─────────────────────────────── */

export function SignDesignSheet({ projectId, me, onClose, onDone }: { projectId: string; me: string; onClose: () => void; onDone: Done }) {
  const [name, setName] = useState(me);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <PlainSheet label="Sign the design part" onClose={onClose}>
      <h2>F78: sign the design part</h2>
      <p className="hv-decl">{F78_DECLARATION}</p>
      <label className="crm-label" htmlFor="hv-sig-name">
        Your name
      </label>
      <input id="hv-sig-name" className="crm-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label className="crm-label">Sign here</label>
      <SignaturePad onChange={setSig} height={140} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar crm-btn--big"
          disabled={busy || !sig || name.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'sign-f78-design', name: name.trim(), signature: sig }));
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not signed');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Signing…' : 'Sign'}
        </button>
      </div>
    </PlainSheet>
  );
}

/* ── Values typed for an item (F49A as agreed, CC4's switches, F78, F47) ─── */

export function ValuesSheet({
  projectId,
  slot,
  title,
  intro,
  fields,
  onClose,
  onDone,
}: {
  projectId: string;
  slot: SlotCode;
  title: string;
  intro?: string;
  fields: { key: string; label: string; hint?: string; value: string; from?: string | null }[];
  onClose: () => void;
  onDone: Done;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <PlainSheet label={title} onClose={onClose}>
      <h2>{title}</h2>
      {intro && <p className="crm-muted crm-small">{intro}</p>}
      {fields.map((f) => (
        <div key={f.key}>
          <label className="crm-label" htmlFor={`hv-v-${f.key}`}>
            {f.label}
          </label>
          <input id={`hv-v-${f.key}`} className="crm-input" value={vals[f.key] ?? ''} placeholder={f.hint} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
          {f.from && !vals[f.key] && (
            <button type="button" className="hv-chip" onClick={() => setVals((v) => ({ ...v, [f.key]: f.from! }))}>
              From the electrician: {f.from} ✓
            </button>
          )}
        </div>
      ))}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'values', slot, values: vals }));
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not saved');
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PlainSheet>
  );
}

/* ── F16E: still to put right ─────────────────────────────────────────────── */

export function OutstandingSheet({ projectId, items, flags, onClose, onDone }: { projectId: string; items: HandoverView['forms']['F16E']; flags: HandoverView['flags']; onClose: () => void; onDone: Done }) {
  const [list, setList] = useState(items.length ? items : [{ text: '', by: null }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (i: number, p: Partial<(typeof list)[number]>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <PlainSheet label="Still to put right" onClose={onClose}>
      <h2>Still to put right</h2>
      <p className="crm-muted crm-small">Printed on the completion record (F16E) with the date it will be done by. Leave it empty if the work’s finished.</p>
      {list.map((x, i) => (
        <div key={i} className="hv-out">
          <input className="crm-input" value={x.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="What’s still to do" maxLength={300} />
          <input className="crm-input hv-out__date" type="date" value={x.by ?? ''} onChange={(e) => set(i, { by: e.target.value || null })} aria-label="Done by" />
        </div>
      ))}
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setList((l) => [...l, { text: '', by: null }])}>
        + Another
      </button>
      {flags.length > 0 && (
        <>
          <p className="crm-label">From the site (still open)</p>
          <div className="hv-chips">
            {flags.map((f, i) => (
              <button key={i} type="button" className="hv-chip" onClick={() => setList((l) => [...l.filter((x) => x.text), { text: f.text, by: null }])}>
                + {f.text}
              </button>
            ))}
          </div>
        </>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'outstanding', items: list.filter((x) => x.text.trim()) }));
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not saved');
              setBusy(false);
            }
          }}
        >
          Save
        </button>
      </div>
    </PlainSheet>
  );
}

/* ── Copy for MID / Notify building control (D11) ─────────────────────────── */

export function CopySheet({
  title,
  intro,
  fields,
  download,
  record,
  onClose,
}: {
  title: string;
  intro: string;
  fields: CopyField[];
  download?: { href: string; label: string } | null;
  /** "Notified on / reference" (building control): saves to the job's paperwork. */
  record?: { projectId: string; onSaved: () => void } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [on, setOn] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  return (
    <PlainSheet label={title} onClose={onClose}>
      <h2>{title}</h2>
      <p className="crm-muted crm-small">{intro}</p>
      <ul className="hv-copy">
        {fields.map((f) => (
          <li key={f.label}>
            <span>
              <small>{f.label}</small>
              <b>{f.value ?? 'Not on the job yet'}</b>
            </span>
            {f.value && (
              <button
                type="button"
                className="crm-btn crm-btn--ghost crm-btn--small"
                onClick={async () => {
                  await copyText(f.value!);
                  setCopied(f.label);
                }}
              >
                {copied === f.label ? 'Copied ✓' : 'Copy'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {download && (
        <a className="crm-btn crm-btn--ghost" href={download.href} target="_blank" rel="noreferrer">
          {download.label}
        </a>
      )}
      {record && (
        <>
          <p className="crm-label">Notified on, and the reference</p>
          <div className="crm-grid2">
            <input className="crm-input" type="date" value={on} onChange={(e) => setOn(e.target.value)} aria-label="Notified on" />
            <input className="crm-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference" aria-label="Reference" />
          </div>
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button
              type="button"
              className="crm-btn crm-btn--solar"
              disabled={!on || !ref.trim()}
              onClick={async () => {
                try {
                  await send(`/api/crm/projects/${record.projectId}`, 'PATCH', { paperwork: { building_regs_on: on, building_regs_ref: ref.trim() } });
                  record.onSaved();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Not saved');
                }
              }}
            >
              Save
            </button>
          </div>
        </>
      )}
    </PlainSheet>
  );
}

/* ── Send to customer (D9) ────────────────────────────────────────────────── */

export function SendSheet({
  projectId,
  view,
  isAdmin,
  actions,
  onClose,
  onDone,
}: {
  projectId: string;
  view: HandoverView;
  isAdmin: boolean;
  /** The office's own button for each item it still has to do (Upload, Sign the design part…). */
  actions: Record<string, { label: string; run: () => void }>;
  onClose: () => void;
  onDone: Done;
}) {
  const [wa, setWa] = useState(view.customer.mobile);
  const [email, setEmail] = useState(view.customer.email);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const first = view.customer.first || 'the customer';
  const blocked = !view.send.ok;
  const fromSite = view.send.blocking.filter((b) => b.from === 'site');
  const fromOffice = view.send.blocking.filter((b) => b.from === 'office');
  const go = async (override: boolean) => {
    setBusy(true);
    setErr('');
    try {
      onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'send', via: [wa && 'whatsapp', email && 'email'].filter(Boolean), override }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent');
      setBusy(false);
    }
  };
  return (
    <PlainSheet label="Send to customer" onClose={onClose}>
      <h2>Send the handover pack to {first}</h2>
      {fromSite.length > 0 && (
        <div className="hv-block">
          <b>Still to come from site:</b>
          <ul>
            {fromSite.map((b) => (
              <li key={b.code}>
                {b.title}
                {b.why ? <small> · {b.why}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {fromOffice.length > 0 && (
        <div className="hv-block">
          <b>Still needed from the office:</b>
          <ul>
            {fromOffice.map((b) => (
              <li key={b.code}>
                {b.title}
                {b.why ? <small> · {b.why}</small> : null}{' '}
                {actions[b.code] && (
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={actions[b.code].run}>
                    {actions[b.code].label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="crm-muted crm-small">Everything held goes into their portal{view.pack?.behind || !view.pack ? ', the combined PDF is built first,' : ''} and the job moves to Paperwork &amp; handover.</p>
      <div className="hv-checks">
        <label className="crm-check">
          <input type="checkbox" checked={wa} disabled={!view.customer.mobile} onChange={(e) => setWa(e.target.checked)} /> WhatsApp{view.customer.mobile ? '' : ' (no mobile on file)'}
        </label>
        <label className="crm-check">
          <input type="checkbox" checked={email} disabled={!view.customer.email} onChange={(e) => setEmail(e.target.checked)} /> Email{view.customer.email ? '' : ' (no email on file)'}
        </label>
      </div>
      <blockquote className="hv-preview">Hi {first}, your Heliaxis handover pack is ready. Your certificates, warranties and guides are all in one place here: (their portal link) Any questions, just reply here.</blockquote>
      {view.send.following.length > 0 && <p className="crm-small">On its way after: {view.send.following.map((f) => f.title).join(', ')}. They’ll show as “On its way” in the portal.</p>}
      <p className="hv-when">{view.sendsAt === 'now' ? 'Goes now.' : `Outside sending hours: the message goes at ${view.sendsAt}. The documents go into their portal now.`}</p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        {!blocked ? (
          <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => void go(false)}>
            {busy ? 'Sending…' : wa || email ? 'Send to customer' : 'Put it in their portal'}
          </button>
        ) : isAdmin ? (
          <button
            type="button"
            className="crm-btn crm-btn--ghost crm-btn--big"
            disabled={busy}
            onClick={() => window.confirm(`Send it before ${view.send.blocking.map((b) => b.code).join(', ')} ${view.send.blocking.length === 1 ? 'is' : 'are'} in? They’ll show as “On its way”.`) && void go(true)}
          >
            Send anyway (admin)
          </button>
        ) : (
          <p className="crm-small">It can go once these are in. An admin can send it sooner.</p>
        )}
      </div>
    </PlainSheet>
  );
}

/* ── The final invoice and payments (D10) ─────────────────────────────────── */

const METHOD: Record<string, string> = { card: 'Card', bank_transfer: 'Bank transfer', other: 'Other' };
const pounds = (p: number) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

export function InvoiceSheet({
  projectId,
  view,
  isAdmin,
  today,
  onUpload,
  onClose,
  onDone,
}: {
  projectId: string;
  view: HandoverView;
  isAdmin: boolean;
  today: string;
  onUpload: () => void;
  onClose: () => void;
  onDone: Done;
}) {
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(today);
  const [method, setMethod] = useState('bank_transfer');
  const [ref, setRef] = useState('');
  // Ticked on purpose: a stage or part payment recorded as final would tick "Final invoice paid".
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pence = Math.round(Number(amount.replace(/[£,\s]/g, '')) * 100);
  return (
    <PlainSheet label="Final invoice" onClose={onClose}>
      <h2>Final invoice</h2>
      {view.money && <p className="hv-money">{view.money}</p>}
      <button type="button" className="crm-btn crm-btn--solar crm-btn--big" onClick={onUpload}>
        {view.invoice.uploaded ? 'Upload another invoice' : 'Upload the final invoice'}
      </button>
      <p className="crm-muted crm-small">It goes into their portal and the pack, and you can tell them it’s there. No card payment link: they pay as the invoice says.</p>
      <h3 className="hv-h3">Record a payment</h3>
      <p className="crm-muted crm-small">Type it from the invoice or the bank. The receipt in the pack lists exactly these.</p>
      <div className="crm-grid2">
        <input className="crm-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount £" aria-label="Amount" />
        <input className="crm-input" type="date" value={on} onChange={(e) => setOn(e.target.value)} aria-label="Paid on" />
        <select className="crm-input" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="How">
          <option value="bank_transfer">Bank transfer</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        <input className="crm-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference (optional)" aria-label="Reference" maxLength={80} />
      </div>
      <label className="crm-check">
        <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> This is the final payment
      </label>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={busy || !(pence > 0) || !on}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'record-payment', amount_pence: pence, paid_on: on, method, reference: ref, kind: final ? 'final' : 'stage' }));
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Not saved');
              setBusy(false);
            }
          }}
        >
          Record payment
        </button>
      </div>
      {(view.payments.length > 0 || view.deposit.paidAt) && (
        <ul className="hv-pays">
          {view.deposit.paidAt && view.deposit.amount ? (
            <li>
              <b>{pounds(Math.round(view.deposit.amount * 100))}</b> deposit · card · {new Date(view.deposit.paidAt).toLocaleDateString('en-GB')}
            </li>
          ) : null}
          {view.payments.map((p) => (
            <li key={p.id}>
              <b>{pounds(p.amount_pence)}</b> {p.kind === 'final' ? 'final' : p.kind} · {METHOD[p.method]} · {new Date(`${p.paid_on}T12:00:00Z`).toLocaleDateString('en-GB')}
              {p.reference ? ` · ${p.reference}` : ''}
              {isAdmin && (
                <button
                  type="button"
                  className="crm-link"
                  onClick={async () => window.confirm('Remove this payment? Only if it was recorded by mistake.') && onDone(await send(`/api/crm/projects/${projectId}/handover`, 'POST', { action: 'delete-payment', payment: p.id }))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </PlainSheet>
  );
}

/* ── Upload a manual once, for every job with that model (D12, CC5's gaps) ── */

export function LibrarySheet({ model, tech, onClose, onDone }: { model: string; tech: string[]; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState('manual');
  const [models, setModels] = useState(model);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function go(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      const p = await send<{ bucket: string; path: string; token: string }>('/api/crm/library', 'POST', { action: 'prepare', name: f.name, mime: f.type, size: f.size }, 'Upload failed');
      const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, f, { contentType: f.type });
      if (up.error) throw new Error(up.error.message);
      await send('/api/crm/library', 'POST', {
        action: 'save',
        path: p.path,
        name: f.name.replace(/\.[a-z0-9]+$/i, ''),
        mime: f.type,
        size: f.size,
        kind,
        handover_slot: kind === 'procedure' ? 'CC4' : 'CC5',
        models: models.split(/\n|;/),
        technologies: tech,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
      setBusy(false);
    }
  }
  return (
    <PlainSheet label="Add to the product library" onClose={onClose}>
      <h2>Add to the product library</h2>
      <p className="crm-muted crm-small">Upload it once: every job with this model gets it in its pack.</p>
      <label className="crm-label" htmlFor="hv-lib-kind">
        What is it?
      </label>
      <select id="hv-lib-kind" className="crm-input" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="manual">User manual</option>
        <option value="datasheet">Datasheet</option>
        <option value="warranty">Manufacturer’s warranty</option>
        <option value="procedure">Start-up and shutdown procedure</option>
      </select>
      <label className="crm-label" htmlFor="hv-lib-models">
        Model (one per line if it covers several)
      </label>
      <textarea id="hv-lib-models" className="crm-input" rows={2} value={models} onChange={(e) => setModels(e.target.value)} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy || !models.trim()} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : 'Choose the file'}
        </button>
      </div>
      <input ref={input} type="file" hidden accept=".pdf,image/*" onChange={(e) => void go(e.target.files)} />
    </PlainSheet>
  );
}
