'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import type { PortalHandover } from '@/lib/handover/portal';
import { PRINT_LABEL, PRINT_TITLE, printHref } from '@/lib/documents/print-shared';

/**
 * "Your handover pack" in the customer's portal (screens C1, C2): Download everything first once it's
 * been sent, then each document in the pack's groups with one plain line, "On its way" for what's
 * still to come, the signature cards (the completion record, and Form B on G98 jobs) when they
 * didn't sign on the electrician's phone, and what to do now.
 */

const size = (n: number | null) => (n ? (n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');
// Month names spelt here: Node and the browser disagree on "Sep" and "Sept", which breaks hydration.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'numeric', year: 'numeric' });
const day = (iso: string) => {
  const p = Object.fromEntries(ukParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
};

export function HandoverSection({ token, data }: { token: string; data: PortalHandover }) {
  return (
    <section className="pt-card pt-handover" aria-label="Your handover pack">
      <h2>Your handover pack</h2>
      <p className="pt-muted">Your certificates, warranties and guides, all in one place.</p>
      {data.pack && (
        <a className="pt-btn pt-hv-all" href={`/api/my/${token}/doc/${data.pack.id}`} target="_blank" rel="noreferrer">
          Download everything (PDF{data.pack.size ? `, ${size(data.pack.size)}` : ''})
        </a>
      )}
      {data.pack && (
        <a className="pt-hv-print pt-hv-print--all" href={printHref(`/api/my/${token}/doc/${data.pack.id}`)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
          {PRINT_LABEL}: everything, without the colour, to save ink
        </a>
      )}
      {data.signs.map((s) => (
        <SignCard key={s.kind} token={token} sign={s} />
      ))}
      {data.groups.map((g) => (
        <div key={g.title} className="pt-hv-group">
          <h3>{g.title}</h3>
          <ul className="pt-hv-items">
            {g.items.map((i) => (
              <li key={`${i.code}-${i.title}`} className={i.coming ? 'is-coming' : i.docs.length > 1 ? 'is-multi' : ''}>
                <div className="pt-hv-item">
                  <b>{i.title}</b>
                  {i.line && <small>{i.line}</small>}
                </div>
                {i.coming ? (
                  <span className="pt-hv-coming">On its way</span>
                ) : (
                  <span className="pt-hv-docs">
                    {i.docs.map((d) => (
                      <span key={d.id} className="pt-hv-doc">
                        <a href={`/api/my/${token}/doc/${d.id}`} target="_blank" rel="noreferrer" title={`${d.name} · ${day(d.at)}`}>
                          {i.docs.length > 1 ? d.name : 'View'}
                        </a>
                        {d.print && (
                          <a className="pt-hv-print" href={printHref(`/api/my/${token}/doc/${d.id}`)} target="_blank" rel="noreferrer" title={PRINT_TITLE}>
                            {PRINT_LABEL}
                          </a>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
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
function SignCard({ token, sign }: { token: string; sign: PortalHandover['signs'][number] }) {
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
          <SignaturePad onChange={setSig} height={150} />
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
