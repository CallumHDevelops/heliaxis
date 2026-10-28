'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '../CrmUi';

type Info = {
  appointment: { whenText: string; who: string | null } | null;
  recipients: { key: string; name: string; role: string | null; kind: 'customer' | 'contact'; hasEmail: boolean; hasMobile: boolean }[];
  channels: { email: boolean; whatsapp: boolean; sms: boolean };
};

/** "Send appointment": choose who (the customer and anyone else on the job) and how (email, WhatsApp, text), and send it now. */
export function SendAppointment({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="crmr-edit" onClick={() => setOpen(true)}>
        📲 Send appointment
      </button>
      {open && (
        <Sheet title="Send the appointment" onClose={() => setOpen(false)} wide>
          <SendSheet projectId={projectId} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

function SendSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [who, setWho] = useState<string[]>(['customer']);
  const [how, setHow] = useState({ email: true, whatsapp: false, sms: false });
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let gone = false;
    fetch(`/api/crm/projects/${projectId}/send-appointment`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Info) => !gone && setInfo(d))
      .catch(() => !gone && setErr('Couldn’t load. Try again.'));
    return () => {
      gone = true;
    };
  }, [projectId]);

  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${projectId}/send-appointment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients: who, channels: how }) });
    const d = (await r.json().catch(() => ({}))) as { lines?: string[]; error?: string };
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not sent. Try again.');
    setLines(d.lines ?? []);
  }

  if (err && !info) return <p className="crm-banner crm-banner--err">{err}</p>;
  if (!info) return <p className="crm-muted">Loading…</p>;
  if (!info.appointment) return <p className="crm-muted">There’s no appointment booked on this job yet. Book one in Surveys → Find a time, or add it when you create the opportunity.</p>;
  if (lines) {
    return (
      <div>
        <h3>Done</h3>
        <ul>
          {lines.map((l) => (
            <li key={l} className={/NOT sent|no email|no UK mobile|only goes/.test(l) ? 'crm-error' : ''}>
              {l}
            </li>
          ))}
        </ul>
        <button type="button" className="crm-btn crm-btn--solar" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }
  const toggle = (key: string) => setWho((w) => (w.includes(key) ? w.filter((k) => k !== key) : [...w, key]));
  const ways: { key: 'email' | 'whatsapp' | 'sms'; label: string; ok: boolean; why: string }[] = [
    { key: 'email', label: 'Email', ok: info.channels.email, why: 'Microsoft 365 isn’t connected' },
    { key: 'whatsapp', label: 'WhatsApp (customer only)', ok: info.channels.whatsapp, why: 'WhatsApp isn’t connected' },
    { key: 'sms', label: 'Text message', ok: info.channels.sms, why: 'not set up yet' },
  ];
  return (
    <div>
      <p>
        <b>{info.appointment.whenText}</b>
        {info.appointment.who ? ` with ${info.appointment.who}` : ''}. Each message has the check-the-pin link.
      </p>
      <fieldset className="nps-tell">
        <legend className="crm-label">Send to</legend>
        <div className="crm-checks">
          {info.recipients.map((r) => (
            <label key={r.key} className={who.includes(r.key) ? 'on' : ''}>
              <input type="checkbox" checked={who.includes(r.key)} onChange={() => toggle(r.key)} />
              {r.name}
              <small> ({[r.role, r.hasEmail ? 'email' : '', r.hasMobile ? 'mobile' : ''].filter(Boolean).join(', ') || 'no contact details'})</small>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="nps-tell">
        <legend className="crm-label">How</legend>
        <div className="crm-checks">
          {ways.map((w) => (
            <label key={w.key} className={how[w.key] && w.ok ? 'on' : ''}>
              <input type="checkbox" checked={how[w.key] && w.ok} disabled={!w.ok} onChange={(e) => setHow({ ...how, [w.key]: e.target.checked })} />
              {w.label}
              {!w.ok && <small> ({w.why})</small>}
            </label>
          ))}
        </div>
      </fieldset>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !who.length || !(how.email || how.whatsapp || how.sms)} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send now'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
