'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import type { PortalHandover } from '@/lib/handover/portal';
import { PRINT_LABEL, PRINT_TITLE, printHref } from '@/lib/documents/print-shared';
import { ComingRow, DocGroup, DocRow, Icon } from './parts';

/**
 * "Your handover pack" in the customer's portal (screens C1, C2): Download everything first once it's
 * been sent, then each document in the pack's groups with one plain line, "On its way" for what's
 * still to come, the signature cards (the completion record, and Form B on G98 jobs) when they
 * didn't sign on the electrician's phone, and what to do now.
 */

const size = (n: number | null) => (n ? (n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');

/** `signs`: false when the signature cards are shown on the Home tab instead (as the next thing to do). */
export function HandoverSection({ token, data, signs = true }: { token: string; data: PortalHandover; signs?: boolean }) {
  const href = data.pack ? `/api/my/${token}/doc/${data.pack.id}` : '';
  return (
    <section className="pt-card pt-handover" aria-label="Your handover pack" id="pt-handover">
      <div className="pt-card-head">
        <span className="pt-badge ok">{data.sent ? 'Ready' : 'Being prepared'}</span>
        <h2>Your handover pack</h2>
        <p className="pt-muted">Your certificates, warranties and guides. Keep them safe: you’ll need them if you sell your home.</p>
      </div>
      {data.pack && (
        <div className="pt-all">
          <a className="pt-btn" href={href} target="_blank" rel="noreferrer">
            <Icon name="view" size={18} /> View the whole pack
          </a>
          <a className="pt-btn ghost" href={`${href}?download=1`}>
            <Icon name="download" size={18} /> Download (PDF{data.pack.size ? `, ${size(data.pack.size)}` : ''})
          </a>
          <a className="pt-doc-print pt-all-print" href={printHref(href)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
            {PRINT_LABEL}: the whole pack without the colour, to save ink
          </a>
        </div>
      )}
      {signs && data.signs.map((s) => <SignCard key={s.kind} token={token} sign={s} />)}
      {data.groups.map((g) => (
        <DocGroup key={g.title} title={g.title}>
          {g.items.flatMap((i) => [
            ...(i.coming
              ? [<ComingRow key={`${i.code}-${i.title}`} title={i.title} line={i.line} />]
              : i.docs.map((d, k) => <DocRow key={d.id} token={token} doc={d} label={i.docs.length > 1 ? d.name : i.title} line={k === 0 ? i.line : undefined} />)),
            ...(i.note
              ? [
                  <p key={`${i.code}-note`} className="pt-hv-note">
                    {i.note}
                  </p>,
                ]
              : []),
          ])}
        </DocGroup>
      ))}
      <div className="pt-hv-now">
        <h3>What to do now</h3>
        <ul>
          {data.next.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** C2: their own signature for one document, with what they're confirming above it. */
export function SignCard({ token, sign }: { token: string; sign: PortalHandover['signs'][number] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sig, setSig] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/my/${token}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: sign.kind, name, signature: sig, agree }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok || r?.status === 409) return window.location.reload();
    setBusy(false);
    setErr(d.error || 'Something went wrong. Please try again.');
  }
  return (
    <div className="pt-hv-sign">
      <b>{sign.title}</b>
      <p className="pt-muted">{sign.line}</p>
      {!open ? (
        <button type="button" className="pt-btn" onClick={() => setOpen(true)}>
          Sign it
        </button>
      ) : (
        <div className="pt-signform">
          <label className="pt-label" htmlFor={`pt-hv-${sign.kind}`}>
            Your full name
          </label>
          <input id={`pt-hv-${sign.kind}`} className="pt-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <label className="pt-label">Sign here</label>
          {/* A white sheet in both themes: what's drawn is kept as ink on paper. */}
          <div className="hx-light">
            <SignaturePad onChange={setSig} height={150} />
          </div>
          <label className="pt-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {sign.declaration}
          </label>
          {err && <p className="pt-err">{err}</p>}
          <div className="pt-row">
            <button type="button" className="pt-btn" disabled={busy || name.trim().length < 3 || !sig || !agree} onClick={submit}>
              {busy ? 'Saving…' : 'Sign'}
            </button>
            <button type="button" className="pt-btn ghost" onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
