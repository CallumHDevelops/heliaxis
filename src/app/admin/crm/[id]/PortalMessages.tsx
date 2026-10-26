'use client';

import { useCallback, useEffect, useState } from 'react';

type Msg = { id: string; direction: 'in' | 'out'; body: string; created_at: string; by: string | null; read: boolean };

/**
 * What the customer and we have said to each other in their portal. Their messages come in here (and the team
 * is notified); a reply goes into their portal, with an email to say it is there. All of it is on their record.
 */
export function PortalMessages({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(
    () =>
      fetch(`/api/crm/projects/${projectId}/portal-messages`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setMessages(d.messages || []))
        .catch(() => setMessages([])),
    [projectId]
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  async function send() {
    setBusy(true);
    setErr('');
    setNote('');
    const r = await fetch(`/api/crm/projects/${projectId}/portal-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not sent');
    setText('');
    setNote(d.emailed ? `Sent. We emailed ${d.emailed} to say there is a reply.` : 'Sent in their portal. (No email went, so tell them on WhatsApp.)');
    await load();
  }
  if (messages === null) return null;
  const unread = messages.filter((m) => m.direction === 'in' && !m.read).length;
  return (
    <section className="crmh-card crmr-slot" aria-label="Portal messages">
      <div className="crmh-card__b">
        <b>
          Portal messages{unread ? ` · ${unread} new` : ''}
        </b>
        {messages.length === 0 ? (
          <p className="crm-muted crm-small">When the customer raises a query from their portal, it appears here. You can also write to them in their portal.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0, display: 'grid', gap: 6 }}>
            {messages.map((m) => (
              <li key={m.id} style={{ justifySelf: m.direction === 'out' ? 'end' : 'start', maxWidth: '92%', padding: '6px 10px', borderRadius: 8, background: m.direction === 'out' ? 'rgb(var(--accent-rgb) / 0.2)' : 'rgb(var(--fg-rgb) / 0.07)' }}>
                <small className="crm-muted">
                  {m.direction === 'out' ? m.by || 'Heliaxis' : 'Customer'} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </small>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
              </li>
            ))}
          </ul>
        )}
        <textarea className="crm-input" rows={2} placeholder="Reply in their portal" value={text} onChange={(e) => setText(e.target.value)} />
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        {note && <p className="crm-small">{note}</p>}
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy || !text.trim()} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </section>
  );
}
