'use client';

import { useState, type ReactNode } from 'react';
import {
  atWords,
  freeAt,
  fromUkInput,
  lastFreeAt,
  laterChoices,
  lateSendAt,
  ukInput,
  whenWords,
  windowClosesAt,
  windowShutWords,
  type LateRule,
} from '@/lib/whatsapp/schedule';
import './send-later.css';

/**
 * "Send later" and the late-night rule in a reply box: the chat (ChatPane, in the inbox, the phone
 * chat page and the dock) and the job's WhatsApp sheet (RecordSheets). useSendLater gives the box
 * what its Send button says and does, the clock button beside it, and the panel above it: the quick
 * choices and a date/time box, or, when a typed message would land after the customer's free 24h
 * window, what to do instead. ScheduledBubble is a scheduled message waiting in the chat.
 */

export type LaterOptions = {
  /** Now, in ms (the chat's ticking clock). */
  now: number;
  /** The late-night rule (null until the chat has loaded, or off). */
  view: LateRule | null | undefined;
  /** The outbox can hold a scheduled message (whatsapp-scheduled.sql has been run). */
  ready: boolean;
  /** Their last message, for the free window: a typed message has to go inside it. */
  lastInboundAt: string | null;
  /** A template can go any time, so it skips the window check. */
  template?: boolean;
  /** Their name, for the words. */
  name: string;
  /** Nothing to send yet (an empty box), or sending: the buttons wait. */
  disabled?: boolean;
  /** Send now (null) or schedule for `at`. True once it's gone or been scheduled. */
  submit: (at: Date | null) => Promise<boolean>;
  /** "Send a template at 07:00 instead", for a typed message that would miss the window. */
  onTemplate?: (at: Date) => void;
  /**
   * When its chaser would go if it's sent at `at` (null = now); null = no chaser. Shown against each
   * other way of sending: the box's own "Chase if no reply" counts from the Send button's time.
   */
  chaseAt?: (at: Date | null) => Date | null;
};

const STEP_S = 300; // the date/time box moves in 5 minutes

function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function useSendLater(o: LaterOptions) {
  const [open, setOpen] = useState(false);
  /** The date/time box's value (UK time), while it's showing. */
  const [pick, setPick] = useState<string | null>(null);
  const [pickErr, setPickErr] = useState('');
  /** A typed message that would land after the window: when it was meant to go. */
  const [warn, setWarn] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const now = new Date(o.now);
  // The late-night rule only applies once a message can be held for the morning.
  const lateAt = o.ready && o.view ? lateSendAt(now, o.view) : null;
  const first = o.name.trim().split(/\s+/)[0] || 'They';
  const free = (at: Date) => !!o.template || freeAt(at, o.lastInboundAt);

  function close() {
    setOpen(false);
    setPick(null);
    setPickErr('');
    setWarn(null);
  }

  /** Send now (null) or at `at`; a typed message past the free window stops to ask instead. */
  async function go(at: Date | null) {
    if (busy || o.disabled) return;
    if (at && !free(at)) {
      setOpen(false);
      setPick(null);
      setWarn(at);
      return;
    }
    setBusy(true);
    try {
      if (await o.submit(at)) close();
    } finally {
      setBusy(false);
    }
  }

  function schedulePick() {
    const at = pick ? fromUkInput(pick) : null;
    if (!at) return setPickErr('Pick a date and a time.');
    if (at.getTime() < o.now + 60_000) return setPickErr('Pick a time later than now.');
    setPickErr('');
    void go(at);
  }

  const choices = laterChoices(now);
  const close24 = windowClosesAt(o.lastInboundAt);
  const lastFree = lastFreeAt(o.lastInboundAt, now);
  /**
   * The chaser if it's sent at `at` instead: "chased tomorrow about 19:00". On a quick choice (`short`)
   * the same day goes without saying, so the choices stay small: "chased about 19:00".
   */
  const chased = (at: Date | null, short = false) => {
    const t = o.chaseAt?.(at);
    if (!t) return null;
    const words = whenWords(t, now);
    return `chased ${short && at && ukInput(t).slice(0, 10) === ukInput(at).slice(0, 10) ? words.replace(/^.*?(?=about )/, '') : words}`;
  };
  // Sent now rather than at the Send button's time (late at night): its chaser counts from now.
  const chasedNow = lateAt ? chased(null) : null;
  const pickAt = pick ? fromUkInput(pick) : null;
  const pickChase = pickAt && pickAt.getTime() >= o.now + 60_000 && free(pickAt) ? chased(pickAt) : null;

  const clock = (className = '') => (
    <button
      type="button"
      className={`wsl-clock${className ? ` ${className}` : ''}${open ? ' is-open' : ''}`}
      aria-label="Send later"
      aria-expanded={open}
      title="Send later"
      disabled={o.disabled || busy}
      onClick={() => {
        if (open) return close();
        setWarn(null);
        setOpen(true);
      }}
    >
      <ClockIcon />
    </button>
  );

  let panel: ReactNode = null;
  if (warn) {
    panel = (
      <div className="wsl-panel wsl-panel--warn" role="alert">
        <p className="wsl-warn">⚠ {windowShutWords(o.name, o.lastInboundAt, warn, now)}</p>
        <div className="wsl-actions">
          <button type="button" className="wsl-btn wsl-btn--go" disabled={busy} onClick={() => void go(null)}>
            Send now (free)
          </button>
          {lastFree && close24 && (
            <button
              type="button"
              className="wsl-btn"
              onClick={() => {
                setWarn(null);
                setPick(ukInput(lastFree));
                setOpen(true);
              }}
            >
              Pick a time before {atWords(new Date(close24), now)}
            </button>
          )}
          {o.onTemplate && (
            <button
              type="button"
              className="wsl-btn"
              onClick={() => {
                setWarn(null);
                o.onTemplate?.(warn);
              }}
            >
              Send a template at {atWords(warn, now)} instead
            </button>
          )}
          <button type="button" className="wsl-btn wsl-btn--ghost" onClick={close}>
            Back
          </button>
        </div>
        {chasedNow && <p className="wsl-note">Sent now, it’s {chasedNow} if there’s no reply.</p>}
      </div>
    );
  } else if (open) {
    panel = (
      <div className="wsl-panel" role="group" aria-label="Send later">
        <div className="wsl-head">
          <b>Send later</b>
          <button type="button" className="wsl-x" aria-label="Close" onClick={close}>
            ×
          </button>
        </div>
        {!o.ready ? (
          <p className="wsl-note">Send later needs one setup step first: run whatsapp-scheduled.sql in Supabase. It’s on the to-do list.</p>
        ) : (
          <>
            <div className="wsl-choices">
              {choices.map((c) => {
                const ok = free(c.at);
                const chase = ok && chased(c.at, true);
                return (
                  <button key={c.label} type="button" className="wsl-choice" disabled={busy || o.disabled} onClick={() => void go(c.at)}>
                    <span>{c.label}</span>
                    {!ok && <small>after {first}’s free window</small>}
                    {chase && <small className="wsl-chased">{chase}</small>}
                  </button>
                );
              })}
              <button
                type="button"
                className={`wsl-choice wsl-choice--pick${pick !== null ? ' is-on' : ''}`}
                onClick={() => setPick(pick !== null ? null : ukInput(lateAt ?? choices[0].at))}
              >
                <span>Pick a date and time…</span>
              </button>
            </div>
            {pick !== null && (
              <div className="wsl-pick">
                <input
                  type="datetime-local"
                  className="wsl-when"
                  aria-label="Date and time to send (UK time)"
                  value={pick}
                  min={ukInput(now)}
                  step={STEP_S}
                  onChange={(e) => {
                    setPick(e.target.value);
                    setPickErr('');
                  }}
                />
                <button type="button" className="wsl-btn wsl-btn--go" disabled={busy || o.disabled} onClick={schedulePick}>
                  Schedule
                </button>
              </div>
            )}
            {pickChase && <p className="wsl-note">Sent then, it’s {pickChase} if there’s no reply.</p>}
            {pickErr && <p className="wsl-err">{pickErr}</p>}
            {o.disabled && <p className="wsl-note">Type your message first.</p>}
            <p className="wsl-note">It goes as you at that time (UK), and waits in the chat until then: edit it, send it now or cancel it there.</p>
          </>
        )}
      </div>
    );
  }

  const lateNote = lateAt && !warn && (
    <p className="wsl-late">
      <span>It’s late, so this goes at {atWords(lateAt, now)}.</span>
      <button type="button" className="wsl-link" disabled={o.disabled || busy} onClick={() => void go(null)}>
        Send now instead
      </button>
      {chasedNow && <span>(then {chasedNow} if there’s no reply)</span>}
    </p>
  );

  // "07:00": it's always the next one, so the button needn't say which day.
  const lateTime = lateAt ? atWords(lateAt, now).replace(/ (today|tomorrow|tonight)$/, '') : null;

  return {
    /** The late-night rule applies: the Send button sends at this time. */
    lateAt,
    lateTime,
    /** The Send button and Ctrl/⌘ + Enter. */
    main: () => void go(lateAt),
    sendNow: () => void go(null),
    busy,
    clock,
    panel,
    /** Which panel is showing ('' for none), so the dock can keep the reply box in view as it opens or grows. */
    panelState: warn ? 'warn' : open ? (pick !== null ? 'pick' : 'open') : '',
    lateNote,
  };
}

/* ── A scheduled message in the chat ──────────────────────────────────────────────────────────── */

export type ScheduledItem = {
  id: string;
  body: string | null;
  template_name: string | null;
  send_after: string;
  status: 'pending' | 'sending' | 'failed';
  last_error: string | null;
  created_at: string;
  /** Who wrote it. */
  by?: string | null;
  /** Its author or an admin: Edit, Send now and Cancel. */
  canChange?: boolean;
};

/**
 * "Scheduled for 07:00 tomorrow · Callum", with Edit (words and time), Send now and Cancel for its
 * author and admins; everyone else in the chat sees it too. Says so if the customer has written since,
 * or if their free window will have closed by then.
 */
export function ScheduledBubble({
  o,
  now,
  name,
  lastInboundAt,
  onAction,
}: {
  o: ScheduledItem;
  now: number;
  name: string;
  lastInboundAt: string | null;
  onAction: (action: 'cancel' | 'send-now' | 'edit', change?: { body?: string; sendAt?: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{ body: string; when: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const at = new Date(o.send_after);
  const nowD = new Date(now);
  const who = name.trim().split(/\s+/)[0];
  const first = who || 'They';
  const repliedSince = !!lastInboundAt && Date.parse(lastInboundAt) > Date.parse(o.created_at);
  const misses = !o.template_name && o.status === 'pending' && !freeAt(at, lastInboundAt);

  async function act(action: 'cancel' | 'send-now' | 'edit', change?: { body?: string; sendAt?: string }) {
    setBusy(true);
    try {
      return await onAction(action, change);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const when = fromUkInput(editing.when);
    if (!when) return setErr('Pick a date and a time.');
    if (when.getTime() < now + 60_000) return setErr('Pick a time later than now.');
    if (!o.template_name && !editing.body.trim()) return setErr('The message is empty.');
    if (!o.template_name && !freeAt(when, lastInboundAt)) return setErr(windowShutWords(name, lastInboundAt, when, nowD));
    setErr('');
    if (await act('edit', { ...(o.template_name ? {} : { body: editing.body }), sendAt: when.toISOString() })) setEditing(null);
  }

  const head =
    o.status === 'failed' ? '⚠ Scheduled message not sent' : o.status === 'sending' ? 'Sending the scheduled message…' : `🕐 Scheduled for ${atWords(at, nowD)}`;

  return (
    <div className={`wa-queued wsl-bubble ${o.status}`}>
      <div className="wa-queued-head">
        <span className="wsl-headtext">{head}</span>
        {o.by && <span className="wsl-by">by {o.by}</span>}
      </div>
      {o.status === 'failed' && <p className="wsl-warn wsl-warn--small">{o.last_error || 'Something went wrong.'}</p>}
      {editing ? (
        <div className="wsl-edit">
          {!o.template_name && (
            <textarea
              className="wa-input"
              rows={4}
              aria-label="Message"
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
          )}
          <label className="wsl-edit__when">
            <span>Send at (UK time)</span>
            <input
              type="datetime-local"
              className="wsl-when"
              value={editing.when}
              min={ukInput(nowD)}
              step={STEP_S}
              onChange={(e) => setEditing({ ...editing, when: e.target.value })}
            />
          </label>
          {err && <p className="wsl-err">{err}</p>}
          <div className="wa-queued-actions">
            <button type="button" disabled={busy} onClick={() => void save()}>
              Save
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditing(null);
                setErr('');
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="wa-queued-body">{o.body}</p>
          {o.template_name && <p className="wsl-small">A template, as {first} will see it.</p>}
          {o.status === 'pending' && repliedSince && (
            <p className="wsl-small">
              {first} has written since this was scheduled. It still goes at {atWords(at, nowD)} unless you change it.
            </p>
          )}
          {misses && (
            <p className="wsl-warn wsl-warn--small">
              ⚠ {windowShutWords(name, lastInboundAt, at, nowD)} So it won’t go unless {who ? `${who} messages` : 'they message'} first:
              pick an earlier time, or cancel it and send a template.
            </p>
          )}
          {o.status !== 'sending' &&
            (o.canChange ? (
              <div className="wa-queued-actions">
                <button type="button" disabled={busy} onClick={() => void act('send-now')}>
                  {o.status === 'failed' ? 'Retry' : 'Send now'}
                </button>
                {o.status === 'pending' && (
                  <button type="button" className="ghost" onClick={() => setEditing({ body: o.body || '', when: ukInput(at) })}>
                    Edit
                  </button>
                )}
                <button type="button" className="ghost" disabled={busy} onClick={() => void act('cancel')}>
                  Cancel
                </button>
              </div>
            ) : (
              <p className="wsl-small">Only {o.by || 'whoever wrote it'} or an admin can change it.</p>
            ))}
        </>
      )}
    </div>
  );
}
