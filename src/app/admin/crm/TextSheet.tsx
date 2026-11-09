'use client';

import { useState } from 'react';
import { Sheet } from './CrmUi';
import './crm.css';

/** A UK mobile as typed ("07738 492639", "+44 7738 492639"): the only kind a text can reach. */
export const isUkMobile = (phone: string | null | undefined) => /^(\+?44|0)7\d{9}$/.test(String(phone ?? '').replace(/[\s()-]/g, ''));

const SEGMENT = 160;

/**
 * "Text": a short composer that sends an SMS to the customer (POST /api/crm/customers/:id/text), for when WhatsApp isn't agreed or isn't
 * there. The button is `className` styled (each page has its own button style); nothing shows for a number that isn't a UK mobile.
 */
export function TextButton({ enquiryId, name, phone, className = 'crm-btn crm-btn--ghost', label = 'Text', onSent }: { enquiryId: string; name: string; phone: string | null | undefined; className?: string; label?: string; onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const [text, setText] = useState(`Hi ${first}, it's Heliaxis. `);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  if (!isUkMobile(phone)) return null;
  const segments = Math.max(1, Math.ceil(text.length / SEGMENT));
  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/customers/${enquiryId}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Couldn’t send the text. Try again.');
    setSent(true);
    onSent?.();
  }
  return (
    <>
      <button type="button" className={className} onClick={() => { setSent(false); setErr(''); setOpen(true); }}>
        {label}
      </button>
      {open && (
        <Sheet title={`Text ${name || 'them'}`} onClose={() => setOpen(false)}>
          {sent ? (
            <div className="org-form">
              <p>Sent to {phone}. It’s in their chat as “Text message”.</p>
              <div className="crm-actions">
                <button type="button" className="crm-btn crm-btn--solar" onClick={() => { setOpen(false); setText(`Hi ${first}, it's Heliaxis. `); }}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="org-form">
              <p className="crm-muted crm-small">To {phone}. A text goes to their phone whether or not they use WhatsApp. Only text people who have enquired or agreed to hear from us. A text comes from the name “Heliaxis”, so they can’t reply to it: say how to reach you (call 01633 965205 or message us on WhatsApp).</p>
              <label className="qb-lab" htmlFor="txt-body">
                Message
              </label>
              <textarea id="txt-body" className="crm-input" rows={6} value={text} maxLength={600} onChange={(e) => setText(e.target.value)} autoFocus />
              <p className="crm-muted crm-small">
                {text.length} characters · {segments} text{segments === 1 ? '' : 's'} (about {4 * segments}p)
              </p>
              {err && <p className="crm-banner crm-banner--err">{err}</p>}
              <div className="crm-actions">
                <button type="button" className="crm-btn crm-btn--solar" disabled={busy || text.trim().length < 2} onClick={() => void send()}>
                  {busy ? 'Sending…' : 'Send text'}
                </button>
                <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
