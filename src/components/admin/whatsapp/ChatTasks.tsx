'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { suggestReminder, type Suggestion } from '@/lib/whatsapp/chat-time';
import { shownBody } from '@/lib/whatsapp/describe';
import type { ChatJobInfo, Done, TaskKind } from './ChatTaskSheets';
import './chat-tasks.css';

/**
 * "+ Add task" in a WhatsApp chat (ChatPane, both looks): a call-back reminder (the job's next step at a
 * time, which the every-minute cron pushes when it's due), a task (who and which day) or a note, for this
 * customer's job, without leaving the chat. The time and the words come from their latest message (or the
 * one picked with a long press, or the ⋯ beside it on a computer) and can all be changed; nothing is saved
 * until Save. Afterwards a line in the chat says what was set and who hears.
 *
 * CRM access only. The sheets are the record page's (RecordSheets), loaded the first time they're needed.
 */

// The record page's sheets and the CRM's styles: only loaded once someone opens the menu.
const loadSheets = () => import('./ChatTaskSheets');
const ChatTaskSheet = dynamic(() => loadSheets().then((m) => m.ChatTaskSheet), { ssr: false });

type ChatMsg = { id: string; direction: 'in' | 'out'; body: string | null; created_at: string; media_status?: string | null };
type Lookup = { info: ChatJobInfo | null; error: string };
type Open = { kind: TaskKind; s: Suggestion; back: HTMLElement | null };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** The words of a message that can be read for a time: text, not photos or files. */
const textOf = (m: ChatMsg) => (m.media_status ? '' : (shownBody(m.body) ?? '').trim());

const MENU: [TaskKind, string, string, string][] = [
  ['callback', '⏰', 'Call-back reminder', 'At a set time'],
  ['task', '✓', 'Task', 'Who and which day'],
  ['note', '✎', 'Note', 'On the job’s timeline'],
];

export function useChatTasks({
  threadId,
  me,
  name,
  messages,
  enabled,
}: {
  threadId: string;
  /** The signed-in user (the task's default "Who"). */
  me: string;
  /** The customer's name, once the chat has loaded. */
  name: string | null;
  messages: ChatMsg[];
  /** CRM access: off, nothing shows. */
  enabled: boolean;
}): {
  /** "+ Add task", for the page's header. */
  button: ReactNode;
  /** "Reminder set: …", for under the page's header. */
  notice: ReactNode;
  /** Both in a strip, for the top of the dock's chat. */
  bar: ReactNode;
  /** A message's ⋯ (and long press): "Make a reminder from this". */
  actionsFor: (m: ChatMsg) => ReactNode;
  /** The open sheet (portalled to the page). */
  sheet: ReactNode;
} {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ info: null, error: '' });
  const [done, setDone] = useState<Done | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** The last read of their job: `at` is when it came back (0 while it's on its way). */
  const reading = useRef<{ p: Promise<ChatJobInfo>; at: number } | null>(null);
  const who = name ? firstName(name) : '';

  /**
   * The customer's job, shared by everything that asks while it's on its way and for half a minute
   * after (the job can change elsewhere while the chat is open); `fresh` after a save.
   */
  const readJob = useCallback(
    (fresh = false) => {
      const last = reading.current;
      if (last && !fresh && (!last.at || Date.now() - last.at < 30_000)) return last.p;
      const read = { at: 0 } as { p: Promise<ChatJobInfo>; at: number };
      read.p = fetch(`/api/crm/chat-job?enquiry=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || 'Couldn’t look up their job');
          read.at = Date.now();
          setLookup({ info: d as ChatJobInfo, error: '' });
          return d as ChatJobInfo;
        })
        .catch((e: unknown) => {
          if (reading.current === read) reading.current = null;
          setLookup((l) => ({ ...l, error: e instanceof Error ? e.message : 'Couldn’t look up their job' }));
          throw e;
        });
      reading.current = read;
      return read.p;
    },
    [threadId]
  );
  /** Started as soon as there's a sign of wanting one (the menu opening), so the sheet rarely waits. */
  const warm = useCallback(() => {
    void loadSheets();
    readJob().catch(() => {});
  }, [readJob]);

  // The confirmation goes by itself after a while.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 20_000);
    return () => clearTimeout(t);
  }, [done]);

  // The menu closes on a tap outside it, or on leaving it by keyboard.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const el = buttonRef.current?.parentElement;
      if (el && !el.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);

  const start = useCallback(
    (kind: TaskKind, from: ChatMsg | null, back: HTMLElement | null) => {
      if (!name) return;
      warm();
      // The customer's latest message, unless one was picked.
      const m = from ?? [...messages].reverse().find((x) => x.direction === 'in' && textOf(x)) ?? null;
      // Our message just before theirs, if it was ours ("When's good for a call?" → "Tomorrow's fine").
      const before = m ? messages[messages.indexOf(m) - 1] : undefined;
      const asked = before?.direction === 'out' ? textOf(before) : '';
      const s = suggestReminder(m && { body: textOf(m), direction: m.direction, sentAt: Date.parse(m.created_at) }, name, Date.now(), asked);
      setMenu(false);
      setDone(null);
      setOpen({ kind, s, back });
    },
    [messages, name, warm]
  );

  const close = useCallback(() => {
    const back = open?.back ?? buttonRef.current;
    setOpen(null);
    // Back to whatever opened it (the menu that did has gone).
    requestAnimationFrame(() => (back?.isConnected ? back : buttonRef.current)?.focus({ preventScroll: true }));
  }, [open]);

  if (!enabled || !name) return { button: null, notice: null, bar: null, actionsFor: () => null, sheet: null };

  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      // Not the dock's (it would close the chat).
      e.preventDefault();
      e.stopPropagation();
      setMenu(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (e.key === 'Tab') setMenu(false);
  }

  const button = (
    <span className="wa-addtask">
      <button
        ref={buttonRef}
        type="button"
        className="wa-addtask__btn"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={`Add a task or reminder for ${who}`}
        onPointerEnter={warm}
        onClick={() => {
          if (!menu) warm();
          setMenu(!menu);
        }}
      >
        + Add task
      </button>
      {menu && (
        <div
          className="wa-addtask__menu"
          role="menu"
          aria-label={`Add for ${who}`}
          onKeyDown={onMenuKey}
          ref={(el) => {
            // The first choice gets the cursor as the menu opens.
            if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
          }}
        >
          {MENU.map(([k, icon, label, hint]) => (
            <button key={k} type="button" role="menuitem" onClick={() => start(k, null, buttonRef.current)}>
              <span aria-hidden="true">{icon}</span>
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      )}
    </span>
  );

  const notice = done && (
    <p className="wa-tasknote" role="status">
      <span>{done.text}</span>
      <span className="wa-tasknote__acts">
        {done.jobId && <Link href={`/admin/crm/${done.jobId}`}>Open job</Link>}
        <button type="button" onClick={() => setDone(null)}>
          OK
        </button>
      </span>
    </p>
  );

  const sheet = open && (
    <ChatTaskSheet
      kind={open.kind}
      s={open.s}
      name={name}
      threadId={threadId}
      me={me}
      info={lookup.info}
      lookupError={lookup.error}
      readJob={readJob}
      onClose={close}
      onDone={(d) => {
        setDone(d);
        close();
        // The job's page, if it's open behind the dock, shows the new next step or task now.
        window.dispatchEvent(new CustomEvent('hx:project-changed', { detail: { id: d.jobId } }));
      }}
    />
  );

  return {
    button,
    notice,
    bar: (
      <div className="wa-pane__tasks">
        {notice}
        {button}
      </div>
    ),
    // The same props from one second's re-render of the chat to the next, so each message's menu skips it.
    actionsFor: (m) => (textOf(m) ? <MessageMenu m={m} onStart={start} onOpen={warm} /> : null),
    sheet,
  };
}

/**
 * A message's own menu: "Make a reminder from this", "Make a task from this", "Copy text". The ⋯ shows
 * beside the message on hover (computers); on phones a long press on the message opens it (and, as the
 * long press no longer selects text, "Copy text" stands in for that).
 */
const MessageMenu = memo(function MessageMenu({
  m,
  onStart,
  onOpen,
}: {
  m: ChatMsg;
  onStart: (kind: TaskKind, from: ChatMsg, back: HTMLElement | null) => void;
  onOpen: () => void;
}) {
  const text = textOf(m);
  const [open, setOpen] = useState<'up' | 'down' | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  /** Opens above the message in the lower half of the chat, so it isn't cut off at the bottom. */
  const show = useCallback(() => {
    const bubble = ref.current?.parentElement;
    if (!bubble) return;
    const r = bubble.getBoundingClientRect();
    const box = bubble.closest('.wa-pane__scroll')?.getBoundingClientRect();
    const top = box ? box.top : 0;
    const bottom = box ? box.bottom : window.innerHeight;
    setOpen(r.top + r.height / 2 > (top + bottom) / 2 ? 'up' : 'down');
    onOpen();
  }, [onOpen]);

  // Long press on the message (touch and pen; a mouse has the ⋯).
  useEffect(() => {
    const bubble = ref.current?.parentElement;
    if (!bubble) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let from: { x: number; y: number } | null = null;
    let pressed = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as Element).closest?.('.wa-msgmenu')) return;
      from = { x: e.clientX, y: e.clientY };
      pressed = false;
      timer = setTimeout(() => {
        pressed = true;
        navigator.vibrate?.(12);
        show();
      }, 480);
    };
    const move = (e: PointerEvent) => {
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) clearTimeout(timer);
    };
    const up = () => {
      clearTimeout(timer);
      from = null;
    };
    // Android's own long-press menu (and text selection) gives way to this one.
    const context = (e: Event) => {
      if (pressed || from) e.preventDefault();
    };
    bubble.addEventListener('pointerdown', down);
    bubble.addEventListener('pointermove', move);
    bubble.addEventListener('pointerup', up);
    bubble.addEventListener('pointercancel', up);
    bubble.addEventListener('contextmenu', context);
    return () => {
      clearTimeout(timer);
      bubble.removeEventListener('pointerdown', down);
      bubble.removeEventListener('pointermove', move);
      bubble.removeEventListener('pointerup', up);
      bubble.removeEventListener('pointercancel', up);
      bubble.removeEventListener('contextmenu', context);
    };
  }, [show]);

  // Closes on a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (kind: TaskKind) => {
    setOpen(null);
    onStart(kind, m, btn.current);
  };

  return (
    <span ref={ref} className={`wa-msgacts${open ? ' is-open' : ''}`}>
      <button
        ref={btn}
        type="button"
        className="wa-msgacts__btn"
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-label="Message options"
        title="Make a reminder from this"
        onClick={() => (open ? setOpen(null) : show())}
      >
        ⋯
      </button>
      {open && (
        <span
          className={`wa-msgmenu wa-msgmenu--${open}`}
          role="menu"
          aria-label="This message"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            setOpen(null);
            btn.current?.focus();
          }}
          ref={(el) => {
            if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
          }}
        >
          <button type="button" role="menuitem" onClick={() => pick('callback')}>
            ⏰ Make a reminder from this
          </button>
          <button type="button" role="menuitem" onClick={() => pick('task')}>
            ✓ Make a task from this
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(null);
              void navigator.clipboard?.writeText(text).catch(() => {});
            }}
          >
            Copy text
          </button>
        </span>
      )}
    </span>
  );
});
