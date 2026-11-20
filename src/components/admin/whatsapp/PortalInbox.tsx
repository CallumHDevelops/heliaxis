'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PortalThread } from '@/app/api/crm/portal-messages/route';
import { initialsOf } from './dock-shared';

type Msg = { id: string; direction: 'in' | 'out'; body: string; created_at: string; by: string | null; read: boolean };

/**
 * The customer portal's conversations, in the messages dock beside WhatsApp (the Portal tab): who has
 * written from their portal, unread first, and the conversation with a reply box. A reply goes into their
 * portal and they're emailed and texted to say so (api/crm/projects/[id]/portal-messages).
 */

/** The dock's Portal list, polled while the dock shows. `unread`: people with something unread. */
export function usePortalThreads(on: boolean) {
  const [data, setData] = useState<{ threads: PortalThread[]; unread: number } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/crm/portal-messages', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [on, load]);
  return { data, reload: load };
}

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function PortalInbox({ threads, reload, open, onOpen }: { threads: PortalThread[] | null; reload: () => Promise<void>; open: string | null; onOpen: (projectId: string | null) => void }) {
  const row = open ? threads?.find((t) => t.projectId === open) : null;
  if (open) return <PortalThreadView projectId={open} name={row?.name ?? 'Customer'} refNo={row?.ref ?? null} onBack={() => onOpen(null)} onChange={reload} />;
  if (!threads) return <p className="hxd-empty">Loading portal messages…</p>;
  if (!threads.length) return <p className="hxd-empty">No portal messages yet. When a customer writes from their project page, it appears here.</p>;
  return (
    <ul className="hxd-rows">
      {threads.map((t) => (
        <li key={t.projectId} className={t.unread ? 'hxd-row is-unread' : 'hxd-row'}>
          <button type="button" className="hxd-row__link hxd-pt-row" onClick={() => onOpen(t.projectId)}>
            <span className="hxd-av" aria-hidden="true">
              {initialsOf(t.name)}
            </span>
            <span className="hxd-row__b">
              <span className="hxd-row__h">
                <b>{t.name}</b>
                <time>{when(t.last.at)}</time>
              </span>
              <span className="hxd-row__p">
                <span>
                  {t.last.fromCustomer ? '' : 'You: '}
                  {t.last.body}
                </span>
                {t.unread > 0 && <em className="hxd-pt-count">{t.unread}</em>}
              </span>
              <span className="hxd-pt-tags">
                {t.ref && <small>{t.ref}</small>}
                {t.needsReply && <small className="hxd-pt-wait">Needs a reply</small>}
                {t.last.body.startsWith('Complaint:') && <small className="hxd-pt-complaint">Complaint</small>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PortalThreadView({ projectId, name, refNo, onBack, onChange }: { projectId: string; name: string; refNo: string | null; onBack: () => void; onChange: () => Promise<void> }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    // Opening it marks their messages as read.
    const r = await fetch(`/api/crm/projects/${projectId}/portal-messages`, { cache: 'no-store' }).catch(() => null);
    const d = r?.ok ? await r.json() : { messages: [] };
    setMessages(d.messages || []);
  }, [projectId]);
  useEffect(() => {
    void load().then(() => onChange());
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function send() {
    setBusy(true);
    setErr('');
    setNote('');
    const r = await fetch(`/api/crm/projects/${projectId}/portal-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d.error || 'Not sent. Try again.');
    setText('');
    setNote(d.emailed || d.texted ? `Sent. We ${[d.emailed ? 'emailed' : '', d.texted ? 'texted' : ''].filter(Boolean).join(' and ')} them to say so.` : 'Sent in their portal. No email or text went (we have neither), so tell them on WhatsApp.');
    await load();
    await onChange();
  }

  return (
    <div className="hxd-pt">
      <div className="hxd-pt__bar">
        <button type="button" className="hxd-back" onClick={onBack} aria-label="Back to portal messages">
          ←
        </button>
        <div>
          <b>{name}</b>
          <small>Portal messages{refNo ? ` · ${refNo}` : ''}</small>
        </div>
        <Link href={`/admin/crm/${projectId}`} className="hxd__all">
          Open job ↗
        </Link>
      </div>
      <div className="hxd-pt__log">
        {messages === null ? (
          <p className="hxd-empty">Loading…</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`hxd-pt__msg ${m.direction === 'out' ? 'is-out' : 'is-in'}${m.body.startsWith('Complaint:') ? ' is-complaint' : ''}`}>
              <small>
                {m.direction === 'out' ? m.by || 'Heliaxis' : name.split(/\s+/)[0]} · {new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </small>
              <span>{m.body}</span>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      <div className="hxd-pt__reply">
        <textarea
          rows={3}
          placeholder="Reply in their portal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && !busy) void send();
          }}
        />
        {err && <p className="hxd-problem">{err}</p>}
        {note && <p className="hxd-pt__note">{note}</p>}
        <button type="button" className="hxd-btn" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}
