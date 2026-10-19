'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { CrmDoc } from '@/app/admin/crm/[id]/ProjectExtras';
import { TemplateSendFields, useTemplateSend } from '@/components/admin/TemplateSend';
import { stageLabel } from '@/lib/crm/stages';
import { chatRef, chatTag, NOTIFICATIONS_CHANGED } from '@/lib/notification-refs';
import { closeShownNotifications } from '@/lib/push-client';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { SERVICE_WINDOW_MS, windowLeft, windowOpen } from '@/lib/whatsapp/shared';
import { shownBody } from '@/lib/whatsapp/describe';
import '@/app/admin/enquiries/whatsapp.css';

/**
 * One WhatsApp chat: the messages, what's queued, and the reply box (or an approved template once the
 * 24-hour window has closed). Two looks:
 * - 'page': the inbox chat and /admin/crm/chats/{id}, exactly as the inbox has always been (the window
 *   scrolls, the reply box sticks to the bottom);
 * - 'dock': inside the WhatsApp dock, which scrolls its own box so the page never moves, with saved
 *   replies, documents and "Replying to …" above the reply box.
 * Both keep an unsent reply per person and chat in this browser, and send on Ctrl/⌘ + Enter (Enter
 * alone adds a line, so a half-written message never goes by accident).
 */

// Only loaded when a chat in the dock needs them (they're the CRM's, and big).
const SnippetPicker = dynamic(() => import('@/app/admin/crm/[id]/ProjectExtras').then((m) => m.SnippetPicker), { ssr: false });
const WhatsAppDocSend = dynamic(() => import('@/app/admin/crm/[id]/ProjectExtras').then((m) => m.WhatsAppDocSend), { ssr: false });

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

export type ChatPaneProps = {
  /** Enquiry id (as /api/whatsapp/conversations/{id}). */
  threadId: string;
  /** The signed-in user's id, for the draft key. */
  me: string;
  variant: 'page' | 'dock';
  /** dock: this chat is on screen (panel showing, this tab). page: always true. Polls and reads only while true. */
  active: boolean;
  /** The page header's ← link. `short` is what the link says while the chat loads. */
  back?: { href: string; label: string; short?: string };
  /** "Jane Smith · Quote sent · Back to job", from ?job= on the chat page. */
  job?: { projectId: string; stage: string | null; tab: string | null } | null;
  /** Turns on Saved replies (CRM access only). */
  projectId?: string | null;
  /** This job only: turns on "Send a document". */
  docs?: CrmDoc[];
  /** Shows the Smart replies on/off switch and the templates link (Enquiries access). */
  canInbox?: boolean;
  /** A new number puts the cursor in the reply box and scrolls to the newest. */
  focusKey?: number;
  /** whatsapp_messages.id to scroll to and highlight. */
  scrollToMessage?: string | null;
  /** Other enquiries on the same number with unread messages: marked read with this one. */
  alsoRead?: string[];
  /** Above the reply box in the dock (the "this isn't Jane's chat" bar). */
  notice?: ReactNode;
  /** page: their HX-0042 for the header (customer-refs.sql), null until it's been run. */
  customerRef?: string | null;
  onSent?: () => void;
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

/* ── Unsent replies: one per person and chat, in this browser ─────────────────────────────────────── */

const draftKey = (me: string, threadId: string) => `hx-wa-draft:${me.slice(0, 8)}:${threadId}`;
function readDraft(key: string) {
  try {
    return typeof window === 'undefined' ? '' : (localStorage.getItem(key) ?? '');
  } catch {
    return '';
  }
}
function writeDraft(key: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // Private windows and full storage: the reply just isn't kept.
  }
}

/** Chats on screen right now, by thread: each adds text to its own reply box. */
const livePanes = new Map<string, Set<(text: string) => void>>();

/**
 * Puts text in a chat's reply box (a saved reply, "Send on WhatsApp" from the portal card): into the
 * box if that chat is on screen, otherwise into its saved draft, which the chat picks up when it opens.
 * On a new line after anything already there.
 */
export function appendDraft(me: string, threadId: string, text: string) {
  const t = text.trim();
  if (!t) return;
  const live = livePanes.get(threadId);
  if (live?.size) {
    for (const add of live) add(t);
    return;
  }
  const key = draftKey(me, threadId);
  const was = readDraft(key);
  writeDraft(key, was.trim() ? `${was}\n${t}` : t);
}

export function ChatPane({
  threadId: id,
  me,
  variant,
  active,
  back,
  job,
  projectId,
  docs,
  canInbox = false,
  focusKey,
  scrollToMessage,
  alsoRead,
  notice,
  customerRef = null,
  onSent,
}: ChatPaneProps) {
  const router = useRouter();
  const dock = variant === 'dock';
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const [configured, setConfigured] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);
  const [chaseDefaults, setChaseDefaults] = useState({ questions: true, hours: 12 });
  const [chaseChoice, setChaseChoice] = useState('auto');
  const [error, setError] = useState('');
  const key = draftKey(me, id);
  const [text, setText] = useState(() => readDraft(key));
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  /** The last full load's version: polls send it, and get { same: true } if nothing changed. */
  const version = useRef('');
  /** Cleared this chat's notifications since it opened (once, even with nothing unread). */
  const readOnce = useRef(false);
  /** At (or near) the bottom: new messages scroll into view. Scrolled up reading: left alone. */
  const atBottom = useRef(true);
  /** The dock's own scrolling box. */
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // What the poll needs to know without restarting it.
  const live = useRef({ active, alsoRead });
  useEffect(() => {
    live.current = { active, alsoRead };
  }, [active, alsoRead]);

  // The reply box, saved as you type (a moment after you stop) and when the chat closes.
  const textNow = useRef(text);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setDraft = useCallback(
    (v: string) => {
      textNow.current = v;
      setText(v);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => writeDraft(key, v), 300);
    },
    [key]
  );
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      writeDraft(key, textNow.current);
    },
    [key]
  );
  useEffect(() => {
    const add = (t: string) => setDraft(textNow.current.trim() ? `${textNow.current}\n${t}` : t);
    const set = livePanes.get(id) ?? new Set();
    set.add(add);
    livePanes.set(id, set);
    return () => {
      set.delete(add);
      if (!set.size) livePanes.delete(id);
    };
  }, [id, setDraft]);

  const load = useCallback(
    async (full = true) => {
      // Folded away or another tab: nothing on screen to keep fresh.
      if (!live.current.active) return true;
      try {
        const v = !full && version.current ? `?v=${version.current}` : '';
        const r = await fetch(`/api/whatsapp/conversations/${id}${v}`, { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error === 'Not found' ? 'This chat isn’t available.' : d.error || 'Could not load this chat');
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
        // Blue ticks, the badge and its notifications cleared, but only while the chat is on screen:
        // in the dock that also means this window has focus (it can sit beside another one all day).
        const unread = d.same ? d.unread : d.enquiry.wa_unread;
        const visible = document.visibilityState === 'visible' && (!dock || document.hasFocus());
        if ((unread > 0 || !readOnce.current) && visible) {
          const others = readOnce.current ? [] : (live.current.alsoRead ?? []).filter((x) => x !== id);
          readOnce.current = true;
          Promise.all(
            [id, ...others].map((x) =>
              fetch(`/api/whatsapp/conversations/${x}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true }),
              })
            )
          )
            .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)))
            .catch(() => {});
          void closeShownNotifications((n) => n.data?.ref === chatRef(id) || n.tag === chatTag(id));
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this chat');
        return false;
      }
    },
    [id, dock]
  );

  // New messages and ticks show up by themselves (every 4.5s while it's on screen).
  const { refresh, busy, reload } = useLiveRefresh(load, 4_500);
  // In the dock, coming back to this window is when what came in meanwhile gets read: look straight away.
  useEffect(() => {
    if (!dock) return;
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dock, reload]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    if (dock) return () => clearInterval(tick);
    const onScroll = () => {
      atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearInterval(tick);
      window.removeEventListener('scroll', onScroll);
    };
  }, [dock]);

  // By the newest message, not the count: a long chat shows the latest 500, so the count stays put.
  // To the very bottom (past the compose and tab bar), the same place the scroll check measures to.
  const newest = messages.at(-1)?.id;
  const toBottom = useCallback(() => {
    if (!dock) window.scrollTo({ top: document.documentElement.scrollHeight });
    else if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [dock]);
  useEffect(() => {
    if (newest && atBottom.current) toBottom();
  }, [newest, toBottom]);
  // In the dock the box gets shorter as the reply box fills in (saved replies, a template's blanks):
  // still at the bottom, it stays there.
  useEffect(() => {
    const box = boxRef.current;
    if (!dock || !box) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) box.scrollTop = box.scrollHeight;
    });
    ro.observe(box);
    if (box.firstElementChild) ro.observe(box.firstElementChild);
    return () => ro.disconnect();
  }, [dock, newest]);

  // Asked to put the cursor in the reply box (the green WhatsApp button): once the chat has loaded.
  const loaded = !!enquiry;
  const focusedKey = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded || !focusKey || focusedKey.current === focusKey) return;
    focusedKey.current = focusKey;
    atBottom.current = true;
    toBottom();
    inputRef.current?.focus({ preventScroll: true });
  }, [focusKey, loaded, toBottom]);

  // Asked to show one message (an Activity entry on the record page): scrolled to the middle of the
  // dock's box and lit up for a moment. Only the box moves, never the page.
  const shownMessage = useRef<string | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!scrollToMessage || !box || shownMessage.current === scrollToMessage) return;
    const el = box.querySelector<HTMLElement>(`[data-mid="${CSS.escape(scrollToMessage)}"]`);
    if (!el) return;
    shownMessage.current = scrollToMessage;
    atBottom.current = false;
    box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2);
    el.classList.add('is-lit');
    const t = setTimeout(() => el.classList.remove('is-lit'), 2600);
    return () => clearTimeout(t);
  }, [scrollToMessage, newest]);

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
      onSent?.();
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
    if (!t || sending || !configured) return;
    // The draft goes only once it's sent; if sending fails it stays in the box (and saved).
    if (await post({ text: t, chaseHours: chaseHoursFor(t) })) {
      setDraft('');
      setChaseChoice('auto');
    }
  }

  /** Ctrl + Enter (⌘ + Enter on a Mac) sends; Enter on its own starts a new line. */
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
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

  /** Back to the job page this chat was opened from: the same tab and scroll position when it can. */
  function backToJob(e: MouseEvent<HTMLAnchorElement>) {
    if (!job || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    let from = '';
    try {
      from = sessionStorage.getItem('hx-chat-from') ?? '';
      if (from === job.projectId) sessionStorage.removeItem('hx-chat-from');
    } catch {
      // No session storage: the link below works the same, just without the scroll position.
    }
    if (from === job.projectId) {
      e.preventDefault();
      router.back();
    }
  }

  if (!enquiry) {
    return (
      <div className={dock ? 'wa-page wa-pane--dock' : 'wa-page'}>
        {back && <Link href={back.href} className="wa-back">← {back.short ?? 'Inbox'}</Link>}
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

  const banners = (
    <>
      {/* The dock says this once, above its tabs. */}
      {!configured && !dock && <p className="wa-banner">WhatsApp isn’t connected yet — sending is disabled until the Meta keys are added.</p>}
      {!enquiry.whatsapp_opt_in && messages.length === 0 && (
        <p className="wa-banner">
          This lead hasn’t opted in to WhatsApp. Only message them if they’ve agreed to it (e.g. on the phone).
        </p>
      )}
    </>
  );

  const thread = (
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
            <div className={`wa-bubble ${m.direction}${m.kind === 'template' ? ' tpl' : ''}`} data-mid={m.id}>
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
              <textarea className="wa-input" rows={4} value={editing.body} onChange={(e) => setEditing({ id: o.id, body: e.target.value })} />
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
  );

  const errorLine = error && <p className="wa-banner wa-banner--err">{error}</p>;

  const templateBox = (
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
          No approved templates yet.{' '}
          {canInbox ? (
            <Link href="/admin/enquiries/templates" className="wts-manage">Send one to Meta from WhatsApp templates →</Link>
          ) : (
            'Ask whoever looks after Enquiries to add one in WhatsApp templates.'
          )}
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
  );

  const jobLink = job && (
    <p className="wa-jobchip">
      <span>
        <b>{enquiry.name}</b>
        {job.stage ? ` · ${stageLabel(job.stage)}` : ''}
      </span>
      <Link href={`/admin/crm/${job.projectId}${job.tab ? `?tab=${encodeURIComponent(job.tab)}` : ''}`} onClick={backToJob}>
        Back to job
      </Link>
    </p>
  );

  if (dock) {
    const number = enquiry.phone || (enquiry.wa_id ? `+${enquiry.wa_id}` : '');
    return (
      <div className="wa-page wa-pane--dock">
        <div className="wa-pane__scroll" ref={boxRef} onScroll={(e) => {
          const b = e.currentTarget;
          atBottom.current = b.scrollTop + b.clientHeight >= b.scrollHeight - 80;
        }}>
          {banners}
          {thread}
        </div>
        <div className="wa-pane__foot">
          {errorLine}
          {notice}
          {open ? (
            <div className="wa-pane__compose">
              <p className="wa-replying">
                Replying to <b>{enquiry.name}</b>
                {number && ` · ${number}`}
              </p>
              <div className="wa-pane__chips">
                {projectId && <SnippetPicker projectId={projectId} name={enquiry.name} onPick={(t) => setDraft(textNow.current.trim() ? `${textNow.current}\n${t}` : t)} />}
                {projectId && docs && <WhatsAppDocSend id={projectId} docs={docs} onSent={async () => void (await reload())} />}
                {chasePicker(text)}
              </div>
              <div className="wa-pane__row">
                <textarea
                  ref={inputRef}
                  className="wa-input"
                  rows={2}
                  placeholder="Type a reply…"
                  aria-label={`Reply to ${enquiry.name}`}
                  value={text}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  disabled={!configured}
                  // Read-only (not disabled) while sending, so the cursor stays in the box for the next message.
                  readOnly={sending}
                />
                <button type="button" className="wa-send" onClick={send} disabled={!configured || sending || !text.trim()} title="Ctrl + Enter (⌘ + Enter on a Mac)">
                  {sending ? '…' : 'Send'}
                  <small>Ctrl/⌘ + Enter</small>
                </button>
              </div>
            </div>
          ) : (
            templateBox
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wa-page wa-chat">
      <div className="wa-chat-head">
        {back && <Link href={back.href} className="wa-back" aria-label={back.label}>←</Link>}
        <span className="wa-avatar">{enquiry.name.slice(0, 1).toUpperCase()}</span>
        <div className="wa-chat-who">
          <b>{enquiry.name}</b>
          <span>
            {customerRef ? `${customerRef} · ` : ''}
            {enquiry.wa_id ? `+${enquiry.wa_id}` : enquiry.phone || 'No number'} · {open ? left : 'window closed'}
          </span>
        </div>
        <button type="button" className="wa-refresh" onClick={refresh} disabled={busy} aria-label="Refresh" title="Refresh">
          ↻
        </button>
        {canInbox && (
          <button type="button" className={`wa-auto${enquiry.wa_auto_off ? ' off' : ''}`} onClick={toggleAuto}>
            {enquiry.wa_auto_off ? 'Smart replies off' : 'Smart replies on'}
          </button>
        )}
      </div>
      {jobLink}

      {banners}
      {thread}
      {errorLine}

      {open ? (
        <>
          {chasePicker(text)}
          <div className="wa-compose">
            <textarea
              ref={inputRef}
              className="wa-input"
              rows={2}
              placeholder="Message"
              value={text}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              disabled={!configured}
              readOnly={sending}
            />
            <button type="button" className="wa-send" onClick={send} disabled={!configured || sending || !text.trim()} title="Ctrl + Enter (⌘ + Enter on a Mac)">
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </>
      ) : (
        templateBox
      )}
    </div>
  );
}
