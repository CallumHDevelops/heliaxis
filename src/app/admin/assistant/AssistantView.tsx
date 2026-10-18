'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantAction } from '@/lib/assistant/tools';
import './assistant.css';

type Line = { role: 'user' | 'assistant'; text: string; actions?: AssistantAction[]; error?: boolean };
type Draft = {
  id: string;
  kind: 'email' | 'whatsapp';
  project_id: string | null;
  enquiry_id: string | null;
  subject: string | null;
  body: string;
  customer: string;
  to: string | null;
  by: string | null;
  created_at: string;
};

const STARTERS = [
  'What’s on today?',
  'Just left a survey with ',
  'Get Esther to send the EV guide to ',
  'Draft a WhatsApp chasing ',
];

/* Browser speech-to-text (Chrome / the Android app). Not in TypeScript's DOM types yet. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
function makeRecognition(): Recognition | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function AssistantView({ firstName }: { firstName: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [listening, setListening] = useState(false);
  const [canListen] = useState(() => !!makeRecognition());
  const rec = useRef<Recognition | null>(null);
  const base = useRef('');
  const end = useRef<HTMLDivElement>(null);

  const loadDrafts = useCallback(
    () =>
      fetch('/api/assistant/drafts')
        .then((r) => r.json())
        .then((d) => setDrafts(d.drafts ?? []))
        .catch(() => {}),
    []
  );

  useEffect(() => {
    fetch('/api/assistant')
      .then((r) => r.json())
      .then((d) => {
        setLines(d.messages ?? []);
        setConfigured(d.configured !== false);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [lines, busy]);

  function listen() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = makeRecognition();
    if (!r) return;
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    base.current = text ? `${text.trimEnd()} ` : '';
    r.onresult = (e) => {
      let finals = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript;
        else interim += res[0].transcript;
      }
      setText(base.current + finals + interim);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  async function send(msg = text) {
    const t = msg.trim();
    if (!t || busy) return;
    rec.current?.stop();
    setText('');
    setLines((l) => [...l, { role: 'user', text: t }]);
    setBusy(true);
    try {
      const r = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json().catch(() => ({}));
      setLines((l) => [
        ...l,
        r.ok
          ? { role: 'assistant', text: d.reply, actions: d.actions }
          : { role: 'assistant', text: d.error || 'Something went wrong.', error: true },
      ]);
      if (d.actions?.some((a: AssistantAction) => a.kind === 'draft')) loadDrafts();
    } catch {
      setLines((l) => [...l, { role: 'assistant', text: 'No connection — try again when you have signal.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function fresh() {
    if (!lines.length) return;
    setLines([]);
    await fetch('/api/assistant', { method: 'DELETE' }).catch(() => {});
  }

  return (
    <div className="as">
      <header className="as-head">
        <div>
          <h1>Claude</h1>
          <p>Tell me what happened and I’ll add the notes, tasks and drafts.</p>
        </div>
        {lines.length > 0 && (
          <button type="button" className="as-new" onClick={fresh}>
            New chat
          </button>
        )}
      </header>

      {!configured && (
        <p className="as-banner">
          The assistant switches on once <b>ANTHROPIC_API_KEY</b> is added in Vercel — it’s on your “From Claude” list on the
          dashboard.
        </p>
      )}

      <Drafts drafts={drafts} onChange={loadDrafts} />

      <div className="as-chat" aria-live="polite">
        {loaded && !lines.length && (
          <div className="as-empty">
            <p>
              {firstName ? `Hi ${firstName}. ` : ''}Talk to me like you would a colleague in the van — I’ll sort it into the
              CRM. Nothing goes to a customer until you press Send.
            </p>
            <div className="as-starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => (s.endsWith(' ') ? setText(s) : send(s))}
                >
                  {s.trim()}
                  {s.endsWith(' ') ? '…' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`as-msg is-${l.role}${l.error ? ' is-error' : ''}`}>
            <p>{l.text}</p>
            {l.actions && l.actions.length > 0 && (
              <ul className="as-actions">
                {l.actions.map((a, j) => (
                  <li key={j}>
                    <Link href={a.href} className={`as-chip is-${a.kind}`}>
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && (
          <div className="as-msg is-assistant is-busy" aria-label="Claude is working">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="as-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={listening ? 'Listening…' : 'Message Claude'}
          rows={text.length > 80 ? 4 : 1}
        />
        {canListen && (
          <button
            type="button"
            className={`as-mic${listening ? ' is-on' : ''}`}
            onClick={listen}
            aria-label={listening ? 'Stop dictating' : 'Dictate'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
        )}
        <button type="submit" className="as-send" disabled={busy || !text.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** Emails and WhatsApps Claude wrote, waiting for a person to check and send. */
function Drafts({ drafts, onChange }: { drafts: Draft[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!drafts.length) return null;
  return (
    <section className="as-drafts" aria-label="Drafts to check">
      <h2>
        {drafts.length} draft{drafts.length === 1 ? '' : 's'} to check
      </h2>
      {drafts.map((d) => (
        <DraftCard key={d.id} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} onDone={onChange} />
      ))}
    </section>
  );
}

function DraftCard({ d, open, onToggle, onDone }: { d: Draft; open: boolean; onToggle: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState(d.subject || '');
  const [body, setBody] = useState(d.body);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const patch = (b: Record<string, unknown>) =>
    fetch(`/api/assistant/drafts/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });

  async function send() {
    setState('sending');
    setError('');
    const r =
      d.kind === 'email'
        ? await fetch(`/api/crm/projects/${d.project_id}/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, text: body }),
          }).catch(() => null)
        : await fetch(`/api/whatsapp/conversations/${d.enquiry_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: body }),
          }).catch(() => null);
    const res = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setState('idle');
      setError(res?.error || 'Not sent — check your connection.');
      return;
    }
    await patch({ status: 'sent', subject, body });
    setState('sent');
    setTimeout(onDone, 900);
  }

  async function discard() {
    await patch({ status: 'discarded' });
    onDone();
  }

  return (
    <article id={`draft-${d.id}`} className={`as-draft${open ? ' is-open' : ''}`}>
      <button type="button" className="as-draft-head" onClick={onToggle} aria-expanded={open}>
        <span className={`as-kind is-${d.kind}`}>{d.kind === 'email' ? 'Email' : 'WhatsApp'}</span>
        <span className="as-draft-who">
          <b>{d.customer}</b>
          <small>{d.kind === 'email' ? subject || '(no subject)' : body.slice(0, 60)}</small>
        </span>
        <span className="as-chev" aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="as-draft-body">
          <p className="as-to">
            To {d.to || '—'}
            {d.by ? ` · for ${d.by.split(' ')[0]}` : ''}
          </p>
          {d.kind === 'email' && (
            <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" placeholder="Subject" />
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={d.kind === 'email' ? 10 : 5} aria-label="Message" />
          {error && (
            <p className="as-err">
              {error}
              {d.kind === 'whatsapp' && d.enquiry_id && (
                <>
                  {' '}
                  <Link href={`/admin/enquiries/inbox/${d.enquiry_id}`}>Open the chat</Link>
                </>
              )}
            </p>
          )}
          <div className="as-draft-actions">
            <button type="button" className="as-btn is-primary" onClick={send} disabled={state !== 'idle' || !body.trim()}>
              {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent ✓' : 'Send'}
            </button>
            {d.project_id && (
              <Link href={`/admin/crm/${d.project_id}`} className="as-btn">
                Customer
              </Link>
            )}
            <button type="button" className="as-btn is-quiet" onClick={discard} disabled={state !== 'idle'}>
              Discard
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
