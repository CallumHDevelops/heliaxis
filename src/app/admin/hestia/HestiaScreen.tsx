'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HestiaIcon } from '@/components/admin/HestiaIcon';
import type { AssistantAction } from '@/lib/assistant/tools';
import { useDictation } from '@/lib/assistant/useDictation';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import { withLinks } from '../assistant/links';
import '../crm/crm.css';
import '../sales/quotes/quotes.css';
import './hestia.css';

/*
 * Hestia full-screen: what the app's launcher, shortcut and widget open (heliaxis://hestia/…). A
 * conversation and a composer, nothing else on the screen; her replies stream in as she writes them.
 * The same Hestia, tools and conversations as /admin/assistant (src/lib/assistant).
 */

type Line = {
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
  /** Still coming in. */
  live?: boolean;
  /** What she's doing right now ("Looking up customers"), while live. */
  doing?: string;
  error?: boolean;
  /** For a failed message: the words to send again. */
  retry?: string;
};

/** Her tools, in words, while she uses them. */
const DOING: Record<string, string> = {
  search_customers: 'Looking up customers',
  get_customer: 'Reading the customer’s record',
  my_day: 'Checking your day',
  list_team: 'Checking the team',
  create_task: 'Adding a task',
  add_note: 'Adding a note',
  set_next_step: 'Setting the next step',
  draft_email: 'Writing an email',
  draft_whatsapp: 'Writing a WhatsApp',
  search_help: 'Checking the Help guides',
  find_organisation: 'Looking up organisations',
  find_contact: 'Looking up contacts',
  add_contact: 'Adding a contact',
  create_opportunity: 'Adding a customer',
};

const STARTERS = ['What’s on today?', 'Just left a site visit with ', 'Remind me to '];

export function HestiaScreen({
  firstName,
  configured,
  threadId,
  initial,
  voice,
}: {
  firstName: string;
  configured: boolean;
  threadId: string | null;
  initial: { role: 'user' | 'assistant'; text: string }[];
  /** Opened with "Talk": switch the mic on straight away. */
  voice: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const thread = useRef<string | null>(threadId);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const { canListen, listening, toggle, hush } = useDictation(text, setText);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  // "Talk": the mic on as soon as the page is up. If Chrome wants a tap first, the big mic is right there.
  const started = useRef(false);
  useEffect(() => {
    if (!voice || started.current || !canListen) return;
    started.current = true;
    toggle();
    // The address loses ?voice=1, so coming back to this page doesn't switch the mic on again.
    window.history.replaceState(null, '', window.location.pathname);
  }, [voice, canListen, toggle]);

  /** Changes the last line (Hestia's reply in progress). */
  const patchLast = (f: (l: Line) => Line) => setLines((ls) => (ls.length ? [...ls.slice(0, -1), f(ls[ls.length - 1])] : ls));

  async function send(msg = text) {
    const t = msg.trim();
    if (!t || busy) return;
    // Sent: anything the mic hears after this mustn't put the words back in the box.
    hush();
    setText('');
    // Sending again after a failure: the failed reply goes.
    setLines((ls) => [...ls.filter((l) => !(l.error && l.retry === t)), { role: 'user', text: t }, { role: 'assistant', text: '', live: true }]);
    setBusy(true);
    const fail = (error: string) => patchLast((l) => ({ ...l, live: false, doing: undefined, error: true, retry: t, text: l.text ? `${l.text}\n\n${error}` : error }));
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thread.current ? { text: t, thread_id: thread.current, stream: true } : { text: t, new: true, stream: true }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        fail(r.status === 401 ? 'You’ve been signed out. Sign in again and send it once more.' : d.error || 'Something went wrong.');
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let gap = false; // she's on a new step: her next words start a new paragraph
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const raw = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!raw.trim()) continue;
          const e = JSON.parse(raw);
          if (e.t === 'text') {
            const sep = gap;
            gap = false;
            patchLast((l) => ({ ...l, doing: undefined, text: l.text + (sep && l.text ? '\n\n' : '') + e.d }));
          } else if (e.t === 'step') gap = true;
          else if (e.t === 'tool') patchLast((l) => ({ ...l, doing: DOING[e.name] ?? 'Working on it' }));
          else if (e.t === 'action') patchLast((l) => ({ ...l, actions: [...(l.actions ?? []), e.a] }));
          else if (e.t === 'done') {
            finished = true;
            if (e.thread_id && e.thread_id !== thread.current) {
              thread.current = e.thread_id;
              // Reloading or coming back to this page carries on this conversation.
              window.history.replaceState(null, '', `/admin/hestia/thread/${e.thread_id}`);
            }
            patchLast((l) => ({ ...l, live: false, doing: undefined, text: e.refused || !l.text.trim() ? e.reply : l.text }));
          } else if (e.t === 'error') {
            finished = true;
            fail(e.error || 'Hestia didn’t answer.');
          }
        }
      }
      if (!finished) fail('The signal dropped before Hestia finished.');
    } catch {
      fail('No connection. Try again when you have signal.');
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    if (busy) return;
    hush();
    thread.current = null;
    setLines([]);
    setText('');
    window.history.replaceState(null, '', '/admin/hestia/new');
    box.current?.focus();
  }

  return (
    <div className="hs crm">
      <header className="hs-head">
        <Link href="/admin/assistant" className="hs-back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <HestiaIcon size={36} />
        <div className="hs-title">
          <b>Hestia</b>
          <small>{busy ? 'Working on it…' : 'Your assistant'}</small>
        </div>
        {lines.length > 0 && (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={startNew} disabled={busy}>
            New chat
          </button>
        )}
      </header>

      <main className="hs-chat" aria-live="polite">
        {!configured && (
          <p className="hs-banner">
            Hestia switches on once <b>ANTHROPIC_API_KEY</b> is added in Vercel.
          </p>
        )}
        {!lines.length && (
          <div className="hs-empty">
            <HestiaIcon size={72} />
            <p>{firstName ? `Hi ${firstName}. What’s happened?` : 'What’s happened?'}</p>
            <small>Tell me about a visit, a call or what needs doing. Nothing goes to a customer until you press Send.</small>
            <div className="hs-starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="crm-btn crm-btn--ghost"
                  onClick={() => {
                    if (s.endsWith(' ')) {
                      setText(s);
                      box.current?.focus();
                    } else void send(s);
                  }}
                >
                  {s.trim()}
                  {s.endsWith(' ') ? '…' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`hs-msg is-${l.role}${l.error ? ' is-error' : ''}`}>
            {l.role === 'assistant' && l.live && !l.text && <WritingSpark label="Hestia is working" steps={[l.doing ?? 'Thinking']} />}
            {(l.text || !l.live) && <p>{l.role === 'assistant' ? withLinks(l.text) : l.text}</p>}
            {l.live && l.text && l.doing && <small className="hs-doing">{l.doing}…</small>}
            {l.actions && l.actions.length > 0 && (
              <ul className="hs-actions">
                {l.actions.map((a, j) => (
                  <li key={j}>
                    <Link href={a.href} className="crm-btn crm-btn--ghost crm-btn--small">
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {l.error && l.retry && (
              <button type="button" className="crm-btn crm-btn--solar crm-btn--small hs-retry" onClick={() => void send(l.retry)} disabled={busy}>
                {busy ? 'Sending…' : 'Try again'}
              </button>
            )}
          </div>
        ))}
        <div ref={end} />
      </main>

      <form
        className="hs-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={listening ? 'Listening…' : 'Message Hestia'}
          rows={text.length > 60 ? 4 : 1}
          aria-label="Message Hestia"
        />
        {text.trim() ? (
          <button type="submit" className="hs-round hs-send" disabled={busy} aria-label={busy ? 'Sending' : 'Send'}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        ) : null}
        {canListen && (
          <button
            type="button"
            className={`hs-round hs-mic${listening ? ' is-on' : ''}`}
            onClick={toggle}
            aria-label={listening ? 'Stop listening' : 'Talk'}
            aria-pressed={listening}
          >
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
