'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PushBanner } from '@/components/admin/PushBanner';
import { relativeTime } from '@/lib/enquiries';
import { windowOpen } from '@/lib/whatsapp/shared';
import '../whatsapp.css';

type Convo = {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  whatsapp_opt_in: boolean;
  wa_last_inbound_at: string | null;
  wa_last_message_at: string | null;
  wa_unread: number;
  created_at: string;
  last: { direction: string; body: string | null } | null;
  queued: boolean;
  chasing: boolean;
};

type Filter = 'all' | 'reply' | 'waiting';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['reply', 'Needs reply'],
  ['waiting', 'Waiting on them'],
];
const needsReply = (c: Convo) => c.last?.direction === 'in' && !c.queued;
const waitingOnThem = (c: Convo) => c.last?.direction === 'out' || (!c.last && c.chasing);

export function InboxList() {
  const [items, setItems] = useState<Convo[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/whatsapp/conversations', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the inbox');
      setItems(d.items);
      setConfigured(d.configured);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the inbox');
      setItems((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const shown = (items ?? []).filter(
    (c) =>
      (!q || `${c.name} ${c.phone || ''}`.toLowerCase().includes(q.trim().toLowerCase())) &&
      (filter === 'all' || (filter === 'reply' ? needsReply(c) : waitingOnThem(c)))
  );
  const count = (f: Filter) => (items ?? []).filter(f === 'reply' ? needsReply : f === 'waiting' ? waitingOnThem : () => true).length;

  return (
    <div className="wa-page">
      <div className="wa-top">
        <Link href="/admin/enquiries" className="wa-back">← Enquiries</Link>
        <Link href="/admin/enquiries/smart-replies" className="wa-link">Smart replies</Link>
      </div>
      <h1 className="wa-h1">WhatsApp</h1>
      <PushBanner />
      {!configured && (
        <p className="wa-banner">
          WhatsApp isn’t connected yet — conversations will appear here once the Meta keys are added
          (see WHATSAPP_SETUP.md).
        </p>
      )}
      {error && <p className="wa-banner wa-banner--err">{error}</p>}
      <input className="wa-search" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="wa-filters">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {label} <span>{count(f)}</span>
          </button>
        ))}
      </div>
      {items === null ? (
        <p className="wa-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="wa-muted">No WhatsApp conversations yet. Leads who message you, or opt in on a Meta form, show up here.</p>
      ) : (
        <ul className="wa-list">
          {shown.map((c) => {
            const open = windowOpen(c.wa_last_inbound_at);
            const preview = c.last
              ? `${c.last.direction === 'out' ? 'You: ' : ''}${c.last.body || ''}`
              : 'Opted in — not messaged yet';
            return (
              <li key={c.id}>
                <Link href={`/admin/enquiries/inbox/${c.id}`} className={`wa-row${c.wa_unread ? ' unread' : ''}`}>
                  <span className="wa-avatar">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="wa-row-main">
                    <span className="wa-row-top">
                      <b>{c.name}</b>
                      <span className="wa-time">{relativeTime(c.wa_last_message_at || c.created_at)}</span>
                    </span>
                    <span className="wa-row-bottom">
                      <span className="wa-preview">{preview}</span>
                      {c.queued && <span className="wa-chip">⏱ reply queued</span>}
                      {c.chasing && <span className="wa-chip wa-chip--chase">↻ chasing</span>}
                      {c.wa_unread > 0 && <span className="wa-badge">{c.wa_unread}</span>}
                    </span>
                    {!open && c.last && <span className="wa-closed">24h window closed · template only</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
