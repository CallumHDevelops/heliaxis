'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { windowLeft, windowOpen } from '@/lib/whatsapp/shared';
import '../../whatsapp.css';

type Msg = {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  body: string | null;
  status: string;
  error: string | null;
  by: string | null;
  created_at: string;
};
type Queued = {
  id: string;
  rule: string | null;
  body: string | null;
  template_name: string | null;
  send_after: string;
  status: 'pending' | 'sending' | 'failed';
  last_error: string | null;
};
type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  source: string;
  wa_id: string | null;
  whatsapp_opt_in: boolean;
  wa_last_inbound_at: string | null;
  wa_unread: number;
  wa_auto_off: boolean;
};
type Template = { name: string; language: string; category: string; body: string; params: number };

const TICKS: Record<string, string> = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!' };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function countdown(iso: string, now: number) {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  return s === 0 ? 'any moment' : `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ChatThread({ id }: { id: string }) {
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const [configured, setConfigured] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [tpl, setTpl] = useState<{ name: string; lang: string; params: string[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/whatsapp/conversations/${id}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load this chat');
      setEnquiry(d.enquiry);
      setMessages(d.messages);
      setOutbox(d.outbox);
      setConfigured(d.configured);
      setDefaultTemplate(d.defaultTemplate);
      setError('');
      // Blue ticks + clear the badge while the chat is on screen.
      if (d.enquiry.wa_unread > 0 && document.visibilityState === 'visible') {
        fetch(`/api/whatsapp/conversations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this chat');
    }
  }, [id]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 5_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages.length]);

  const open = windowOpen(enquiry?.wa_last_inbound_at, now);
  const left = windowLeft(enquiry?.wa_last_inbound_at, now);

  useEffect(() => {
    if (!enquiry || open || templates) return;
    fetch('/api/whatsapp/templates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTemplates(d.items || []))
      .catch(() => setTemplates([]));
  }, [enquiry, open, templates]);

  useEffect(() => {
    if (tpl || !templates?.length || !enquiry) return;
    const t = templates.find((x) => x.name === defaultTemplate) || templates[0];
    const first = enquiry.name.split(/\s+/)[0] || '';
    setTpl({ name: t.name, lang: t.language, params: Array.from({ length: t.params }, (_, i) => (i === 0 ? first : '')) });
  }, [templates, tpl, enquiry, defaultTemplate]);

  async function post(body: unknown) {
    setSending(true);
    setError('');
    try {
      const r = await fetch(`/api/whatsapp/conversations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Not sent');
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not sent');
      return false;
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    if (await post({ text: t })) setText('');
  }

  async function outboxAction(qid: string, action: 'cancel' | 'send-now' | 'edit', body?: string) {
    setError('');
    const r = await fetch(`/api/whatsapp/outbox/${qid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || 'That didn’t work');
    if (action === 'edit' && r.ok) setEditing(null);
    await load();
  }

  async function toggleAuto() {
    if (!enquiry) return;
    const autoOff = !enquiry.wa_auto_off;
    setEnquiry({ ...enquiry, wa_auto_off: autoOff });
    await fetch(`/api/whatsapp/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoOff }),
    });
    await load();
  }

  if (!enquiry) {
    return (
      <div className="wa-page">
        <Link href="/admin/enquiries/inbox" className="wa-back">← Inbox</Link>
        <p className={error ? 'wa-banner wa-banner--err' : 'wa-muted'}>{error || 'Loading…'}</p>
      </div>
    );
  }

  const selected = templates?.find((t) => t.name === tpl?.name && t.language === tpl?.lang);
  let lastDay = '';

  return (
    <div className="wa-page wa-chat">
      <div className="wa-chat-head">
        <Link href="/admin/enquiries/inbox" className="wa-back" aria-label="Back to inbox">←</Link>
        <span className="wa-avatar">{enquiry.name.slice(0, 1).toUpperCase()}</span>
        <div className="wa-chat-who">
          <b>{enquiry.name}</b>
          <span>
            {enquiry.wa_id ? `+${enquiry.wa_id}` : enquiry.phone || 'No number'} · {open ? left : 'window closed'}
          </span>
        </div>
        <button type="button" className={`wa-auto${enquiry.wa_auto_off ? ' off' : ''}`} onClick={toggleAuto}>
          {enquiry.wa_auto_off ? 'Smart replies off' : 'Smart replies on'}
        </button>
      </div>

      {!configured && <p className="wa-banner">WhatsApp isn’t connected yet — sending is disabled until the Meta keys are added.</p>}
      {!enquiry.whatsapp_opt_in && messages.length === 0 && (
        <p className="wa-banner">
          This lead hasn’t opted in to WhatsApp. Only message them if they’ve agreed to it (e.g. on the phone).
        </p>
      )}

      <div className="wa-thread">
        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <div className="wa-day">{day}</div>}
              <div className={`wa-bubble ${m.direction}${m.kind === 'template' ? ' tpl' : ''}`}>
                {m.by && <span className="wa-by">{m.by}</span>}
                <span className="wa-text">{m.body}</span>
                <span className="wa-meta">
                  {clock(m.created_at)}
                  {m.direction === 'out' && <span className={`wa-tick ${m.status}`}>{TICKS[m.status] || ''}</span>}
                </span>
                {m.error && <span className="wa-err">{m.error}</span>}
              </div>
            </div>
          );
        })}

        {outbox.map((o) => (
          <div key={o.id} className={`wa-queued ${o.status}`}>
            <div className="wa-queued-head">
              {o.status === 'failed'
                ? `⚠ ${o.rule || 'Message'} failed: ${o.last_error || ''}`
                : o.status === 'sending'
                  ? `Sending ${o.rule ? `“${o.rule}”` : 'message'}…`
                  : `⏱ ${o.rule ? `Smart reply “${o.rule}”` : `Intro template “${o.template_name}”`} sends ${countdown(o.send_after, now)}`}
            </div>
            {editing?.id === o.id ? (
              <>
                <textarea
                  className="wa-input"
                  rows={4}
                  value={editing.body}
                  onChange={(e) => setEditing({ id: o.id, body: e.target.value })}
                />
                <div className="wa-queued-actions">
                  <button type="button" onClick={() => outboxAction(o.id, 'edit', editing.body)}>Save</button>
                  <button type="button" className="ghost" onClick={() => setEditing(null)}>Back</button>
                </div>
              </>
            ) : (
              <>
                <p className="wa-queued-body">{o.template_name ? `Template, {{1}} = ${o.body}` : o.body}</p>
                {o.status !== 'sending' && (
                  <div className="wa-queued-actions">
                    <button type="button" onClick={() => outboxAction(o.id, 'send-now')}>
                      {o.status === 'failed' ? 'Retry' : 'Send now'}
                    </button>
                    {o.status === 'pending' && !o.template_name && (
                      <button type="button" className="ghost" onClick={() => setEditing({ id: o.id, body: o.body || '' })}>
                        Edit
                      </button>
                    )}
                    <button type="button" className="ghost" onClick={() => outboxAction(o.id, 'cancel')}>
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="wa-banner wa-banner--err">{error}</p>}

      {open ? (
        <div className="wa-compose">
          <textarea
            className="wa-input"
            rows={2}
            placeholder="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!configured || sending}
          />
          <button type="button" className="wa-send" onClick={send} disabled={!configured || sending || !text.trim()}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      ) : (
        <div className="wa-compose wa-compose--tpl">
          <p className="wa-muted">
            {messages.some((m) => m.direction === 'in')
              ? 'It’s been over 24 hours since they last messaged, so WhatsApp only allows an approved template. Free chat reopens as soon as they reply.'
              : 'Start the conversation with an approved template. Once they reply you can chat freely for 24 hours.'}
          </p>
          {templates === null ? (
            <p className="wa-muted">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="wa-muted">No approved templates yet — create one in WhatsApp Manager (see WHATSAPP_SETUP.md).</p>
          ) : (
            tpl && (
              <>
                <select
                  className="wa-input"
                  value={`${tpl.name}|${tpl.lang}`}
                  onChange={(e) => {
                    const [name, lang] = e.target.value.split('|');
                    const t = templates.find((x) => x.name === name && x.language === lang);
                    const first = enquiry.name.split(/\s+/)[0] || '';
                    setTpl({ name, lang, params: Array.from({ length: t?.params ?? 0 }, (_, i) => (i === 0 ? first : '')) });
                  }}
                >
                  {templates.map((t) => (
                    <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                      {t.name} ({t.language}{t.category ? ` · ${t.category.toLowerCase()}` : ''})
                    </option>
                  ))}
                </select>
                {selected?.body && <p className="wa-tpl-preview">{selected.body}</p>}
                {tpl.params.map((p, i) => (
                  <input
                    key={i}
                    className="wa-input"
                    placeholder={`{{${i + 1}}}`}
                    value={p}
                    onChange={(e) => setTpl({ ...tpl, params: tpl.params.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                ))}
                <button
                  type="button"
                  className="wa-send"
                  disabled={!configured || sending || tpl.params.some((p) => !p.trim())}
                  onClick={() => post({ template: tpl.name, lang: tpl.lang, params: tpl.params })}
                >
                  {sending ? 'Sending…' : 'Send template'}
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
