'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatRef, chatTag, NOTIFICATIONS_CHANGED } from '@/lib/notification-refs';
import { closeShownNotifications } from '@/lib/push-client';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { SERVICE_WINDOW_MS, windowLeft, windowOpen } from '@/lib/whatsapp/shared';
import { shownBody } from '@/lib/whatsapp/describe';
import { TemplateSendFields, useTemplateSend } from '@/components/admin/TemplateSend';
import '../../whatsapp.css';

type Msg = {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  body: string | null;
  status: string;
  error: string | null;
  by: string | null;
  /** 'import' = brought in from a WhatsApp Business app export. */
  via?: string | null;
  created_at: string;
};
type Queued = {
  id: string;
  kind: 'reply' | 'intro' | 'chase';
  chase_step: number;
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
  // Imported chats go back years.
  const year = d.getFullYear() !== today.getFullYear() ? ({ year: 'numeric' } as const) : {};
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...year });
}
function countdown(iso: string, now: number) {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  if (s === 0) return 'any moment';
  if (s >= 6 * 3600) {
    const d = new Date(iso);
    const day = d.toDateString() === new Date(now).toDateString() ? 'today' : dayLabel(iso).toLowerCase();
    return `${day} at ${clock(iso)}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `in ${h}h ${m}m` : `in ${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Chase if no reply: 'auto' = the default when the message asks a question. */
const CHASE_OPTIONS: [string, string][] = [
  ['auto', 'Auto'],
  ['0', 'Off'],
  ['4', '4h'],
  ['12', '12h'],
  ['24', '24h'],
  ['72', '3 days'],
];

export function ChatThread({ id }: { id: string }) {
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const [configured, setConfigured] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);
  const [chaseDefaults, setChaseDefaults] = useState({ questions: true, hours: 12 });
  const [chaseChoice, setChaseChoice] = useState('auto');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  /** The last full load's version: polls send it, and get { same: true } if nothing changed. */
  const version = useRef('');
  /** Cleared this chat's notifications since it opened (once, even with nothing unread). */
  const readOnce = useRef(false);
  /** At (or near) the bottom: new messages scroll into view. Scrolled up reading: left alone. */
  const atBottom = useRef(true);

  const load = useCallback(async (full = true) => {
    try {
      const v = !full && version.current ? `?v=${version.current}` : '';
      const r = await fetch(`/api/whatsapp/conversations/${id}${v}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load this chat');
      if (!d.same) {
        setEnquiry(d.enquiry);
        setMessages(d.messages);
        setOutbox(d.outbox);
        setConfigured(d.configured);
        setDefaultTemplate(d.defaultTemplate);
        if (d.chase) setChaseDefaults(d.chase);
        version.current = d.v || '';
      }
      setError('');
      // Blue ticks, the badge and its notifications cleared, but only while the chat is on screen.
      const unread = d.same ? d.unread : d.enquiry.wa_unread;
      if ((unread > 0 || !readOnce.current) && document.visibilityState === 'visible') {
        readOnce.current = true;
        fetch(`/api/whatsapp/conversations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        })
          .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)))
          .catch(() => {});
        void closeShownNotifications((n) => n.data?.ref === chatRef(id) || n.tag === chatTag(id));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this chat');
      return false;
    }
  }, [id]);

  // New messages and ticks show up by themselves (every 4.5s while it's on screen).
  const { refresh, busy, reload } = useLiveRefresh(load, 4_500);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const onScroll = () => {
      atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearInterval(tick);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // By the newest message, not the count: a long chat shows the latest 500, so the count stays put.
  // To the very bottom (past the compose and tab bar), the same place the scroll check measures to.
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    if (newest && atBottom.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [newest]);

  const open = windowOpen(enquiry?.wa_last_inbound_at, now);
  const left = windowLeft(enquiry?.wa_last_inbound_at, now);

  // Outside the 24h window only a template can go: pre-filled from what the CRM knows.
  const tplSend = useTemplateSend(id, !!enquiry && !open, defaultTemplate);
  const { templates, pick: tpl } = tplSend;

  async function post(body: unknown) {
    setSending(true);
    setError('');
    atBottom.current = true; // show what you've just sent
    try {
      const r = await fetch(`/api/whatsapp/conversations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Not sent');
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not sent');
      return false;
    } finally {
      setSending(false);
    }
  }

  /**
   * Hours to chase after for this message (0 = don't). Auto chases questions. A template's chaser is
   * itself a paid template (the window never opened), so templates only chase if you pick a time.
   */
  function chaseHoursFor(message: string, isTemplate = false) {
    if (chaseChoice !== 'auto') return Number(chaseChoice);
    return chaseDefaults.questions && !isTemplate && message.includes('?') ? chaseDefaults.hours : 0;
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    if (await post({ text: t, chaseHours: chaseHoursFor(t) })) {
      setText('');
      setChaseChoice('auto');
    }
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
    await reload();
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
    await reload();
  }

  if (!enquiry) {
    return (
      <div className="wa-page">
        <Link href="/admin/enquiries/inbox" className="wa-back">← Inbox</Link>
        <p className={error ? 'wa-banner wa-banner--err' : 'wa-muted'}>{error || 'Loading…'}</p>
      </div>
    );
  }

  const windowCloses = enquiry.wa_last_inbound_at ? new Date(enquiry.wa_last_inbound_at).getTime() + SERVICE_WINDOW_MS : 0;
  const chasePicker = (message: string, isTemplate = false) => {
    const h = chaseHoursFor(message, isTemplate);
    return (
      <div className="wa-chase-pick">
        <span>Chase if no reply:</span>
        <select value={chaseChoice} onChange={(e) => setChaseChoice(e.target.value)}>
          {CHASE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {v === 'auto' ? `${label} (${h ? `${h}h` : 'off'})` : label}
            </option>
          ))}
        </select>
      </div>
    );
  };
  let lastDay = '';
  let lastImported = false;

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
        <button type="button" className="wa-refresh" onClick={refresh} disabled={busy} aria-label="Refresh" title="Refresh">
          ↻
        </button>
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
          // Imported history: one quiet label where it starts, and no ticks (we never saw them).
          const imported = m.via === 'import';
          const showImported = imported && !lastImported;
          lastImported = imported;
          return (
            <div key={m.id}>
              {showDay && <div className="wa-day">{day}</div>}
              {showImported && <div className="wa-day wa-imported">Imported from the WhatsApp Business app</div>}
              <div className={`wa-bubble ${m.direction}${m.kind === 'template' ? ' tpl' : ''}`}>
                {m.by && <span className="wa-by">{m.by}</span>}
                <span className="wa-text">{shownBody(m.body)}</span>
                <span className="wa-meta">
                  {clock(m.created_at)}
                  {m.direction === 'out' && !imported && <span className={`wa-tick ${m.status}`}>{TICKS[m.status] || ''}</span>}
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
                ? `⚠ ${o.kind === 'chase' ? 'Chaser' : o.rule || 'Message'} failed: ${o.last_error || ''}`
                : o.status === 'sending'
                  ? `Sending ${o.rule ? `“${o.rule}”` : o.kind === 'chase' ? 'chaser' : 'message'}…`
                  : o.kind === 'chase'
                    ? `↻ ${o.chase_step > 1 ? 'Final nudge' : 'Chaser'} if they don’t reply — sends ${countdown(o.send_after, now)} · ${
                        new Date(o.send_after).getTime() < windowCloses ? 'free message' : 'as a template (paid)'
                      }`
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
                <p className="wa-queued-body">
                  {o.template_name
                    ? `Template, {{1}} = ${o.body}`
                    : o.kind === 'chase' && new Date(o.send_after).getTime() >= windowCloses
                      ? `The free window will have closed by then, so your chase template goes instead of: “${o.body}”`
                      : o.body}
                </p>
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
      </div>

      {error && <p className="wa-banner wa-banner--err">{error}</p>}

      {open ? (
        <>
        {chasePicker(text)}
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
        </>
      ) : (
        <div className="wa-compose wa-compose--tpl">
          <p className="wa-muted">
            {messages.some((m) => m.direction === 'in' && m.via !== 'import')
              ? 'It’s been over 24 hours since they last messaged, so WhatsApp only allows an approved template. Free chat reopens as soon as they reply.'
              : messages.some((m) => m.via === 'import')
                ? 'This chat was imported from the WhatsApp Business app. They haven’t messaged the CRM’s WhatsApp number yet, so start with an approved template. Once they reply you can chat freely for 24 hours.'
                : 'Start the conversation with an approved template. Once they reply you can chat freely for 24 hours.'}
          </p>
          {templates === null ? (
            <p className="wa-muted">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="wa-muted">
              No approved templates yet. <Link href="/admin/enquiries/templates" className="wts-manage">Send one to Meta from WhatsApp templates →</Link>
            </p>
          ) : (
            tpl && (
              <>
                <TemplateSendFields send={tplSend} inputClass="wa-input" />
                {chasePicker('', true)}
                <button
                  type="button"
                  className="wa-send"
                  disabled={!configured || sending || !tplSend.ready}
                  onClick={() => post({ template: tpl.name, lang: tpl.lang, params: tpl.params, chaseHours: chaseHoursFor('', true) })}
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
