'use client';

import { useEffect, useState } from 'react';
import { CHASE_CHOICES, chaseWords } from '@/lib/booking/survey-link-text';
import { Sheet } from '../CrmUi';

type Can = { ok: boolean; why: string };
type Info = { customer: string; first: string; email: string | null; phone: string | null; can: { whatsapp: Can; sms: Can; email: Can }; preview: { whatsapp: string; sms: string; email: string } };

/**
 * Send the customer their survey booking link by WhatsApp, text and/or email in one go, with their name in it. Ready for the back of a
 * phone call: tick how, optionally set a reminder to check they've booked, Send. A text is only ticked for you when WhatsApp can't go.
 */
export function SurveyLinkSheet({ projectId, onClose, onSent }: { projectId: string; onClose: () => void; onSent: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState('');
  const [on, setOn] = useState({ whatsapp: false, sms: false, email: false });
  const [chase, setChase] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/crm/booking/send?project_id=${projectId}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) return setErr(d.error || 'Couldn’t get this customer’s details.');
        const i = d as Info;
        setInfo(i);
        setOn({ whatsapp: i.can.whatsapp.ok, email: i.can.email.ok, sms: i.can.sms.ok && !i.can.whatsapp.ok });
      })
      .catch(() => live && setErr('Couldn’t get this customer’s details.'));
    return () => {
      live = false;
    };
  }, [projectId]);

  async function send() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/booking/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, ...on, chase_days: chase }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r) return setErr('That didn’t work. Try again.');
    if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    if (d.ok) onSent();
    else if (d.error && !(Array.isArray(d.lines) && d.lines.length)) setErr(d.error);
  }

  const rows: { key: 'whatsapp' | 'sms' | 'email'; label: string; hint: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', hint: 'Free, and it lands in their chat' },
    { key: 'sms', label: 'Text', hint: 'About 4p. For when WhatsApp isn’t an option' },
    { key: 'email', label: 'Email', hint: info?.email || '' },
  ];
  const anyOn = on.whatsapp || on.sms || on.email;

  return (
    <Sheet title={info ? `Send ${info.first} their survey link` : 'Send the survey link'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        {!info && !err && <p className="crm-muted">Getting their details…</p>}
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        {info && !lines && (
          <>
            <p style={{ margin: 0 }}>
              Hi {info.first}, thanks for your time on the phone just now. Please use the link below to book a survey for your home. Their own booking page opens, and it takes them a minute.
            </p>
            <div className="crm-checks" role="group" aria-label="How to send it">
              {rows.map((r) => {
                const can = info.can[r.key];
                return (
                  <label key={r.key} className={on[r.key] ? 'on' : ''} title={can.ok ? '' : can.why} style={can.ok ? undefined : { opacity: 0.55 }}>
                    <input type="checkbox" checked={on[r.key]} disabled={!can.ok || busy} onChange={(e) => setOn((o) => ({ ...o, [r.key]: e.target.checked }))} />
                    {r.label}
                    <small style={{ display: 'block' }}>{can.ok ? r.hint : can.why}</small>
                  </label>
                );
              })}
            </div>
            <div>
              <label className="qb-lab" htmlFor="sl-chase">
                Remind me to check they’ve booked
              </label>
              <select id="sl-chase" className="crm-input" value={chase} disabled={busy} onChange={(e) => setChase(Number(e.target.value))}>
                {CHASE_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {chaseWords(d)}
                  </option>
                ))}
              </select>
            </div>
            <details>
              <summary className="crm-link">See what they get</summary>
              <p className="crm-small" style={{ whiteSpace: 'pre-wrap' }}>
                <b>WhatsApp:</b> {info.preview.whatsapp}
              </p>
              <p className="crm-small" style={{ whiteSpace: 'pre-wrap' }}>
                <b>Text:</b> {info.preview.sms}
              </p>
              <p className="crm-small" style={{ whiteSpace: 'pre-wrap' }}>
                <b>Email:</b> {info.preview.email}
              </p>
            </details>
            <div className="crm-actions">
              <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !anyOn} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Send survey link'}
              </button>
            </div>
          </>
        )}
        {lines && (
          <>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {lines.map((l) => (
                <li key={l} className={/NOT sent/.test(l) ? 'crm-muted' : ''}>
                  {l}
                </li>
              ))}
            </ul>
            <div className="crm-actions">
              <button type="button" className="crm-btn crm-btn--solar" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
