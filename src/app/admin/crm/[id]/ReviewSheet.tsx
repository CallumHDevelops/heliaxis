'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sheet } from '../CrmUi';
import { isUkMobile } from '../TextSheet';

type Result = { link: string; text: string; sent: boolean };

/**
 * Ask a customer for a review. The same personal link goes to everyone, and the page it opens gives everyone the same choices (Google, Trustpilot,
 * or tell us privately), so nobody is selected by how happy they are. Email and text are sent from here; WhatsApp opens the chat with the message
 * ready; or copy the link to send it yourself.
 */
export function ReviewSheet({ customer, projectId, onClose, onWhatsApp }: { customer: { id: string; name: string; email: string | null; phone: string | null }; projectId: string; onClose: () => void; onWhatsApp: (text: string) => void }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [setup, setSetup] = useState(false);

  async function ask(channel: 'email' | 'sms' | 'whatsapp' | 'link'): Promise<Result | null> {
    setBusy(channel);
    setErr('');
    setMsg('');
    const r = await fetch('/api/crm/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: customer.id, project_id: projectId, channel }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (!r || !r.ok) {
      setSetup(!!d.setup);
      setErr(d.error || 'That didn’t work. Try again.');
      return null;
    }
    return d as Result;
  }
  async function email() {
    const d = await ask('email');
    if (d) setMsg(`Sent by email to ${customer.email}.`);
  }
  async function text() {
    const d = await ask('sms');
    if (d) setMsg('Sent by text.');
  }
  async function whatsapp() {
    const d = await ask('whatsapp');
    if (d) onWhatsApp(d.text);
  }
  async function copy() {
    const d = await ask('link');
    if (!d) return;
    try {
      await navigator.clipboard.writeText(d.text);
      setMsg('The message and link are copied. Paste it wherever you like.');
    } catch {
      window.prompt('Copy this', d.text);
    }
  }
  const mobile = isUkMobile(customer.phone);
  return (
    <Sheet title={`Ask ${customer.name.split(' ')[0] || 'them'} for a review`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={{ margin: 0 }}>They get a personal link. The page it opens offers everyone the same choices: review on Google, review on Trustpilot, or tell us privately.</p>
        <small className="crm-muted">Please ask every customer, not only the ones you expect to be happy. Don’t offer anything in return for a review on Google or Trustpilot.</small>
        <div className="crm-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || !customer.email} title={customer.email ? '' : 'No email on file'} onClick={() => void email()}>
            {busy === 'email' ? 'Sending…' : 'Email'}
          </button>
          <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || !mobile} title={mobile ? '' : 'Needs a UK mobile number'} onClick={() => void text()}>
            {busy === 'sms' ? 'Sending…' : 'Text'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => void whatsapp()}>
            {busy === 'whatsapp' ? 'Opening…' : 'WhatsApp'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" disabled={!!busy} onClick={() => void copy()}>
            {busy === 'link' ? 'Making…' : 'Copy the message'}
          </button>
        </div>
        {msg && <p className="crm-banner">{msg}</p>}
        {err && (
          <p className="crm-banner crm-banner--err">
            {err}{' '}
            {setup && (
              <Link href="/admin/reviews" className="crm-link">
                Open Reviews
              </Link>
            )}
          </p>
        )}
      </div>
    </Sheet>
  );
}
